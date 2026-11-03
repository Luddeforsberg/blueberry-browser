import { describe, expect, it } from "vitest";
import { computeLayout, MIN_PAGE_WIDTH, promptRect, PROMPT_WIDTH,
  DESKTOP_BIRD_SIZE,
  DESKTOP_PEEK,
  desktopComposerBounds,
  desktopFlightPoint,
  desktopHit,
  desktopPeekHit,
  desktopPlace,
  desktopSpotAt,
  desktopTucked,
} from "./Layout";

const mac = {
  platform: "darwin" as const,
  mode: "vertical" as const,
  sidebarWidth: 240,
  chatWidth: 360,
};
const both = { sidebarOpen: true, chatOpen: true, ...mac };

describe("computeLayout", () => {
  it("parks a tab with one pixel in the window's corner, at the size the page would be", () => {
    const { page, parkedPage } = computeLayout({ width: 1280, height: 800 }, both);

    expect(parkedPage.x).toBe(1279);
    expect(parkedPage.y).toBe(799);
    expect(parkedPage.width).toBe(page.width);
    expect(parkedPage.height).toBe(page.height);
  });

  it("puts the sidebar left, the chat right, and the page card between them under the toolbar", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, both);

    expect(layout.sidebar).toEqual({ x: 0, y: 0, width: 240, height: 800 });
    expect(layout.chat).toEqual({ x: 920, y: 0, width: 360, height: 800 });
    expect(layout.toolbar).toEqual({ x: 240, y: 8, width: 680, height: 40 });
    expect(layout.addressRow).toEqual(layout.toolbar);
    expect(layout.page).toEqual({ x: 240, y: 48, width: 680, height: 744 });
  });

  it("puts the find bar in the page's top right corner, and never outside the page", () => {
    const { findBar, page } = computeLayout({ width: 1280, height: 800 }, both);
    expect(findBar).toEqual({ x: page.x + page.width - 384, y: page.y, width: 384, height: 72 });

    const tiny = computeLayout({ width: 300, height: 90 }, { sidebarOpen: false, chatOpen: false, ...mac });
    expect(tiny.findBar).toEqual({ x: 8, y: 48, width: 284, height: 34 });
  });

  it("floats the page card with the frame showing around it when both panels are gone", () => {
    const layout = computeLayout(
      { width: 1280, height: 800 },
      { sidebarOpen: false, chatOpen: false, ...mac }
    );

    expect(layout.sidebar.width).toBe(0);
    expect(layout.chat.width).toBe(0);
    expect(layout.toolbar).toEqual({ x: 8, y: 8, width: 1264, height: 40 });
    expect(layout.page).toEqual({ x: 8, y: 48, width: 1264, height: 744 });
  });

  it("collapses the sidebar before closing the chat when space runs out", () => {
    const layout = computeLayout({ width: 1000, height: 800 }, both);

    expect(layout.sidebarOpen).toBe(false);
    expect(layout.chatOpen).toBe(true);
    expect(layout.page.width).toBeGreaterThanOrEqual(MIN_PAGE_WIDTH);
  });

  it("closes the chat too when the page still has too little room", () => {
    const layout = computeLayout({ width: 800, height: 600 }, both);

    expect(layout.sidebarOpen).toBe(false);
    expect(layout.chatOpen).toBe(false);
  });

  it("keeps the window buttons clear on each platform", () => {
    const size = { width: 1280, height: 800 };

    expect(computeLayout(size, both).controls).toEqual({ x: 0, y: 0, width: 80, height: 56 });
    expect(computeLayout(size, { ...both, platform: "win32" }).controls).toEqual({
      x: 1142,
      y: 0,
      width: 138,
      height: 56,
    });
  });

  it("never returns a negative size when the window is smaller than the chrome", () => {
    for (const [width, height] of [
      [0, 0],
      [1, 1],
      [240, 44],
      [100, 30],
    ]) {
      const layout = computeLayout({ width, height }, both);

      for (const rect of [
        layout.sidebar,
        layout.floatingSidebar,
        layout.tabStrip,
        layout.toolbar,
        layout.chat,
        layout.page,
        layout.controls,
      ]) {
        expect(rect.width).toBeGreaterThanOrEqual(0);
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("puts a tab row above the toolbar in horizontal mode, with no sidebar", () => {
    const layout = computeLayout(
      { width: 1280, height: 800 },
      { ...both, mode: "horizontal" }
    );

    expect(layout.sidebarOpen).toBe(false);
    expect(layout.floatingSidebar.width).toBe(0);
    expect(layout.tabStrip).toEqual({ x: 0, y: 0, width: 920, height: 40 });
    expect(layout.toolbar).toEqual({ x: 8, y: 40, width: 912, height: 76 });
    // The bookmarks bar is under the address row, so the panel's buttons line up with the row alone.
    expect(layout.addressRow).toEqual({ x: 8, y: 40, width: 912, height: 40 });
    expect(layout.page).toEqual({ x: 8, y: 116, width: 912, height: 676 });
    expect(layout.controls.height).toBe(40);
  });

  it("uses resized panel widths, kept within their limits", () => {
    const resized = computeLayout(
      { width: 1400, height: 800 },
      { ...both, sidebarWidth: 300, chatWidth: 400 }
    );
    expect(resized.sidebar.width).toBe(300);
    expect(resized.chat).toEqual({ x: 1000, y: 0, width: 400, height: 800 });
    expect(resized.page.width).toBe(700);

    const extreme = computeLayout(
      { width: 1400, height: 800 },
      { ...both, sidebarWidth: 10, chatWidth: 9999 }
    );
    expect(extreme.sidebarWidth).toBe(200);
    expect(extreme.chatWidth).toBe(480);
  });

  it("offers the floating sidebar only while the vertical sidebar is collapsed", () => {
    const size = { width: 1280, height: 800 };

    expect(computeLayout(size, both).floatingSidebar.width).toBe(0);
    expect(computeLayout(size, { ...both, sidebarOpen: false }).floatingSidebar).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 800,
    });
  });
});

