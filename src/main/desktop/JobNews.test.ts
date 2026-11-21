import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobNews } from "./JobNews";
import type { DesktopParts } from "./DesktopParts";
import type { LibrarySnapshot } from "../../shared/library";

const MINUTE = 60_000;

// The drop's parts as JobNews reaches them, with the user away from Blueberry so every ending is a result.
const parts = () =>
  ({
    window: {},
    host: {
      inFront: () => false,
      ended: (chatId: string) => ({ mascotId: "berry", title: chatId, text: `${chatId} is done.`, error: null }),
    },
    drop: { hovering: false },
    composer: { asking: null },
    publish: () => {},
  }) as unknown as DesktopParts;

const running = (...ids: string[]) => ({ chats: ids.map((id) => ({ id, running: true })), needsYou: [] }) as unknown as LibrarySnapshot;

describe("JobNews results", () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  it("go ten minutes after each ended, not after the newest", () => {
    const news = new JobNews(parts());
    const shown = () => news.results.map(({ chatId }) => chatId);
    news.libraryChanged(running("a", "b"));
    news.libraryChanged(running("b"));
    vi.advanceTimersByTime(9 * MINUTE);
    news.libraryChanged(running());
    expect(shown()).toEqual(["a", "b"]);

    vi.advanceTimersByTime(MINUTE - 1);
    expect(shown()).toEqual(["a", "b"]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual(["b"]);

    vi.advanceTimersByTime(9 * MINUTE - 1);
    expect(shown()).toEqual(["b"]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });
});
