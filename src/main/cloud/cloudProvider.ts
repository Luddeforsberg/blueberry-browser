import type { Browser, BrowserContext } from "playwright-core";
import type { CdpTab } from "../tools/CdpTab";

// What a cloud browser's provider does: make a session, connect to it, and end it by its id or by the tag it was made
// with. Browserbase is one, and a Chrome on this computer stands in for it in tests. Plain Node, so the runner uses the
// same code.

type ProviderName = "browserbase" | "local";

// A running browser, from whichever provider.
export interface CloudSession {
  readonly context: BrowserContext;
  // An address for an iframe showing this page live, which the user can work in. Null where there's none, as for a
  // local browser, which shows pictures instead.
  liveView(page: CdpTab): Promise<string | null>;
  // Lets go of the connection, and ends a browser this computer started.
  close(): Promise<void>;
}

// What is kept of a cloud session, from the moment it's asked for until the provider confirms it ended.
export interface CloudIds {
  contextId: string | null;
  sessionId: string | null;
  // One for each session asked for whose answer hasn't come, or didn't say its id: such a session may be running with
  // no id to end it by. Each went out with its session, so the provider can still find it.
  tags: string[];
  // The provider that made the session id and tags. Only that one can say they've ended.
  madeBy: ProviderName | null;
}

export const NO_IDS: CloudIds = { contextId: null, sessionId: null, tags: [], madeBy: null };

// Told as a session is made, each the moment the provider has it.
export interface CreateHooks {
  // False once nothing new should be made.
  wanted(): boolean;
  // A fresh tag for the session about to be asked for, already kept by the time it's returned.
  tag(): string;
  // The provider refused that ask outright, so nothing was made with the tag.
  unused(tag: string): void;
  context(id: string): void;
  made(id: string): void;
}

// A session the provider has made, or found still running, before anything has connected to it.
export interface MadeSession {
  // Null where closing the connection ends it, as for a browser on this computer.
  readonly id: string | null;
  connect(): Promise<CloudSession>;
}

export interface CloudBrowser {
  readonly name: ProviderName;
  // The saved session if it's still running, or a new one.
  create(ids: Pick<CloudIds, "contextId" | "sessionId">, hooks: CreateHooks): Promise<MadeSession>;
  // Ends that session at the provider, from its id alone, so nothing keeps running or costing. Rejects if that wasn't
  // confirmed, with `KeyRefused` when the provider no longer takes the key, which then can't end it at all.
  release(id: string): Promise<void>;
  // Ends every session made with that tag, and resolves once none of them is running. Rejects as `release` does.
  releaseTagged(tag: string): Promise<void>;
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
