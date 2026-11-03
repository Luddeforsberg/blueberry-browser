import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { Response } from "express";
import { ServerError, type ServerSession } from "../../src/main/galleryServer";
import { AGE_LIMIT_MS, IDLE_LIMIT_MS, RelayAuth, redirectAllowed, type RelayAuthOptions } from "./relayAuth";

const OWNER = "owner@example.com";
const RESOURCE = new URL("https://relay.example/mcp");
const SECRET = "s".repeat(40);
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const DAY = 24 * 60 * 60_000;

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

// Supabase and the database's grants, faked: what was signed in, signed out, made and revoked.
const setUp = (extra: Partial<RelayAuthOptions> = {}) => {
  const seen = { signIns: [] as string[], signOuts: [] as string[], created: [] as string[], revoked: [] as string[] };
  let made = 0;
  let clock = Date.now();
  const options: RelayAuthOptions = {
    secret: SECRET,
    resource: RESOURCE,
    owner: OWNER,
    server: {
      signIn: async (email: string, password: string): Promise<ServerSession> => {
        seen.signIns.push(email);
        if (password !== "pw") throw new ServerError(400, "invalid_credentials");
        return { accessToken: "owner-access", refreshToken: "owner-refresh", expiresAt: clock + 3600_000, email };
      },
      signOut: async (token: string) => void seen.signOuts.push(token),
    },
    grants: {
      create: async (token) => (seen.created.push(token), `grant-secret-${++made}`),
      revoke: async (secret) => void seen.revoked.push(secret),
    },
    now: () => clock,
    ...extra,
  };
  return { options, seen, auth: new RelayAuth(options), advance: (ms: number) => (clock += ms) };
};

