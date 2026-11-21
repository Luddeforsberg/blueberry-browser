import { describe, expect, it, vi } from "vitest";
import type { AppStores } from "../app/appStores";
import type { WindowParts } from "./WindowParts";

vi.mock("electron", () => ({ app: { isPackaged: true, getPath: () => "folder" } }));
const read = vi.hoisted(() => ({ answer: (): void => {} }));
vi.mock("../library/browserHistory", () => ({
  browserDataFor: () => null,
  findBrowsers: async () => [],
  readBrowserHistory: () => new Promise((resolve) => (read.answer = () => resolve([{ url: "https://example.com/" }]))),
}));

const { BrowsingHistory } = await import("./BrowsingHistory");

describe("BrowsingHistory", () => {
  it("says an import was saved when the window closed while it read, and leaves the closed window alone", async () => {
    const historyImported = vi.fn();
    const app: { window: WindowParts | null; suggestions: { historyImported: () => void } } = {
      window: null,
      suggestions: { historyImported },
    };
    const gone = () => {
      throw new Error("Object has been destroyed");
    };
    const w = { app, settingsChanges: { firstJobDone: gone }, library: { publishSuggestions: gone } } as unknown as WindowParts;
    app.window = w;
    const stores = { history: { importVisits: () => 1 } } as unknown as AppStores;
    const importing = new BrowsingHistory(w, stores).importHistory("chrome");
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.window = null;
    read.answer();
    expect(await importing).toEqual({ ok: true, added: 1 });
    expect(historyImported).toHaveBeenCalledTimes(1);
  });
});
