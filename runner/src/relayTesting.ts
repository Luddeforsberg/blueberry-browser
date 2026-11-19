import { createHash, randomBytes } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { startFakeSupabase } from "../../tests/fakeSupabase";
import { supabaseDb, runnerSession, type DbConfig } from "./db";
import { relayApp, relayConfig } from "./relay";
import { defined } from "../../src/shared/testing";

// What relay.test.ts uses: the relay in front of the fake Supabase on the real migrations, with the owner, the runner and
// a stranger signed up, and ways in as each.

export const OWNER = "owner@example.com";
export const RUNNER = "runner@example.com";
export const STRANGER = "someone@example.com";
const PASSWORD = "a long password";
export const REDIRECT = "http://127.0.0.1:9/callback";

export let supabase: Awaited<ReturnType<typeof startFakeSupabase>>;
let server: Server;
export let origin: string;
export let runnerDb: ReturnType<typeof supabaseDb>;

export const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

export const asOwner = async (name: string, body: object) => {
  const { url, key } = { url: supabase.env.SUPABASE_URL, key: supabase.env.SUPABASE_PUBLISHABLE_KEY };
  const session = await (
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email: OWNER, password: PASSWORD }),
    })
  ).json();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
};

export const register = async (redirect = REDIRECT) =>
  fetch(`${origin}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: "none", client_name: "Test" }),
  });

// Opens the sign-in page for an authorize address, as a browser would, and sends the form.
export const signInAt = async (authorizeUrl: string, email: string, password = PASSWORD) => {
  const page = await (await fetch(authorizeUrl)).text();
  const request = /name="request" value="([^"]+)"/.exec(page)?.[1];
  if (!request) throw new Error(`No form: ${page.slice(0, 200)}`);
  return fetch(`${origin}/sign-in`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request, email, password }),
  });
};

export const authorizeUrl = (clientId: string, challenge: string) =>
  `${origin}/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: `${origin}/mcp` })}`;

export const token = (body: Record<string, string>) =>
  fetch(`${origin}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

// Starts it all before the file's first test, and stops it after its last.
export const setUpRelay = () => {
  beforeAll(async () => {
    supabase = await startFakeSupabase({ cloudJobs: true });
    for (const email of [OWNER, RUNNER, STRANGER]) await supabase.addAccount(email, PASSWORD);
    const config: DbConfig = {
      url: supabase.env.SUPABASE_URL,
      key: supabase.env.SUPABASE_PUBLISHABLE_KEY,
      email: RUNNER,
      password: PASSWORD,
      owner: OWNER,
    };
    expect(await asOwner("link_cloud_runner", { p_email: RUNNER })).toBe(true);
    runnerDb = supabaseDb(config, runnerSession(config));
    expect(await runnerDb.accept()).toBe(true);
    await asOwner("sync_cloud_mascots", {
      p_mascots: [
        {
          id: "scout",
          name: "Scout",
          palette: "robin",
          accessory: "none",
          instructions: "Finds prices.",
          sites: ["shop.example"],
          tools: ["visit", "click"],
          from_gallery: false,
        },
      ],
    });
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const relay = relayConfig({ RELAY_PUBLIC_URL: origin, RELAY_SECRET: "x".repeat(40) });
    if (!relay || typeof relay === "string") throw new Error(String(relay));
    server.on("request", relayApp(relay, config, runnerDb).app);
  }, 60_000);

  afterAll(() => {
    server?.close();
    supabase?.close();
  });
};

// An MCP client from the SDK, going through OAuth as ChatGPT or Claude would, with the browser step done by hand.
export const connect = async () => {
  let saved: OAuthClientInformationMixed | undefined;
  let tokens: OAuthTokens | undefined;
  let verifier = "";
  let code: string | null = null;
  const provider: OAuthClientProvider = {
    redirectUrl: REDIRECT,
    clientMetadata: {
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      client_name: "SDK test",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    clientInformation: () => saved,
    saveClientInformation: (info) => void (saved = info),
    tokens: () => tokens,
    saveTokens: (next) => void (tokens = next),
    redirectToAuthorization: async (url) => {
      const answer = await signInAt(url.href, OWNER);
      code = new URL(answer.headers.get("location")!).searchParams.get("code");
    },
    saveCodeVerifier: (next) => void (verifier = next),
    codeVerifier: () => verifier,
  };
  const url = new URL(`${origin}/mcp`);
  const first = new StreamableHTTPClientTransport(url, { authProvider: provider });
  await expect(new Client({ name: "test", version: "1" }).connect(first)).rejects.toBeInstanceOf(UnauthorizedError);
  expect(code).toBeTruthy();
  await first.finishAuth(code!);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }));
  return client;
};

export const textOf = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  defined((result.content as { type: string; text: string }[])[0]).text;
export const dataOf = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse(textOf(result).replace(/^[^[{]*/, ""));
