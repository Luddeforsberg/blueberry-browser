import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { finishWatching } from "./recorderScript";
import { Recordings } from "./Recordings";
import type { Tab } from "../tabs/Tab";

vi.mock("electron", () => ({}));

// A tab whose page answers the watching and finishes only when the test says.
const fakeTab = (url: string) => {
  const finishes: ((notes: unknown[]) => void)[] = [];
  const answers: ((notes: unknown[]) => void)[] = [];
  const tab = {
    id: url,
    url,
    hasLoaded: true,
    berryWorking: false,
    heldForUser: false,
    webContents: { on: () => {}, off: () => {}, isDestroyed: () => false, isLoading: () => false },
    listenInPage: (code: string) => new Promise<unknown[]>((resolve) => (code === finishWatching ? finishes : answers).push(resolve)),
  };
  return { tab: tab as unknown as Tab, finishes, answers };
};

const start = (front: Tab) => {
  const openReview = vi.fn();
  const recordings = new Recordings({
    chrome: () => ({ send: () => {}, isDestroyed: () => false }) as unknown as WebContents,
    activeTab: () => front,
    openReview,
    closeReview: () => {},
    openStart: () => {},
    hasModel: () => false,
    write: async () => "",
  });
  return { recordings, openReview };
};

describe("Recordings", () => {
  it("leaves a recording started after a discard alone when the stop before it finishes late", async () => {
    const first = fakeTab("https://one.example/");
    const { recordings, openReview } = start(first.tab);
    recordings.start();
    const stopping = recordings.stop();
    recordings.discard();
    expect(recordings.start()).toBe(true);
    // The page from the first recording finishes now, with something it had left in a field.
    first.finishes.forEach((finish) => finish([{ type: "typed", value: "late", label: "Search" }]));
    await stopping;
    expect(openReview).not.toHaveBeenCalled();
    expect(recordings.state.status).toBe("recording");
    expect(recordings.state.steps).toHaveLength(1);
    // The new recording still stops, and its own stop opens the review.
    const again = recordings.stop();
    first.finishes.forEach((finish) => finish([]));
    await again;
    expect(recordings.state.status).toBe("review");
    expect(openReview).toHaveBeenCalledOnce();
  });

  it("puts nothing a page answers for a thrown-away recording into the next one", async () => {
    const page = fakeTab("https://one.example/");
    const { recordings } = start(page.tab);
    recordings.start();
    const old = page.answers.length;
    recordings.discard();
    recordings.start();
    expect(page.answers.length).toBeGreaterThan(old);
    // The first recording's read answers now, with what the user did then.
    page.answers.slice(0, old).forEach((answer) => answer([{ type: "click", label: "Buy" }]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordings.state.steps).toHaveLength(1);
  });
});