const formFor = async (auth: RelayAuth) => {
  const client = await auth.clientsStore.registerClient!({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
  let html = "";
  const res = { status: () => res, type: () => res, send: (text: string) => void (html = text) } as unknown as Response;
  await auth.authorize(client, { redirectUri: REDIRECT, codeChallenge: "challenge", state: "s" }, res);
  return { client, request: /name="request" value="([^"]+)"/.exec(html)![1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))) };
};

// Through the whole flow by hand, as the SDK's handlers would call it.
const connect = async (auth: RelayAuth) => {
  const { client, request } = await formFor(auth);
  const answer = await auth.signIn({ request, email: OWNER, password: "pw" }, "1.2.3.4");
  if (!("redirect" in answer)) throw new Error(answer.page);
  const code = new URL(answer.redirect).searchParams.get("code")!;
  expect(await auth.challengeForAuthorizationCode(client, code)).toBe("challenge");
  return { client, tokens: await auth.exchangeAuthorizationCode(client, code, undefined, REDIRECT) };
};

describe("RelayAuth", () => {
  it("uses the owner's session once for a grant, signs it out, and keeps only the grant", async () => {
    folder = mkdtempSync(join(tmpdir(), "relay-"));
    const stateFile = join(folder, "relay.json");
    const { auth, seen, options } = setUp({ stateFile });
    const { tokens } = await connect(auth);
    expect(seen.created).toEqual(["owner-access"]);
    expect(seen.signOuts).toEqual(["owner-access"]);
    const kept = readFileSync(stateFile, "utf8");
    for (const plain of ["owner-access", "owner-refresh", "grant-secret-1", tokens.access_token, tokens.refresh_token!]) expect(kept).not.toContain(plain);

    // Across a restart with the same secret, the connection and its grant are still there.
    const restarted = new RelayAuth(options);
    const info = await restarted.verifyAccessToken(tokens.access_token);
    expect(restarted.secretOf(String(info.extra!.grantId))).toBe("grant-secret-1");
    await expect(new RelayAuth({ ...options, secret: "t".repeat(40) }).verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });

  it("ends the whole connection when a used refresh token comes back", async () => {
    const { auth, seen } = setUp();
    const { client, tokens } = await connect(auth);
    const next = await auth.exchangeRefreshToken(client, tokens.refresh_token!);
    await expect(auth.exchangeRefreshToken(client, tokens.refresh_token!)).rejects.toThrow(/already used/);
    expect(seen.revoked).toEqual(["grant-secret-1"]);
    await expect(auth.exchangeRefreshToken(client, next.refresh_token!)).rejects.toThrow();
    await expect(auth.verifyAccessToken(next.access_token)).rejects.toThrow();
  });

  it("ends a connection unused for 30 days", async () => {
    const { auth, seen, advance } = setUp();
    const { client, tokens } = await connect(auth);
    advance(IDLE_LIMIT_MS + DAY);
    await expect(auth.exchangeRefreshToken(client, tokens.refresh_token!)).rejects.toThrow(/run out/);
    expect(seen.revoked).toEqual(["grant-secret-1"]);
  });

  it("ends a connection 90 days on, however much it's used", async () => {
    const { auth, advance } = setUp();
    const connected = await connect(auth);
    let { tokens } = connected;
    // Used every 20 days, so never idle, up to day 80.
    for (let day = 20; day <= 80; day += 20) {
      advance(20 * DAY);
      tokens = await auth.exchangeRefreshToken(connected.client, tokens.refresh_token!);
    }
    await expect(auth.verifyAccessToken(tokens.access_token)).resolves.toBeTruthy();
    advance(AGE_LIMIT_MS - 80 * DAY + DAY);
    await expect(auth.verifyAccessToken(tokens.access_token)).rejects.toThrow();
    await expect(auth.exchangeRefreshToken(connected.client, tokens.refresh_token!)).rejects.toThrow(/run out/);
  });

  it("refuses strangers without sending anything or using up the owner's tries", async () => {
    const { auth, seen } = setUp();
    const { request } = await formFor(auth);
    for (let n = 0; n < 100; n++) {
      const answer = await auth.signIn({ request, email: `someone${n}@example.com`, password: "pw" }, "6.6.6.6");
      expect("page" in answer && answer.page).toContain("Only the Blueberry account");
    }
    expect(seen.signIns).toEqual([]);
    expect("redirect" in (await auth.signIn({ request, email: OWNER, password: "pw" }, "6.6.6.6"))).toBe(true);
  });

  it("limits the owner's tries per address and in all", async () => {
    const { auth, advance } = setUp();
    const { request } = await formFor(auth);
    const tryFrom = (from: string, password = "wrong") => auth.signIn({ request, email: OWNER, password }, from);
    for (let n = 0; n < 10; n++) expect(await tryFrom("1.1.1.1").then((a) => "page" in a && a.page)).toContain("didn");
    expect(await tryFrom("1.1.1.1", "pw").then((a) => "page" in a && a.page)).toContain("Too many tries");
    for (let n = 0; n < 20; n++) await tryFrom(`2.2.2.${n}`);
    expect(await tryFrom("3.3.3.3", "pw").then((a) => "page" in a && a.page)).toContain("Too many tries");
    advance(16 * 60_000);
    const fresh = await formFor(auth);
    expect("redirect" in (await auth.signIn({ request: fresh.request, email: OWNER, password: "pw" }, "1.1.1.1"))).toBe(true);
  });

  it("says to set up the cloud first when the database won't make a grant", async () => {
    const { auth, seen } = setUp({ grants: { create: async () => Promise.reject(new ServerError(400, "")), revoke: async () => {} } });
    const { request } = await formFor(auth);
    const answer = await auth.signIn({ request, email: OWNER, password: "pw" }, "1.2.3.4");
    expect("page" in answer && answer.page).toContain("Settings &#62; Cloud");
    expect(seen.signOuts).toEqual(["owner-access"]);
  });

  it("refuses a client id or form it didn't sign", async () => {
    const { auth } = setUp();
    const client = await auth.clientsStore.registerClient!({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
    const [body] = client.client_id.split(".");
    expect(await auth.clientsStore.getClient(`${body}.forged`)).toBeUndefined();
    expect(await auth.clientsStore.getClient(client.client_id)).toMatchObject({ redirect_uris: [REDIRECT] });
    const answer = await auth.signIn({ request: client.client_id, email: OWNER, password: "pw" }, "1.2.3.4");
    expect("page" in answer && answer.page).toContain("run out");
  });

  it("allows only ChatGPT, Claude and loopback redirects", () => {
    expect(redirectAllowed(REDIRECT)).toBe(true);
    expect(redirectAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectAllowed("http://localhost:33418/callback")).toBe(true);
    expect(redirectAllowed("http://chatgpt.com/x")).toBe(false);
    expect(redirectAllowed("https://chatgpt.com.evil.example/x")).toBe(false);
  });
});
