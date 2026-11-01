import { describe, expect, it } from "vitest";
import { computeLayout, MIN_PAGE_WIDTH, promptRect, PROMPT_WIDTH,
  DESKTOP_BIRD_SIZE,
  desktopBounds,
  desktopFlightPoint,
  desktopFractionAt,
  desktopHit,
  desktopSide,
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
  const room = area.width - DESKTOP_BIRD_SIZE;

  it("stands on the bottom of the work area, from one end to the other", () => {
    expect(desktopBounds(area, 0, { width: 0, height: 0 })).toEqual({ x: 100, y: 725 - DESKTOP_BIRD_SIZE, width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE });
    expect(desktopBounds(area, 1, { width: 0, height: 0 }).x).toBe(100 + room);
  });

  it("keeps the bird where it is when the window grows, with the rest towards the middle", () => {
    const small = desktopBounds(area, 0.9, { width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE });
    const big = desktopBounds(area, 0.9, { width: 400, height: 200 });
    expect(big.x + big.width).toBe(small.x + small.width);
    expect(big.y + big.height).toBe(small.y + small.height);
    expect(desktopSide(0.5)).toBe("right");
    expect(desktopSide(0.51)).toBe("left");
    expect(desktopBounds(area, 0.1, { width: 400, height: 200 }).x).toBe(desktopBounds(area, 0.1, { width: 0, height: 0 }).x);
  });

  it("stays inside the limits on what the view can ask for", () => {
    expect(desktopBounds(area, 0, { width: 9000, height: 9000 })).toMatchObject({ width: 520, height: 320 });
  });

  it("turns a place on the screen into a fraction and stays on the edge", () => {
    expect(desktopFractionAt(area, 100)).toBe(0);
    expect(desktopFractionAt(area, 100 + room)).toBe(1);
    expect(desktopFractionAt(area, -500)).toBe(0);
    expect(desktopFractionAt(area, 5000)).toBe(1);
    expect(desktopFractionAt({ ...area, width: DESKTOP_BIRD_SIZE }, 100)).toBe(0);
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
    const straightLine = from.y + (to.y - from.y) * 0.5;
    expect(desktopFlightPoint(from, to, 0.5).y).toBeLessThan(straightLine);
  });
});
