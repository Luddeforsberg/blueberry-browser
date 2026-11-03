import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTargetError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { ServerError, Unreachable, type GalleryServer } from "../../src/main/galleryServer";

// OAuth for the relay, so ChatGPT and Claude start jobs as the user, never as the runner. The user signs in on a page
// served here with their Blueberry email and password, which go to Supabase and nowhere else: never to a log or the
// disk. Only the account the runner is linked to may. Their session is used once, to make a grant in the database tied to
// their runner link, and then signed out: the relay never keeps it. What it keeps is the grant's secret, in memory and,
// with a state file, sealed with RELAY_SECRET, and every call after that is the runner's own, through the `relay_*`
// functions. ChatGPT and Claude get the relay's own random tokens. Registered clients are signed rather than kept, so
// they survive a redeploy without any storage.

const ACCESS_TTL_S = 60 * 60;
const CODE_TTL_MS = 5 * 60_000;
const FORM_TTL_MS = 15 * 60_000;
// A connection ends after this long unused, and after this long whatever happens.
export const IDLE_LIMIT_MS = 30 * 24 * 60 * 60_000;
export const AGE_LIMIT_MS = 90 * 24 * 60 * 60_000;
const MAX_GRANTS = 20;
const MAX_CODES = 50;
const MAX_REDIRECTS = 5;
// Refresh tokens already used, per connection, so one that comes back is noticed.
const MAX_USED_REFRESH = 50;
// A light limit on the owner's sign-in tries, per address and in all. Anyone else is refused before it counts.
const TRIES_WINDOW_MS = 15 * 60_000;
const TRIES_PER_ADDRESS = 10;
const TRIES_IN_ALL = 30;

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

// One connection from ChatGPT or Claude, standing for a grant in the database.
interface Grant {
  id: string;
  clientId: string;
  // The grant's secret, which the `relay_*` functions take. Never the user's session.
  secret: string;
  accessHash: string;
  accessExpiresAt: number;
  refreshHash: string;
  usedRefresh: string[];
  createdAt: number;
  lastUsedAt: number;
}

interface Code {
  clientId: string;
  redirectUri: string;
  challenge: string;
  secret: string;
  expiresAt: number;
}

// The two calls the grants need: one as the owner, once, and one as the runner.
export interface RelayGrants {
  create(ownerAccessToken: string): Promise<string>;
  revoke(secret: string): Promise<void>;
}

export interface RelayAuthOptions {
  secret: string;
  // The address of the MCP endpoint, which every token is for.
  resource: URL;
  // The only account that may connect.
  owner: string;
  server: Pick<GalleryServer, "signIn" | "signOut">;
  grants: RelayGrants;
  // Where connections are kept across a restart, sealed. Without one, a redeploy means connecting again.
  stateFile?: string;
  now?: () => number;
}

export class RelayAuth implements OAuthServerProvider {
  private readonly keys: Keys;
  private readonly grants = new Map<string, Grant>();
  private readonly codes = new Map<string, Code>();
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

