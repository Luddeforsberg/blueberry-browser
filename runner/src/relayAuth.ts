import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidTargetError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { ServerError, Unreachable, type GalleryServer } from "../../src/main/account/galleryServer";
import { entriesOf, fieldsOf } from "../../src/shared/fields";
import { signedClients } from "./relayClients";
import { b64, hash, keysFrom, mac, newToken, seal, unseal, unsigned, signed, type Keys } from "./relayCrypto";
import { appName, signInPage } from "./relaySignInPage";

export { redirectAllowed } from "./relayClients";

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
// A light limit on the owner's sign-in tries, per address and in all. Anyone else is refused before it counts.
const TRIES_WINDOW_MS = 15 * 60_000;
const TRIES_PER_ADDRESS = 10;
const TRIES_IN_ALL = 30;

// One connection from ChatGPT or Claude, standing for a grant in the database.
interface Grant {
  id: string;
  clientId: string;
  // The grant's secret, which the `relay_*` functions take. Never the user's session.
  secret: string;
  accessHash: string;
  accessExpiresAt: number;
  // Only the newest refresh token. Every one names its connection, so an older one coming back is always noticed.
  refreshHash: string;
  createdAt: number;
  lastUsedAt: number;
}

// A grant from the state file, each field checked, and anything else on it dropped.
const savedGrant = (entry: unknown): Grant | null => {
  const { id, clientId, secret, accessHash, accessExpiresAt, refreshHash, createdAt, lastUsedAt } = fieldsOf(entry);
  if (typeof id !== "string" || typeof clientId !== "string" || typeof secret !== "string") return null;
  if (typeof accessHash !== "string" || typeof refreshHash !== "string") return null;
  if (typeof accessExpiresAt !== "number" || typeof createdAt !== "number" || typeof lastUsedAt !== "number") return null;
  return { id, clientId, secret, accessHash, accessExpiresAt, refreshHash, createdAt, lastUsedAt };
};

interface Code {
  clientId: string;
  redirectUri: string;
  challenge: string;
  secret: string;
  expiresAt: number;
}

