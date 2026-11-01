import { describe, expect, it, vi } from "vitest";
import { flightMs, landingFor, PageActor, typingChunks, WAITING_WORDS, type ActorOptions, type Spot } from "./PageActor";

const spot = (over: Partial<Spot> = {}): Spot => ({ left: 300, top: 300, width: 100, height: 40, x: 350, y: 320, viewWidth: 1000, viewHeight: 800, ...over });

describe("where the bird lands", () => {
  it("stands on a short target's top edge, beside the point", () => {
    const { x, y, turn } = landingFor(spot(), "land", 56);
    expect(turn).toBe(1);
    expect(x).toBeLessThan(350);
    expect(y).toBeGreaterThanOrEqual(300);
    expect(y).toBeLessThan(320);
  });

  it("stands near the point on a tall one, not on a far edge", () => {
    expect(landingFor(spot({ height: 600, top: 100, y: 400 }), "land", 56).y).toBeGreaterThan(300);
  });

  it("faces the other way at the edge of the page, and stays on it", () => {
    const left = landingFor(spot({ left: 0, x: 10, width: 20 }), "land", 56);
    expect(left.turn).toBe(-1);
    expect(left.x).toBeGreaterThan(10);
    expect(landingFor(spot({ left: 960, x: 990, width: 30 }), "land", 56).turn).toBe(-1);
    expect(landingFor(spot({ top: 0, y: 10, height: 20 }), "land", 56).y).toBeGreaterThanOrEqual(56 * 0.9);
  });

  it("sits on a field's edge at its far end, with room to the page's edge", () => {
    const { x, y } = landingFor(spot({ left: 100, width: 400 }), "perch", 56);
    expect(x).toBeGreaterThan(400);
    expect(x).toBeLessThanOrEqual(500);
    expect(y).toBe(300);
    expect(landingFor(spot({ left: 800, width: 400 }), "perch", 56).x).toBeLessThanOrEqual(1000);
  });
});

describe("how long it takes", () => {
  it("grows with distance, inside a fraction of a second", () => {
    const from = { x: 0, y: 0 };
    expect(flightMs(from, from)).toBe(200);
    expect(flightMs(from, { x: 300, y: 0 })).toBe(305);
    expect(flightMs(from, { x: 5000, y: 0 })).toBe(520);
    expect(flightMs(null, from)).toBe(520);
  });
});

describe("typing in pieces", () => {
  const ticks = 38;

  it("gives nothing for nothing and one letter for one", () => {
    expect(typingChunks("")).toEqual([]);
    expect(typingChunks("a")).toEqual(["a"]);
  });

  it("goes a letter at a time up to the most that fits, and in bigger pieces past that", () => {
    expect(typingChunks("x".repeat(ticks))).toHaveLength(ticks);
    expect(typingChunks("x".repeat(ticks + 1)).length).toBeLessThanOrEqual(ticks);
    expect(typingChunks("x".repeat(5000)).length).toBeLessThanOrEqual(ticks);
  });

  it("adds up to the text, and doesn't split a character in two", () => {
    const text = "Hej 🐦 på dig ".repeat(40);
    expect(typingChunks(text).join("")).toBe(text);
    expect(typingChunks("🐦🐦")).toEqual(["🐦", "🐦"]);
  });
});

describe("when the tab is taken away mid-draw", () => {
  it("doesn't put the bird back on a tab held for the user", async () => {
    const sent: string[] = [];
    const tab = {
      isVisible: true,
      berryWorking: true,
      heldForUser: false,
      existingView: {
        webContents: {
          isDestroyed: () => false,
          // The page has no bird yet, and the tab is handed over while that answer is on its way.
          executeJavaScriptInIsolatedWorld: async (_world: number, [{ code }]: Array<{ code: string }>) => {
            sent.push(code);
            tab.heldForUser = true;
            return "absent";
          },
        },
      },
    };
    const options: ActorOptions = { on: true, plain: false, still: false, look: { palette: "jackdaw", accessory: "none" }, dark: false, windowShowing: true };
    const actor = new PageActor(tab as never, () => options, () => 1);
    await actor.hop("Looking");
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("attachShadow");
  });

  it("still faces the user when they come back to a tab that's waiting for them", async () => {
    const sent: string[] = [];
    const tab = {
      isVisible: true,
      berryWorking: true,
      heldForUser: false,
      existingView: {
        webContents: {
          isDestroyed: () => false,
          executeJavaScriptInIsolatedWorld: async (_world: number, [{ code }]: Array<{ code: string }>) => {
            sent.push(code);
            return true;
          },
        },
      },
    };
    const options: ActorOptions = { on: true, plain: false, still: false, look: { palette: "jackdaw", accessory: "none" }, dark: false, windowShowing: true };
    const actor = new PageActor(tab as never, () => options, () => 1);
    actor.waitingForUser();
    tab.isVisible = false;
    actor.hidden();
    sent.length = 0;
    tab.isVisible = true;
    actor.shown();
    await vi.waitFor(() => expect(sent.join("")).toContain(WAITING_WORDS));
  });
});
