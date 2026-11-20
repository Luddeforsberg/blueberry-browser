import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollPage } from "./pageScripts";

// When a scroll answers, run as it ships to pages, on a made-up page whose slide takes as long as the test says. The
// real-browser test in CdpTab.test.ts shows Chrome's own slide ends where this answers. This one holds the timing, which
// a real browser on a busy CI runner can't (issue #145).

const VIEW = 700;

// `staleEnd` is the end of a slide before this one, which the browser tells only after that one answered at its limit.
// `shrinksTo` is a page that gets shorter while it slides, so the slide stops at the new bottom.
const pageWith = ({
  height,
  top = 0,
  slideMs = null,
  staleEnd = false,
  shrinksTo,
}: {
  height: number;
  top?: number;
  slideMs?: number | null;
  staleEnd?: boolean;
  shrinksTo?: number;
}) => {
  const root = { scrollHeight: height };
  const scrollEnd = new Set<() => void>();
  const ended = () => {
    for (const listener of [...scrollEnd]) listener();
  };
  const window = {
    scrollY: top,
    innerHeight: VIEW,
    scrollBy: ({ top: by, behavior }: { top: number; behavior: string }) => {
      const to = Math.max(0, Math.min(height - VIEW, window.scrollY + by));
      if (staleEnd) setTimeout(ended, 16);
      if (behavior !== "smooth") {
        window.scrollY = to;
        return;
      }
      // A slide that never ends stands for a browser that doesn't say so.
      if (slideMs === null) return;
      setTimeout(() => {
        if (shrinksTo !== undefined) root.scrollHeight = shrinksTo;
        window.scrollY = Math.min(to, root.scrollHeight - VIEW);
        ended();
      }, slideMs);
    },
  };
  return createContext({
    window,
    innerHeight: VIEW,
    visualViewport: { height: VIEW },
    document: { documentElement: root },
    addEventListener: (type: string, listener: () => void) => type === "scrollend" && scrollEnd.add(listener),
    removeEventListener: (type: string, listener: () => void) => type === "scrollend" && scrollEnd.delete(listener),
    // The test's own clock, which it moves by hand.
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
  });
};

// The answer, and how long the page's clock ran before it came.
const answerOf = async (page: object, direction: "up" | "down", smooth: boolean) => {
  const started = Date.now();
  let answer: { top: number } | null = null;
  const scrolling = (runInContext(scrollPage(direction, smooth), page) as Promise<{ top: number }>).then((result) => {
    answer = result;
  });
  await vi.advanceTimersByTimeAsync(0);
  while (answer === null && Date.now() - started < 5_000) await vi.advanceTimersByTimeAsync(10);
  await scrolling;
  return { top: answer!.top, ms: Date.now() - started };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a smooth scroll", () => {
  it("answers where the slide ends, when it ends", async () => {
    expect(await answerOf(pageWith({ height: 5_000, slideMs: 450 }), "down", true)).toEqual({ top: 630, ms: 450 });
  });

  it("waits for a slide that starts late, though the page hasn't moved yet", async () => {
    expect(await answerOf(pageWith({ height: 5_000, slideMs: 650 }), "down", true)).toEqual({ top: 630, ms: 650 });
  });

  it("doesn't take the end of the slide before it for its own", async () => {
    const page = pageWith({ height: 5_000, top: 630, slideMs: 450, staleEnd: true });
    expect(await answerOf(page, "down", true)).toEqual({ top: 1_260, ms: 450 });
  });

  it("answers where a page that got shorter on the way stopped it", async () => {
    const page = pageWith({ height: 5_000, top: 4_000, slideMs: 300, shrinksTo: 4_500 });
    expect(await answerOf(page, "down", true)).toEqual({ top: 3_800, ms: 300 });
  });

  it("stops waiting for a slide that never says it ended, and answers where the page is", async () => {
    expect(await answerOf(pageWith({ height: 5_000, top: 100, slideMs: null }), "down", true)).toEqual({ top: 100, ms: 700 });
  });

  it("answers at once where the page can't go", async () => {
    expect(await answerOf(pageWith({ height: 5_000, top: 4_300, slideMs: 450 }), "down", true)).toEqual({ top: 4_300, ms: 0 });
    expect(await answerOf(pageWith({ height: 5_000, top: 0, slideMs: 450 }), "up", true)).toEqual({ top: 0, ms: 0 });
    expect(await answerOf(pageWith({ height: VIEW, slideMs: 450 }), "down", true)).toEqual({ top: 0, ms: 0 });
  });

  it("waits for the last pixel or two only if there's more than one to go", async () => {
    expect(await answerOf(pageWith({ height: 5_000, top: 4_299, slideMs: 450 }), "down", true)).toEqual({ top: 4_299, ms: 0 });
    expect(await answerOf(pageWith({ height: 5_000, top: 4_298, slideMs: 450 }), "down", true)).toEqual({ top: 4_300, ms: 450 });
  });
});

describe("a scroll that isn't smooth", () => {
  it("answers at once where it went", async () => {
    expect(await answerOf(pageWith({ height: 5_000, slideMs: 450 }), "down", false)).toEqual({ top: 630, ms: 0 });
  });
});
