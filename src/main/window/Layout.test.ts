import { describe, expect, it } from "vitest";
import { computeLayout, MIN_PAGE_WIDTH } from "./Layout";

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

  it("puts the sidebar left, and the page and chat sheets under the toolbar with the gutter round them", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, both);

    expect(layout.sidebar).toEqual({ x: 0, y: 0, width: 240, height: 800 });
    expect(layout.toolbar).toEqual({ x: 240, y: 0, width: 1040, height: 48 });
    expect(layout.addressRow).toEqual(layout.toolbar);
    expect(layout.page).toEqual({ x: 240, y: 48, width: 664, height: 744 });
    expect(layout.chat).toEqual({ x: 912, y: 48, width: 360, height: 744 });
  });

  it("puts the find bar in the page's top right corner, and never outside the page", () => {
    const { findBar, page } = computeLayout({ width: 1280, height: 800 }, both);
    expect(findBar).toEqual({ x: page.x + page.width - 396, y: page.y, width: 396, height: 100 });

    const tiny = computeLayout({ width: 300, height: 90 }, { sidebarOpen: false, chatOpen: false, ...mac });
    expect(tiny.findBar).toEqual({ x: 8, y: 48, width: 284, height: 34 });
  });

  it("keeps the gutter round the page when both panels are gone", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, { sidebarOpen: false, chatOpen: false, ...mac });

    expect(layout.sidebar.width).toBe(0);
    expect(layout.chat.width).toBe(0);
    expect(layout.toolbar).toEqual({ x: 8, y: 0, width: 1272, height: 48 });
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

    expect(computeLayout(size, both).controls).toEqual({ x: 0, y: 0, width: 80, height: 48 });
    // Off a Mac, the menu button is kept clear too, left of the system's buttons.
    expect(computeLayout(size, { ...both, platform: "win32" }).controls).toEqual({
      x: 1102,
      y: 0,
      width: 178,
      height: 48,
    });
  });

  it("puts the menu button left of the window buttons off a Mac, centred in the top row", () => {
    const size = { width: 1280, height: 800 };

    expect(computeLayout(size, both).menuButton).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(computeLayout(size, { ...both, platform: "win32" }).menuButton).toEqual({ x: 1106, y: 8, width: 32, height: 32 });
    // In the horizontal layout it's at the toolbar's end instead, so the tab row keeps only the system's buttons clear.
    const horizontal = { ...both, platform: "win32" as const, mode: "horizontal" as const };
    expect(computeLayout(size, horizontal).menuButton).toEqual({ x: 1240, y: 48, width: 32, height: 32 });
    expect(computeLayout(size, { ...horizontal, platform: "darwin" }).menuButton.width).toBe(0);
    expect(computeLayout(size, horizontal).controls).toEqual({ x: 1142, y: 0, width: 138, height: 42 });
    expect(computeLayout(size, { ...horizontal, platform: "linux" }).controls.width).toBe(0);
    expect(computeLayout(size, { ...horizontal, platform: "darwin" }).controls).toEqual({ x: 0, y: 0, width: 80, height: 42 });
    // Linux has no window buttons here, so it's in the corner.
    expect(computeLayout(size, { ...both, platform: "linux" })).toMatchObject({
      controls: { x: 1240, width: 40 },
      menuButton: { x: 1244, width: 32 },
    });
    // Inside what the chrome keeps clear, at the smallest window too.
    const smallest = computeLayout({ width: 900, height: 600 }, { ...both, platform: "win32" });
    expect(smallest.menuButton.x).toBeGreaterThanOrEqual(smallest.controls.x);
    expect(smallest.menuButton.x + smallest.menuButton.width).toBeLessThanOrEqual(900 - 138);
  });

  it("never returns a negative size when the window is smaller than the chrome", () => {
    for (const [width, height] of [
      [0, 0],
      [1, 1],
      [240, 44],
      [100, 30],
    ] satisfies [number, number][]) {
      const layout = computeLayout({ width, height }, both);

      for (const rect of [
        layout.sidebar,
        layout.floatingSidebar,
        layout.tabStrip,
        layout.toolbar,
        layout.chat,
        layout.page,
        layout.controls,
        layout.menuButton,
      ]) {
        expect(rect.width).toBeGreaterThanOrEqual(0);
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("puts a tab row and a toolbar above the page in horizontal mode, with no sidebar, and a bookmarks bar only with something saved", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, { ...both, mode: "horizontal" });

    expect(layout.sidebarOpen).toBe(false);
    expect(layout.floatingSidebar.width).toBe(0);
    expect(layout.tabStrip).toEqual({ x: 0, y: 0, width: 1280, height: 42 });
    expect(layout.toolbar).toEqual({ x: 0, y: 42, width: 1280, height: 44 });
    expect(layout.addressRow).toEqual({ x: 0, y: 42, width: 1280, height: 44 });
    expect(layout.page).toEqual({ x: 8, y: 86, width: 896, height: 706 });
    expect(layout.chat).toEqual({ x: 912, y: 86, width: 360, height: 706 });
    expect(layout.controls.height).toBe(42);
    // Chats and a mascot's card open over everything under the toolbar's own row.
    expect(layout.popover).toEqual({ x: 0, y: 86, width: 1280, height: 714 });

    const saved = computeLayout({ width: 1280, height: 800 }, { ...both, mode: "horizontal", savedSites: true });
    // The bookmarks bar is under the address row, and the popover area starts above it, so it covers the bar too.
    expect(saved.toolbar).toEqual({ x: 0, y: 42, width: 1280, height: 84 });
    expect(saved.addressRow).toEqual({ x: 0, y: 42, width: 1280, height: 44 });
    expect(saved.page).toEqual({ x: 8, y: 126, width: 896, height: 666 });
    expect(saved.popover).toEqual({ x: 0, y: 86, width: 1280, height: 714 });
  });

  it("leaves the vertical layout as it was, with nothing to open over the page, whatever's saved", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, { ...both, savedSites: true });
    expect(layout.toolbar).toEqual({ x: 240, y: 0, width: 1040, height: 48 });
    expect(layout.page.y).toBe(48);
    expect(layout.popover).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("uses resized panel widths, kept within their limits", () => {
    const resized = computeLayout({ width: 1400, height: 800 }, { ...both, sidebarWidth: 300, chatWidth: 400 });
    expect(resized.sidebar.width).toBe(300);
    expect(resized.chat).toEqual({ x: 992, y: 48, width: 400, height: 744 });
    expect(resized.page.width).toBe(684);

    const extreme = computeLayout({ width: 1400, height: 800 }, { ...both, sidebarWidth: 10, chatWidth: 9999 });
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
