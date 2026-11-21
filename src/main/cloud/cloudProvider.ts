import type { Browser, BrowserContext } from "playwright-core";
import type { CdpTab } from "../tools/CdpTab";

// What a cloud browser's provider does: make a session, connect to it, and end it by its id. Browserbase is one, and a
// Chrome on this computer stands in for it in tests. Plain Node, so the runner uses the same code.

// A running browser, from whichever provider.
export interface CloudSession {
  readonly context: BrowserContext;
  // An address for an iframe showing this page live, which the user can work in. Null where there's none, as for a
  // local browser, which shows pictures instead.
  liveView(page: CdpTab): Promise<string | null>;
  // Lets go of the connection, and ends a browser this computer started.
  close(): Promise<void>;
}

// What the provider knows a session by. The session's id is the only way to end it, so it's kept from the moment the
// provider gives it until the provider confirms it ended.
export interface CloudIds {
  contextId: string | null;
  sessionId: string | null;
}

// A session the provider has made, or found still running, before anything has connected to it.
export interface MadeSession {
  // Null where closing the connection ends it, as for a browser on this computer.
  readonly id: string | null;
  connect(): Promise<CloudSession>;
}

export interface CloudBrowser {
  readonly name: "browserbase" | "local";
  // The saved session if it's still running, or a new one. `onIds` hears each new id as soon as the provider gives it,
  // before anything else about it is checked. Nothing new is made once `wanted` says no.
  create(ids: CloudIds, onIds: (ids: CloudIds) => void, wanted: () => boolean): Promise<MadeSession>;
  // Ends that session at the provider, from its id alone, so nothing keeps running or costing. Rejects if that wasn't
  // confirmed, with `KeyRefused` when the provider no longer takes the key, which then can't end it at all.
  release(id: string): Promise<void>;
}

export class KeyRefused extends Error {}

// How an ending went at the provider: confirmed, not confirmed, or refused because the key no longer works there.
export type Released = "ended" | "running" | "refused";

export const NOT_WANTED = "The cloud browser is ending, so no new session was started.";

// Playwright loads only when a cloud browser is first used, so startup never waits for it.
export const connectOverCdp = async (endpoint: string): Promise<Browser> => {
  const { chromium } = await import("playwright-core");
  return chromium.connectOverCDP(endpoint);
};