  // The form's answer: the password goes to Supabase once and is forgotten, and so is the session it gives, once the
  // grant is made. Gives where to send the browser next.
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
    // Nobody else's password is sent anywhere, and nobody else's tries count against the owner's.
    if (email.toLowerCase() !== this.options.owner.toLowerCase()) return again("Only the Blueberry account this is set up for can connect here.");
    if (!this.mayTry(from)) return again("Too many tries. Wait a few minutes and try again.");
    let secret: string;
    try {
      const session = await this.options.server.signIn(email, password);
      if (!session || session.email.toLowerCase() !== this.options.owner.toLowerCase()) return again("Only the Blueberry account this is set up for can connect here.");
      try {
        secret = await this.options.grants.create(session.accessToken);
      } finally {
        // The session's work is done, so it's ended at Supabase too, not just dropped here.
        await this.options.server.signOut(session.accessToken).catch(() => {});
      }
    } catch (error) {
      if (error instanceof ServerError && error.status === 400 && error.code === "invalid_credentials") return again("That email and password didn't match.");
      if (error instanceof ServerError) return again("Set up keeping going with your Mac off in Blueberry first, under Settings > Cloud, then try again.");
      return again(error instanceof Unreachable ? "Couldn't reach Blueberry's server. Try again." : "That didn't work. Try again.");
    }
    const code = randomBytes(32).toString("base64url");
    this.dropExpired();
    if (this.codes.size >= MAX_CODES) this.codes.delete(this.codes.keys().next().value as string);
    this.codes.set(hash(code), { clientId: client.client_id, redirectUri, challenge: String(request.ch), secret, expiresAt: this.now() + CODE_TTL_MS });
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
    const now = this.now();
    const grant: Grant = { id: randomUUID(), clientId: client.client_id, secret: code.secret, accessHash: "", accessExpiresAt: 0, refreshHash: "", usedRefresh: [], createdAt: now, lastUsedAt: now };
    this.grants.set(grant.id, grant);
    while (this.grants.size > MAX_GRANTS) this.end(this.grants.keys().next().value as string);
    return this.issue(grant);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const wanted = hash(refreshToken);
    // One already used coming back means it was copied: the whole connection ends (RFC 9700 4.14.2).
    const reused = [...this.grants.values()].find((one) => one.usedRefresh.includes(wanted));
    if (reused) {
      this.end(reused.id);
      throw new InvalidGrantError("That refresh token was already used, so this connection has ended. Connect again.");
    }
    const grant = this.byHash("refreshHash", refreshToken);
    if (!grant || grant.clientId !== client.client_id) throw new InvalidGrantError("That refresh token isn't valid.");
    if (resource && resource.href !== this.options.resource.href) throw new InvalidTargetError("This server is only for its own MCP address.");
    if (this.expired(grant)) {
      this.end(grant.id);
      throw new InvalidGrantError("This connection has run out. Connect again.");
    }
    grant.usedRefresh = [...grant.usedRefresh, grant.refreshHash].slice(-MAX_USED_REFRESH);
    grant.lastUsedAt = this.now();
    return this.issue(grant);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = this.byHash("accessHash", token);
    if (!grant || grant.accessExpiresAt < this.now() || this.expired(grant)) throw new InvalidTokenError("Connect again from ChatGPT or Claude.");
    return { token, clientId: grant.clientId, scopes: [], expiresAt: Math.floor(grant.accessExpiresAt / 1000), resource: this.options.resource, extra: { grantId: grant.id } };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const grant = this.byHash("refreshHash", request.token) ?? this.byHash("accessHash", request.token);
    if (grant && grant.clientId === client.client_id) this.end(grant.id);
  }

  private expired(grant: Grant): boolean {
    const now = this.now();
    return now - grant.lastUsedAt > IDLE_LIMIT_MS || now - grant.createdAt > AGE_LIMIT_MS;
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

  // Forgotten here and revoked in the database, so the secret is no use to anyone after.
  end(grantId: string): void {
    const grant = this.grants.get(grantId);
    if (!grant) return;
    this.grants.delete(grantId);
    this.save();
    void this.options.grants.revoke(grant.secret).catch(() => {});
  }

  // The database refused the grant, as after Unlink: nothing is left to revoke.
  forget(grantId: string): void {
    if (this.grants.delete(grantId)) this.save();
  }

  private dropExpired(): void {
    const now = this.now();
    for (const [key, code] of this.codes) if (code.expiresAt < now) this.codes.delete(key);
  }

  secretOf(grantId: string): string {
    const grant = this.grants.get(grantId);
    if (!grant) throw new InvalidTokenError("Connect again from ChatGPT or Claude.");
    return grant.secret;
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
      for (const grant of JSON.parse(plain) as Grant[]) {
        if (typeof grant?.id === "string" && typeof grant.secret === "string" && typeof grant.createdAt === "number" && typeof grant.lastUsedAt === "number") {
          this.grants.set(grant.id, { ...grant, usedRefresh: Array.isArray(grant.usedRefresh) ? grant.usedRefresh.map(String) : [] });
        }
      }
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
