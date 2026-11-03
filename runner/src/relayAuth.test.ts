import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { Response } from "express";
import type { GalleryServer, ServerSession } from "../../src/main/galleryServer";
import { ServerError } from "../../src/main/galleryServer";
import { RelayAuth, redirectAllowed } from "./relayAuth";

const OWNER = "owner@example.com";
const RESOURCE = new URL("https://relay.example/mcp");
const SECRET = "s".repeat(40);
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

const session = (n: number): ServerSession => ({ accessToken: `supa-access-${n}`, refreshToken: `supa-refresh-${n}`, expiresAt: Date.now() + 3600_000, email: OWNER });

const fakeServer = () => {
  const calls = { signIn: 0, refresh: [] as string[] };
  let next = 1;
  let refuse = false;
  const server = {
    signIn: async () => (calls.signIn++, session(next++)),
    refresh: async (token: string) => {
      calls.refresh.push(token);
      if (refuse) throw new ServerError(400, "refresh_token_not_found");
      return session(next++);
    },
  } as unknown as GalleryServer;
  return { server, calls, refuseRefresh: () => (refuse = true) };
};

// Through the whole flow by hand, as the SDK's handlers would call it.
const connect = async (auth: RelayAuth) => {
  const client = await auth.clientsStore.registerClient!({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
  let html = "";
  const res = { status: () => res, type: () => res, send: (text: string) => void (html = text) } as unknown as Response;
  await auth.authorize(client, { redirectUri: REDIRECT, codeChallenge: "challenge", state: "s" }, res);
  const request = /name="request" value="([^"]+)"/.exec(html)![1];
  const answer = await auth.signIn({ request, email: OWNER, password: "pw" }, "1.2.3.4");
  if (!("redirect" in answer)) throw new Error("No redirect");
  const code = new URL(answer.redirect).searchParams.get("code")!;
  expect(await auth.challengeForAuthorizationCode(client, code)).toBe("challenge");
  return auth.exchangeAuthorizationCode(client, code, undefined, REDIRECT);
};

describe("RelayAuth", () => {
  it("keeps connections sealed across a restart, and only with the same secret", async () => {
    folder = mkdtempSync(join(tmpdir(), "relay-"));
    const stateFile = join(folder, "relay.json");
    const { server, calls } = fakeServer();
    const tokens = await connect(new RelayAuth({ secret: SECRET, resource: RESOURCE, owner: OWNER, server, stateFile }));
    const kept = readFileSync(stateFile, "utf8");
    // Neither the user's refresh token nor the relay's own tokens are in the file as they are.
    expect(kept).not.toContain("supa-refresh-1");
    expect(kept).not.toContain(tokens.access_token);

    const restarted = new RelayAuth({ secret: SECRET, resource: RESOURCE, owner: OWNER, server, stateFile });
    const info = await restarted.verifyAccessToken(tokens.access_token);
    // The Supabase access token was memory only, so it refreshes with the kept refresh token, once for callers at once.
    const [a, b] = await Promise.all([restarted.userToken(String(info.extra!.grantId)), restarted.userToken(String(info.extra!.grantId))]);
    expect(a).toBe("supa-access-2");
    expect(b).toBe(a);
    expect(calls.refresh).toEqual(["supa-refresh-1"]);

    const otherSecret = new RelayAuth({ secret: "t".repeat(40), resource: RESOURCE, owner: OWNER, server, stateFile });
    await expect(otherSecret.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });

  it("ends a connection whose Supabase session is refused", async () => {
    const { server, refuseRefresh } = fakeServer();
    const auth = new RelayAuth({ secret: SECRET, resource: RESOURCE, owner: OWNER, server });
    const tokens = await connect(auth);
    const grantId = String((await auth.verifyAccessToken(tokens.access_token)).extra!.grantId);
    auth.resetUserToken(grantId);
    refuseRefresh();
    await expect(auth.userToken(grantId)).rejects.toThrow();
    await expect(auth.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });

  it("refuses a client id or form it didn't sign", async () => {
    const { server } = fakeServer();
    const auth = new RelayAuth({ secret: SECRET, resource: RESOURCE, owner: OWNER, server });
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