// The calls the grants need: one as the owner, once, and the rest as the runner. A grant made at sign-in works for
// nothing until it's taken up, when the app that signed in exchanges its code, so codes left unused leave no grant.
interface RelayGrants {
  create(ownerAccessToken: string): Promise<string>;
  activate(secret: string): Promise<void>;
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
  stateFile?: string | undefined;
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
    return signedClients(this.keys, () => this.now());
  }

  // --- The sign-in page ---

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource && params.resource.href !== this.options.resource.href)
      throw new InvalidTargetError("This server is only for its own MCP address.");
    const request = signed(this.keys, {
      t: "form",
      c: client.client_id,
      r: params.redirectUri,
      ch: params.codeChallenge,
      ...(params.state !== undefined ? { s: params.state } : {}),
      x: this.now() + FORM_TTL_MS,
    });
    res
      .status(200)
      .type("html")
      .send(signInPage({ app: appName(params.redirectUri), request }));
  }

  // The form's answer: the password goes to Supabase once and is forgotten, and so is the session it gives, once the
  // grant is made. Gives where to send the browser next.
  async signIn(
    form: { request?: unknown; email?: unknown; password?: unknown },
    from: string,
  ): Promise<{ redirect: string } | { page: string }> {
    const request = unsigned(this.keys, form.request);
    if (!request || request.t !== "form" || typeof request.x !== "number" || request.x < this.now()) {
      return {
        page: signInPage({
          app: "This app",
          request: null,
          problem: "This sign-in has run out. Start connecting again from ChatGPT or Claude.",
        }),
      };
    }
    const client = await this.clientsStore.getClient(String(request.c));
    const redirectUri = String(request.r);
    const again = (problem: string) => ({ page: signInPage({ app: appName(redirectUri), request: String(form.request), problem }) });
    if (!client || !client.redirect_uris.includes(redirectUri)) return again("This app isn't registered here. Start connecting again.");
    const email = typeof form.email === "string" ? form.email.trim() : "";
    const password = typeof form.password === "string" ? form.password : "";
    if (!email || !password) return again("Give your Blueberry email and password.");
    // Nobody else's password is sent anywhere, and nobody else's tries count against the owner's.
    if (email.toLowerCase() !== this.options.owner.toLowerCase())
      return again("Only the Blueberry account this is set up for can connect here.");
    if (!this.mayTry(from)) return again("Too many tries. Wait a few minutes and try again.");
    let secret: string;
    try {
      const session = await this.options.server.signIn(email, password);
      if (!session || session.email.toLowerCase() !== this.options.owner.toLowerCase())
        return again("Only the Blueberry account this is set up for can connect here.");
      try {
        secret = await this.options.grants.create(session.accessToken);
      } finally {
        // The session's work is done, so it's ended at Supabase too, not just dropped here.
        await this.options.server.signOut(session.accessToken).catch(() => {});
      }
    } catch (error) {
      if (error instanceof ServerError && error.status === 400 && error.code === "invalid_credentials")
        return again("That email and password didn't match.");
      if (error instanceof ServerError)
        return again("Set up keeping going with your computer off in Blueberry first, under Settings > Cloud, then try again.");
      return again(error instanceof Unreachable ? "Couldn't reach Blueberry's server. Try again." : "That didn't work. Try again.");
    }
    const code = randomBytes(32).toString("base64url");
    this.dropExpired();
    if (this.codes.size >= MAX_CODES) this.codes.delete(this.codes.keys().next().value as string);
    this.codes.set(hash(code), {
      clientId: client.client_id,
      redirectUri,
      challenge: String(request.ch),
      secret,
      expiresAt: this.now() + CODE_TTL_MS,
    });
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

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const key = hash(authorizationCode);
    const code = this.codes.get(key);
    // Used once, whatever happens next.
    this.codes.delete(key);
    if (!code || code.clientId !== client.client_id || code.expiresAt < this.now()) throw new InvalidGrantError("That code isn't valid.");
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) throw new InvalidGrantError("The redirect_uri doesn't match.");
    if (resource && resource.href !== this.options.resource.href)
      throw new InvalidTargetError("This server is only for its own MCP address.");
    try {
      await this.options.grants.activate(code.secret);
    } catch {
      throw new InvalidGrantError("That code can't be used any more. Connect again.");
    }
    const now = this.now();
    const grant: Grant = {
      id: randomUUID(),
      clientId: client.client_id,
      secret: code.secret,
      accessHash: "",
      accessExpiresAt: 0,
      refreshHash: "",
      createdAt: now,
      lastUsedAt: now,
    };
    this.grants.set(grant.id, grant);
    while (this.grants.size > MAX_GRANTS) this.end(this.grants.keys().next().value as string);
    return this.issue(grant);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const grant = this.grants.get(this.connectionOf(refreshToken) ?? "");
    if (!grant) throw new InvalidGrantError("That refresh token isn't valid.");
    // A token of this connection that isn't its newest was used already, so it was copied: the whole connection ends,
    // however long ago (RFC 9700 4.14.2). So does one of its tokens from another app.
    if (hash(refreshToken) !== grant.refreshHash || grant.clientId !== client.client_id) {
      this.end(grant.id);
      throw new InvalidGrantError("That refresh token was already used, so this connection has ended. Connect again.");
    }
    if (resource && resource.href !== this.options.resource.href)
      throw new InvalidTargetError("This server is only for its own MCP address.");
    if (this.expired(grant)) {
      this.end(grant.id);
      throw new InvalidGrantError("This connection has run out. Connect again.");
    }
    grant.lastUsedAt = this.now();
    return this.issue(grant);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = this.byHash("accessHash", token);
    if (!grant || grant.accessExpiresAt < this.now() || this.expired(grant))
      throw new InvalidTokenError("Connect again from ChatGPT or Claude.");
    return {
      token,
      clientId: grant.clientId,
      scopes: [],
      expiresAt: Math.floor(grant.accessExpiresAt / 1000),
      resource: this.options.resource,
      extra: { grantId: grant.id },
    };
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
    // Names its connection, signed so nobody can make one that ends someone else's.
    const body = `${grant.id}.${randomBytes(32).toString("base64url")}`;
    const refresh = `bb_rt_${body}.${b64(mac(this.keys, `refresh:${body}`))}`;
    grant.accessHash = hash(access);
    grant.accessExpiresAt = this.now() + ACCESS_TTL_S * 1000;
    grant.refreshHash = hash(refresh);
    this.save();
    return { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh };
  }

  private connectionOf(refreshToken: string): string | null {
    const [, connection, random, signature] = /^bb_rt_([0-9a-f-]{36})\.([\w-]+)\.([\w-]+)$/.exec(refreshToken) ?? [];
    if (connection === undefined || random === undefined || signature === undefined) return null;
    const given = Buffer.from(signature, "base64url");
    const wanted = mac(this.keys, `refresh:${connection}.${random}`);
    return given.length === wanted.length && timingSafeEqual(given, wanted) ? connection : null;
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
      entriesOf(JSON.parse(plain), savedGrant).entries.forEach((grant) => this.grants.set(grant.id, grant));
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