describe("promptRect", () => {
  const page = { x: 240, y: 48, width: 680, height: 744 };

  it("sits in the page's corner at the card's height", () => {
    expect(promptRect(page, 170)).toEqual({ x: 240, y: 48, width: PROMPT_WIDTH, height: 170 });
  });

  it("never leaves the page, whatever height it's told", () => {
    expect(promptRect(page, 5000).height).toBe(744);
    expect(promptRect(page, 0).height).toBe(1);
    expect(promptRect({ ...page, width: 300 }, 170).width).toBe(300);
  });
});

describe("the bird on the desktop", () => {
  const area = { x: 100, y: 25, width: 1000, height: 700 };
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const EDGES = ["bottom", "top", "left", "right"] as const;
  const FRACTIONS = [0, 0.25, 0.5, 0.51, 1];
  const inside = (rect: { x: number; y: number; width: number; height: number }, within: typeof area) =>
    rect.x >= within.x && rect.y >= within.y && rect.x + rect.width <= within.x + within.width && rect.y + rect.height <= within.y + within.height;

  it("keeps its window one size and on screen, at every edge and corner", () => {
    const { width, height } = desktopPlace(area, { edge: "bottom", fraction: 0 }).window;
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const { window, out } = desktopPlace(area, { edge, fraction });
        expect(inside(window, area)).toBe(true);
        expect([window.width, window.height]).toEqual([width, height]);
        // All of the bird is in the window, but for its toes going over the edge.
        expect(out.x).toBeGreaterThanOrEqual(-2);
        expect(out.y).toBeGreaterThanOrEqual(-2);
        expect(out.x + DESKTOP_BIRD_SIZE).toBeLessThanOrEqual(window.width + 2);
        expect(out.y + DESKTOP_BIRD_SIZE).toBeLessThanOrEqual(window.height + 2);
      })
    );
  });

  it("puts the side of the window along the edge it's on, so that's what it tucks behind", () => {
    expect(desktopPlace(area, { edge: "bottom", fraction: 0.3 }).window.y + desktopPlace(area, { edge: "bottom", fraction: 0.3 }).window.height).toBe(bottom);
    expect(desktopPlace(area, { edge: "top", fraction: 0.3 }).window.y).toBe(area.y);
    expect(desktopPlace(area, { edge: "left", fraction: 0.3 }).window.x).toBe(area.x);
    const onRight = desktopPlace(area, { edge: "right", fraction: 0.3 }).window;
    expect(onRight.x + onRight.width).toBe(right);
  });

  it("shows only what peeks, and only that takes the pointer", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const place = desktopPlace(area, { edge, fraction });
        const window = { x: 0, y: 0, width: place.window.width, height: place.window.height };
        const hit = desktopPeekHit(place, edge, DESKTOP_PEEK);
        expect(inside(hit, window)).toBe(true);
        expect(Math.min(hit.width, hit.height)).toBe(DESKTOP_PEEK);
        // The hit touches the side of the window along the edge.
        if (edge === "bottom") expect(hit.y + hit.height).toBe(window.height);
        if (edge === "top") expect(hit.y).toBe(0);
        if (edge === "left") expect(hit.x).toBe(0);
        if (edge === "right") expect(hit.x + hit.width).toBe(window.width);
      })
    );
  });

  it("tucks along the edge it's on and no other way", () => {
    const moved = (edge: (typeof EDGES)[number]) => {
      const place = desktopPlace(area, { edge, fraction: 0.5 });
      const tucked = desktopTucked(place, edge, DESKTOP_PEEK);
      return [Math.sign(tucked.x - place.out.x), Math.sign(tucked.y - place.out.y)];
    };
    expect(moved("bottom")).toEqual([0, 1]);
    expect(moved("top")).toEqual([0, -1]);
    expect(moved("left")).toEqual([-1, 0]);
    expect(moved("right")).toEqual([1, 0]);
  });

  it("faces the middle of the screen, and its words go that way", () => {
    expect(desktopPlace(area, { edge: "bottom", fraction: 0.1 })).toMatchObject({ flip: false, line: { side: "left" } });
    expect(desktopPlace(area, { edge: "bottom", fraction: 0.9 })).toMatchObject({ flip: true, line: { side: "right" } });
    expect(desktopPlace(area, { edge: "left", fraction: 0.9 })).toMatchObject({ flip: true, line: { side: "left", across: "middle" } });
    expect(desktopPlace(area, { edge: "right", fraction: 0.1 })).toMatchObject({ flip: true, line: { side: "right", across: "middle" } });
  });

  it("snaps to the nearest edge, and to a corner when it's let go near one", () => {
    const at = (x: number, y: number) => desktopSpotAt(area, 7, { x: area.x + x, y: area.y + y });
    expect(at(500, 690)).toMatchObject({ displayId: 7, edge: "bottom" });
    expect(at(500, 10)).toMatchObject({ edge: "top" });
    expect(at(10, 300)).toMatchObject({ edge: "left" });
    expect(at(990, 300)).toMatchObject({ edge: "right" });
    expect(at(20, 690)).toEqual({ displayId: 7, edge: "bottom", fraction: 0 });
    expect(at(980, 690)).toEqual({ displayId: 7, edge: "bottom", fraction: 1 });
    expect(at(980, 10).fraction).toBe(1);
    expect(desktopSpotAt(area, 7, { x: -5000, y: 5000 })).toMatchObject({ edge: "left", fraction: 1 });
  });

  it("keeps the composer on screen and clear of the bird, towards the middle, at any size", () => {
    const size = { width: 400, height: 50 };
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const composer = desktopComposerBounds(area, { edge, fraction }, size);
        expect(inside(composer, area)).toBe(true);
        const { window, out } = desktopPlace(area, { edge, fraction });
        const birdX = window.x + out.x;
        const birdY = window.y + out.y;
        const overlaps = composer.x < birdX + DESKTOP_BIRD_SIZE && composer.x + composer.width > birdX && composer.y < birdY + DESKTOP_BIRD_SIZE && composer.y + composer.height > birdY;
        expect(overlaps).toBe(false);
      })
    );
    const tiny = { x: 0, y: 0, width: 300, height: 200 };
    EDGES.forEach((edge) => {
      const composer = desktopComposerBounds(tiny, { edge, fraction: 1 }, { width: 400, height: 900 });
      expect(inside(composer, tiny)).toBe(true);
      expect(inside(desktopPlace(tiny, { edge, fraction: 1 }).window, tiny)).toBe(true);
    });
  });

  it("works on a display that isn't the first, with a position below zero", () => {
    const second = { x: -1200, y: -300, width: 1200, height: 800 };
    EDGES.forEach((edge) => expect(inside(desktopPlace(second, { edge, fraction: 0.5 }).window, second)).toBe(true));
  });

  it("only lets the pointer land on what's listed, up to but not past its edge", () => {
    const window = { x: 10, y: 20, width: 200, height: 100 };
    const hits = [{ x: 150, y: 50, width: 50, height: 50 }];
    expect(desktopHit({ x: 160, y: 70 }, window, hits)).toBe(true);
    expect(desktopHit({ x: 159, y: 70 }, window, hits)).toBe(false);
    expect(desktopHit({ x: 209, y: 119 }, window, hits)).toBe(true);
    expect(desktopHit({ x: 210, y: 70 }, window, hits)).toBe(false);
    expect(desktopHit({ x: 160, y: 70 }, window, [])).toBe(false);
  });

  it("leaves from where it is, lands where it's going, and rises on the way", () => {
    const from = { x: 500, y: 300 };
    const to = { x: 1200, y: 800 };
    expect(desktopFlightPoint(from, to, 0)).toEqual(from);
    expect(desktopFlightPoint(from, to, 1)).toEqual(to);
    expect(desktopFlightPoint(from, to, 0.5).y).toBeLessThan(from.y + (to.y - from.y) * 0.5);
  });
});
