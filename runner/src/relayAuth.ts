import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTargetError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { GalleryServer, ServerError, Unreachable, type ServerSession } from "../../src/main/galleryServer";

// OAuth for the relay, so ChatGPT and Claude start jobs as the user, never as the runner. The user signs in on a page
// served here with their Blueberry email and password, which go to Supabase and nowhere else: never to a log or the
// disk. Only the account the runner is linked to may. ChatGPT and Claude get the relay's own random tokens, and the
// user's Supabase refresh token stays here, in memory and, with a state file, sealed with RELAY_SECRET. Registered
// clients are signed rather than kept, so they survive a redeploy without any storage.

const ACCESS_TTL_S = 60 * 60;
const CODE_TTL_MS = 5 * 60_000;
const FORM_TTL_MS = 15 * 60_000;
const SUPABASE_REFRESH_BEFORE_MS = 60_000;
const MAX_GRANTS = 20;
const MAX_CODES = 50;
const MAX_JOBS_PER_GRANT = 200;
const MAX_REDIRECTS = 5;
// A light limit on sign-in tries, per address and in all.
const TRIES_WINDOW_MS = 15 * 60_000;
const TRIES_PER_ADDRESS = 10;
const TRIES_IN_ALL = 50;

// Where a sign-in may send its code: ChatGPT and Claude, or an app on the same computer as the browser.
const REDIRECT_HOSTS = ["chatgpt.com", "claude.ai", "claude.com"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export const redirectAllowed = (uri: string): boolean => {
  try {
    const { protocol, hostname } = new URL(uri);
    if (protocol === "http:") return LOOPBACK.includes(hostname);
    return protocol === "https:" && (REDIRECT_HOSTS.includes(hostname) || LOOPBACK.includes(hostname));
  } catch {
    return false;
  }
};

const appName = (uri: string): string => {
  const host = new URL(uri).hostname;
  return host === "chatgpt.com" ? "ChatGPT" : host.startsWith("claude") ? "Claude" : "An app on your computer";
};

const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");
const hash = (token: string) => createHash("sha256").update(token).digest("base64url");
const newToken = (kind: string) => `bb_${kind}_${randomBytes(32).toString("base64url")}`;

const keysFrom = (secret: string) => ({
  sign: Buffer.from(hkdfSync("sha256", secret, "blueberry-relay", "sign", 32)),
  seal: Buffer.from(hkdfSync("sha256", secret, "blueberry-relay", "seal", 32)),
});
type Keys = ReturnType<typeof keysFrom>;

const mac = (keys: Keys, text: string) => createHmac("sha256", keys.sign).update(text).digest();
const signed = (keys: Keys, data: object) => {
  const body = b64(JSON.stringify(data));
  return `${body}.${b64(mac(keys, body))}`;
};
const unsigned = (keys: Keys, text: unknown): Record<string, unknown> | null => {
  if (typeof text !== "string" || text.length > 8000) return null;
  const [body, tag, extra] = text.split(".");
  if (!body || !tag || extra !== undefined) return null;
  const given = Buffer.from(tag, "base64url");
  const wanted = mac(keys, body);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

export const seal = (keys: Keys, text: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.seal, iv);
  const sealed = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return b64(Buffer.concat([iv, cipher.getAuthTag(), sealed]));
};
export const unseal = (keys: Keys, text: string): string | null => {
  try {
    const all = Buffer.from(text, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keys.seal, all.subarray(0, 12));
    decipher.setAuthTag(all.subarray(12, 28));
    return Buffer.concat([decipher.update(all.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
};

// One connection from ChatGPT or Claude, as the user who signed in.
interface Grant {
  id: string;
  clientId: string;
  email: string;
  // The user's Supabase refresh token, which changes each time it's used.
  supabaseRefresh: string;
  accessHash: string;
  accessExpiresAt: number;
  refreshHash: string;
  // Jobs started through this connection, the only ones it can see.
  jobs: string[];
}

interface Code {
  clientId: string;
  redirectUri: string;
  challenge: string;
  session: ServerSession;
  expiresAt: number;
}

export interface RelayAuthOptions {
  secret: string;
  // The address of the MCP endpoint, which every token is for.
  resource: URL;
  // The only account that may connect.
  owner: string;
  server: GalleryServer;
  // Where connections are kept across a restart, sealed. Without one, a redeploy means connecting again.
  stateFile?: string;
  now?: () => number;
}

export class SignInProblem extends Error {}

export class RelayAuth implements OAuthServerProvider {
  private readonly keys: Keys;
  private readonly grants = new Map<string, Grant>();
  private readonly codes = new Map<string, Code>();
  // The user's Supabase access token, per connection, memory only.
  private readonly sessions = new Map<string, { accessToken: string; expiresAt: number }>();
  private readonly refreshing = new Map<string, Promise<string>>();
  private tries: { at: number; from: string }[] = [];
  private readonly now: () => number;

  constructor(private readonly options: RelayAuthOptions) {
    this.keys = keysFrom(options.secret);
    this.now = options.now ?? Date.now;
    this.load();
  }

  // --- Clients, signed instead of stored ---

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => {
        const data = unsigned(this.keys, clientId);
        if (!data || data.t !== "client" || !Array.isArray(data.r)) return undefined;
        const method = data.m === "none" ? "none" : "client_secret_post";
        return {
          client_id: clientId,
          redirect_uris: data.r.map(String),
          token_endpoint_auth_method: method,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          ...(typeof data.n === "string" ? { client_name: data.n } : {}),
          ...(method === "none" ? {} : { client_secret: b64(mac(this.keys, `secret:${clientId}`)), client_secret_expires_at: 0 }),
        };
      },
      registerClient: (client) => {
        const uris = client.redirect_uris.map(String);
        if (uris.length === 0 || uris.length > MAX_REDIRECTS || !uris.every((uri) => uri.length <= 500 && redirectAllowed(uri))) {
          throw new InvalidClientMetadataError("Only ChatGPT, Claude or an app on this computer may connect here.");
        }
        const method = client.token_endpoint_auth_method === "none" ? "none" : "client_secret_post";
        const name = typeof client.client_name === "string" ? client.client_name.slice(0, 100) : undefined;
        const clientId = signed(this.keys, { t: "client", r: uris, m: method, ...(name ? { n: name } : {}), at: Math.floor(this.now() / 1000), k: randomUUID() });
        return { ...this.clientsStore.getClient(clientId)!, client_id_issued_at: Math.floor(this.now() / 1000) } as OAuthClientInformationFull;
      },
    };
  }

  // --- The sign-in page ---

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource && params.resource.href !== this.options.resource.href) throw new InvalidTargetError("This server is only for its own MCP address.");
    const request = signed(this.keys, {
      t: "form",
      c: client.client_id,
      r: params.redirectUri,
      ch: params.codeChallenge,
      ...(params.state !== undefined ? { s: params.state } : {}),
      x: this.now() + FORM_TTL_MS,
    });
    res.status(200).type("html").send(signInPage({ app: appName(params.redirectUri), request }));
  }

  // The form's answer: the password goes to Supabase once and is forgotten. Gives where to send the browser next.
  async signIn(form: { request?: unknown; email?: unknown; password?: unknown }, from: string): Promise<{ redirect: string } | { page: string }> {
    const request = unsigned(this.keys, form.request);
    if (!request || request.t !== "form" || typeof request.x !== "number" || request.x < this.now()) {
      return { page: signInPage({ app: "This app", request: null, problem: "This sign-in has run out. Start connecting again from ChatGPT or Claude." }) };
    }
    const client = await this.clientsStore.getClient(String(request.c));
    const redirectUri = String(request.r);
    const again = (problem: string) => ({ page: signInPage({ app: appName(redirectUri), request: String(form.request), problem }) });
    if (!client || !client.redirect_uris.includes(redirectUri)) return again("This app isn't registered here. Start connecting again.");
    const email = typeof form.email === "string" ? form.email.trim() : "";
    const password = typeof form.password === "string" ? form.password : "";
    if (!email || !password) return again("Give your Blueberry email and password.");
    if (!this.mayTry(from)) return again("Too many tries. Wait a few minutes and try again.");
    // Nobody else's password is sent anywhere.
    if (email.toLowerCase() !== this.options.owner.toLowerCase()) return again("Only the Blueberry account this is set up for can connect here.");
    let session: ServerSession | null;
    try {
      session = await this.options.server.signIn(email, password);
    } catch (error) {
      if (error instanceof ServerError && error.status === 400) return again("That email and password didn't match.");
      return again(error instanceof Unreachable ? "Couldn't reach Blueberry's server. Try again." : "That didn't work. Try again.");
    }
    if (!session || session.email.toLowerCase() !== this.options.owner.toLowerCase()) return again("Only the Blueberry account this is set up for can connect here.");
    const code = randomBytes(32).toString("base64url");
    this.dropExpired();
    if (this.codes.size >= MAX_CODES) this.codes.delete(this.codes.keys().next().value as string);
    this.codes.set(hash(code), { clientId: client.client_id, redirectUri, challenge: String(request.ch), session, expiresAt: this.now() + CODE_TTL_MS });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (typeof request.s === "string") target.searchParams.set("state", request.s);
    return { redirect: target.href };
  }

  private mayTry(from: string): boolean {
    const now = this.now();
    this.tries = this.tries.filter(({ at }) => now - at < TRIES_WINDOW_MS);
    if (this.tries.length >= TRIES_IN_ALL || this.tries.filter((one) => one.from === from).length >= TRIES_PER_ADDRESS) return false;
    this.tries.push({ at: now, from });
    return true;
  }

  // --- Codes and tokens ---

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const code = this.codes.get(hash(authorizationCode));
    if (!code || code.clientId !== client.client_id || code.expiresAt < this.now()) throw new InvalidGrantError("That code isn't valid.");
    return code.challenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _verifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    const key = hash(authorizationCode);
    const code = this.codes.get(key);
    // Used once, whatever happens next.
    this.codes.delete(key);
    if (!code || code.clientId !== client.client_id || code.expiresAt < this.now()) throw new InvalidGrantError("That code isn't valid.");
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) throw new InvalidGrantError("The redirect_uri doesn't match.");
    if (resource && resource.href !== this.options.resource.href) throw new InvalidTargetError("This server is only for its own MCP address.");
    const grant: Grant = { id: randomUUID(), clientId: client.client_id, email: code.session.email, supabaseRefresh: code.session.refreshToken, accessHash: "", accessExpiresAt: 0, refreshHash: "", jobs: [] };
    this.sessions.set(grant.id, { accessToken: code.session.accessToken, expiresAt: code.session.expiresAt });
    this.grants.set(grant.id, grant);
    while (this.grants.size > MAX_GRANTS) this.forget(this.grants.keys().next().value as string);
    return this.issue(grant);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const grant = this.byHash("refreshHash", refreshToken);
    if (!grant || grant.clientId !== client.client_id) throw new InvalidGrantError("That refresh token isn't valid.");
    if (resource && resource.href !== this.options.resource.href) throw new InvalidTargetError("This server is only for its own MCP address.");
    return this.issue(grant);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = this.byHash("accessHash", token);
    if (!grant || grant.accessExpiresAt < this.now() || grant.email.toLowerCase() !== this.options.owner.toLowerCase()) throw new InvalidTokenError("Connect again from ChatGPT or Claude.");
    return { token, clientId: grant.clientId, scopes: [], expiresAt: Math.floor(grant.accessExpiresAt / 1000), resource: this.options.resource, extra: { grantId: grant.id } };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const grant = this.byHash("refreshHash", request.token) ?? this.byHash("accessHash", request.token);
    if (grant && grant.clientId === client.client_id) this.forget(grant.id);
  }

  private issue(grant: Grant): OAuthTokens {
    const access = newToken("at");
    const refresh = newToken("rt");
    grant.accessHash = hash(access);
    grant.accessExpiresAt = this.now() + ACCESS_TTL_S * 1000;
    grant.refreshHash = hash(refresh);
    this.save();
    return { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh };
  }

  private byHash(field: "accessHash" | "refreshHash", token: string): Grant | null {
    const wanted = hash(token);
    return [...this.grants.values()].find((grant) => grant[field] === wanted) ?? null;
  }

  private forget(grantId: string): void {
    this.grants.delete(grantId);
    this.sessions.delete(grantId);
    this.save();
  }

  private dropExpired(): void {
    const now = this.now();
    for (const [key, code] of this.codes) if (code.expiresAt < now) this.codes.delete(key);
  }

  // --- The user's own Supabase session, for each connection ---

  // A Supabase access token for this connection's user, refreshed when it's due. A refused refresh ends the connection.
  async userToken(grantId: string): Promise<string> {
    const grant = this.grants.get(grantId);
    if (!grant) throw new InvalidTokenError("Connect again from ChatGPT or Claude.");
    const session = this.sessions.get(grantId);
    if (session && session.expiresAt - this.now() > SUPABASE_REFRESH_BEFORE_MS) return session.accessToken;
    const pending = this.refreshing.get(grantId);
    if (pending) return pending;
    const fresh = this.options.server
      .refresh(grant.supabaseRefresh, grant.email)
      .then((next) => {
        if (!next) throw new ServerError(401, "");
        grant.supabaseRefresh = next.refreshToken;
        this.sessions.set(grantId, { accessToken: next.accessToken, expiresAt: next.expiresAt });
        this.save();
        return next.accessToken;
      })
      .catch((error: unknown) => {
        if (error instanceof ServerError && (error.status === 400 || error.status === 401)) this.forget(grantId);
        throw error;
      })
      .finally(() => this.refreshing.delete(grantId));
    this.refreshing.set(grantId, fresh);
    return fresh;
  }

  // The next call gets a new Supabase token, as when Supabase refused this one.
  resetUserToken(grantId: string): void {
    this.sessions.delete(grantId);
  }

  jobsOf(grantId: string): string[] {
    return this.grants.get(grantId)?.jobs ?? [];
  }

  rememberJob(grantId: string, jobId: string): void {
    const grant = this.grants.get(grantId);
    if (!grant) return;
    grant.jobs = [...grant.jobs, jobId].slice(-MAX_JOBS_PER_GRANT);
    this.save();
  }

  // --- Kept across a restart, sealed ---

  private load(): void {
    const { stateFile } = this.options;
    if (!stateFile) return;
    let text: string;
    try {
      text = readFileSync(stateFile, "utf8");
    } catch {
      return;
    }
    const plain = unseal(this.keys, text.trim());
    if (plain === null) {
      console.error("The relay's saved connections couldn't be opened with this RELAY_SECRET, so every app has to connect again.");
      return;
    }
    try {
      for (const grant of JSON.parse(plain) as Grant[]) if (typeof grant?.id === "string" && typeof grant.supabaseRefresh === "string") this.grants.set(grant.id, { ...grant, jobs: Array.isArray(grant.jobs) ? grant.jobs.map(String) : [] });
    } catch {
      // Nothing usable.
    }
  }

  private save(): void {
    const { stateFile } = this.options;
    if (!stateFile) return;
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      const temp = `${stateFile}.tmp`;
      writeFileSync(temp, seal(this.keys, JSON.stringify([...this.grants.values()])), { mode: 0o600 });
      renameSync(temp, stateFile);
    } catch {
      console.error("Couldn't save the relay's connections, so a restart means connecting again.");
    }
  }
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A plain page with nothing but the form. Everything put in it is escaped.
export const signInPage = ({ app, request, problem }: { app: string; request: string | null; problem?: string }): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Blueberry</title>
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
main{width:min(360px,calc(100vw - 32px))}
h1{font-size:20px;margin:0 0 8px}
p{font-size:14px;line-height:1.45;opacity:.8;margin:0 0 16px}
label{display:block;font-size:13px;margin:12px 0 4px}
input{box-sizing:border-box;width:100%;font:inherit;padding:8px 10px;border:1px solid #8886;border-radius:8px}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;padding:9px;border:0;border-radius:8px;background:#3d4fd6;color:#fff}
.problem{color:#b45309;opacity:1}
</style></head><body><main>
<h1>Connect to Blueberry</h1>
<p>${escape(app)} wants to give jobs to your flock in the cloud. They still ask you, in Blueberry or on your phone, before anything risky, and it can't answer for you.</p>
${problem ? `<p class="problem" role="alert">${escape(problem)}</p>` : ""}
${
  request
    ? `<form method="post" action="/sign-in">
<input type="hidden" name="request" value="${escape(request)}">
<label for="email">Blueberry email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in and connect</button>
</form>`
    : ""
}
</main></body></html>`;
