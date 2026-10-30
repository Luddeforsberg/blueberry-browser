import { describe, expect, it } from "vitest";
import { computeLayout, MIN_PAGE_WIDTH } from "./Layout";

const mac = { platform: "darwin" as const };
const both = { sidebarOpen: true, chatOpen: true, ...mac };

describe("computeLayout", () => {
  it("puts the sidebar left, the chat right, and the page card between them under the toolbar", () => {
    const layout = computeLayout({ width: 1280, height: 800 }, both);

    expect(layout.sidebar).toEqual({ x: 0, y: 0, width: 240, height: 800 });
    expect(layout.chat).toEqual({ x: 920, y: 0, width: 360, height: 800 });
    expect(layout.toolbar).toEqual({ x: 240, y: 0, width: 680, height: 44 });
    expect(layout.page).toEqual({ x: 240, y: 44, width: 680, height: 748 });
  });

  it("insets the page card from the frame where a panel is closed", () => {
    const layout = computeLayout(
      { width: 1280, height: 800 },
      { sidebarOpen: false, chatOpen: false, ...mac }
    );

    expect(layout.sidebar.width).toBe(0);
    expect(layout.chat.width).toBe(0);
    expect(layout.toolbar).toEqual({ x: 0, y: 0, width: 1280, height: 44 });
    expect(layout.page).toEqual({ x: 8, y: 44, width: 1264, height: 748 });
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

    expect(computeLayout(size, both).controls).toEqual({ x: 0, y: 0, width: 80, height: 44 });
    expect(computeLayout(size, { ...both, platform: "win32" }).controls).toEqual({
      x: 1142,
      y: 0,
      width: 138,
      height: 44,
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

      for (const rect of [layout.sidebar, layout.toolbar, layout.chat, layout.page, layout.controls]) {
        expect(rect.width).toBeGreaterThanOrEqual(0);
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
