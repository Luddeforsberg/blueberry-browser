import { randomUUID } from "crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { b64, mac, signed, unsigned, type Keys } from "./relayCrypto";

// The clients ChatGPT and Claude register, signed instead of stored, so they survive a redeploy without any storage, and
// where a sign-in may send its code.

const MAX_REDIRECTS = 5;

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

export const signedClients = (keys: Keys, now: () => number): OAuthRegisteredClientsStore => {
  const store: OAuthRegisteredClientsStore = {
    getClient: (clientId) => {
      const data = unsigned(keys, clientId);
      if (!data || data.t !== "client" || !Array.isArray(data.r)) return undefined;
      const method = data.m === "none" ? "none" : "client_secret_post";
      return {
        client_id: clientId,
        redirect_uris: data.r.map(String),
        token_endpoint_auth_method: method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        ...(typeof data.n === "string" ? { client_name: data.n } : {}),
        ...(method === "none" ? {} : { client_secret: b64(mac(keys, `secret:${clientId}`)), client_secret_expires_at: 0 }),
      };
    },
    registerClient: (client) => {
      const uris = client.redirect_uris.map(String);
      if (uris.length === 0 || uris.length > MAX_REDIRECTS || !uris.every((uri) => uri.length <= 500 && redirectAllowed(uri))) {
        throw new InvalidClientMetadataError("Only ChatGPT, Claude or an app on this computer may connect here.");
      }
      const method = client.token_endpoint_auth_method === "none" ? "none" : "client_secret_post";
      const name = typeof client.client_name === "string" ? client.client_name.slice(0, 100) : undefined;
      const clientId = signed(keys, {
        t: "client",
        r: uris,
        m: method,
        ...(name ? { n: name } : {}),
        at: Math.floor(now() / 1000),
        k: randomUUID(),
      });
      return {
        ...store.getClient(clientId)!,
        client_id_issued_at: Math.floor(now() / 1000),
      } as OAuthClientInformationFull;
    },
  };
  return store;
};
