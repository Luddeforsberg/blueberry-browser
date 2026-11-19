import { describe, expect, it } from "vitest";
import { menuPlacement, promptRect, PROMPT_WIDTH, suggestionsRect, tabPreviewRect, TAB_PREVIEW } from "./floatingPlaces";

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

describe("suggestionsRect", () => {
  it("puts the list under the field, as wide as it, with room for its shadow but none over the field", () => {
    const field = { x: 400, y: 8, width: 560, height: 32 };
    const { view, sheet } = suggestionsRect(field, 4, true, { width: 1280, height: 800 });
    expect(view).toEqual({ x: 376, y: 48, width: 608, height: 12 + 160 + 13 + 40 });
    expect(sheet).toEqual({ x: 24, y: 0, width: 560, height: 12 + 160 + 13 });
  });

  it("stays inside the window at its edges", () => {
    const { view, sheet } = suggestionsRect({ x: 4, y: 8, width: 900, height: 32 }, 6, false, { width: 910, height: 200 });
    expect(view).toEqual({ x: 0, y: 48, width: 910, height: 152 });
    expect(sheet).toEqual({ x: 4, y: 0, width: 900, height: 152 });
  });
});

describe("tabPreviewRect", () => {
  const window = { width: 1280, height: 800 };
  const sidebar = { mode: "vertical" as const, sidebarOpen: true, sidebarWidth: 248, tabStrip: { x: 0, y: 0, width: 0, height: 0 } };
  const tabRow = { mode: "horizontal" as const, sidebarOpen: false, sidebarWidth: 248, tabStrip: { x: 0, y: 0, width: 1280, height: 42 } };
  const full = { picture: true, working: false };
  const tallest = TAB_PREVIEW.picture + TAB_PREVIEW.words;

  it("puts the card 8px from the sidebar's edge, level with the row's top, in a view that starts at the edge", () => {
    const { view, card } = tabPreviewRect(sidebar, { x: 8, y: 120, width: 232, height: 32 }, full, window);
    expect(view).toEqual({ x: 248, y: 0, width: 8 + 280 + 24, height: 800 });
    expect(card).toEqual({ x: 8, y: 120, width: 280, height: tallest });
  });

  it("goes beside the floating sidebar's card when the sidebar is collapsed", () => {
    const { view } = tabPreviewRect({ ...sidebar, sidebarOpen: false }, { x: 16, y: 120, width: 232, height: 32 }, full, window);
    expect(view.x).toBe(8 + 248);
  });

  it("moves up near the bottom of the window just enough to stay 8px inside it", () => {
    const fits = 800 - 8 - tallest;
    expect(tabPreviewRect(sidebar, { x: 8, y: fits, width: 232, height: 32 }, full, window).card.y).toBe(fits);
    expect(tabPreviewRect(sidebar, { x: 8, y: fits + 1, width: 232, height: 32 }, full, window).card.y).toBe(fits);
    expect(tabPreviewRect(sidebar, { x: 8, y: 760, width: 232, height: 32 }, full, window).card.y).toBe(fits);
  });

  it("counts the working line and no picture in how far it has to move up", () => {
    const row = { x: 8, y: 760, width: 232, height: 32 };
    expect(tabPreviewRect(sidebar, row, { picture: true, working: true }, window).card.y).toBe(800 - 8 - tallest - TAB_PREVIEW.working);
    expect(tabPreviewRect(sidebar, row, { picture: false, working: false }, window).card.y).toBe(800 - 8 - TAB_PREVIEW.words);
  });

  it("never goes above the window's top", () => {
    expect(tabPreviewRect(sidebar, { x: 8, y: 120, width: 232, height: 32 }, full, { width: 1280, height: 200 }).card.y).toBe(8);
  });

  it("puts the card 6px under the tab row, at the tab's left, in a strip as wide as the window under the row", () => {
    const { view, card } = tabPreviewRect(tabRow, { x: 300, y: 5, width: 196, height: 32 }, full, window);
    expect(view).toEqual({ x: 0, y: 42, width: 1280, height: 6 + tallest + TAB_PREVIEW.working + 40 });
    expect(card).toEqual({ x: 300, y: 6, width: 280, height: tallest });
  });

  it("keeps the card inside the window at either end of the tab row", () => {
    expect(tabPreviewRect(tabRow, { x: 1200, y: 5, width: 72, height: 32 }, full, window).card.x).toBe(1280 - 8 - 280);
    expect(tabPreviewRect(tabRow, { x: 0, y: 5, width: 72, height: 32 }, full, window).card.x).toBe(8);
  });

  it("keeps the strip's size the same whatever the card holds, so following along the tabs never moves the view", () => {
    const row = { x: 300, y: 5, width: 196, height: 32 };
    expect(tabPreviewRect(tabRow, row, { picture: false, working: false }, window).view).toEqual(
      tabPreviewRect(tabRow, row, { picture: true, working: true }, window).view,
    );
    expect(tabPreviewRect(sidebar, row, { picture: false, working: false }, window).view).toEqual(
      tabPreviewRect(sidebar, { ...row, y: 600 }, full, window).view,
    );
  });
});

describe("menuPlacement", () => {
  const area = { x: 0, y: 0, width: 1000, height: 700 };
  const sheet = (path: string, width = 200, height = 100, rowTop = 0) => ({ path, width, height, rowTop });
  const button = (x: number, y: number) => ({ x, y, width: 24, height: 24 });
  const point = (x: number, y: number) => ({ x, y, width: 0, height: 0 });
  // Where a sheet ended up in the area.
  const where = (placed: ReturnType<typeof menuPlacement>, path: string) => {
    if (!placed) throw new Error("Not placed");
    const at = placed.sheets[path];
    return { x: placed.view.x + at.x, y: placed.view.y + at.y };
  };

  it("opens 4px under its button, in a view only as big as the menu and its shadow", () => {
    const placed = menuPlacement(button(100, 40), [sheet("")], area);
    expect(where(placed, "")).toEqual({ x: 100, y: 68 });
    expect(placed?.view).toEqual({ x: 68, y: 52, width: 264, height: 164 });
  });

  it("opens at the pointer, moved in from the right edge", () => {
    expect(where(menuPlacement(point(300, 200), [sheet("")], area), "")).toEqual({ x: 300, y: 200 });
    expect(where(menuPlacement(point(950, 200), [sheet("")], area), "")).toEqual({ x: 792, y: 200 });
  });

  it("opens upward when there's no room below, from the pointer or over the button", () => {
    expect(where(menuPlacement(point(300, 650), [sheet("")], area), "").y).toBe(550);
    expect(where(menuPlacement(button(100, 640), [sheet("")], area), "").y).toBe(536);
  });

  it("keeps a menu taller than the room inside it, cut to the area", () => {
    const short = { ...area, height: 200 };
    const placed = menuPlacement(point(10, 100), [sheet("", 200, 300)], short);
    expect(where(placed, "").y).toBe(8);
    expect(placed?.view.y).toBe(0);
    expect((placed?.view.y ?? 0) + (placed?.view.height ?? 0)).toBeLessThanOrEqual(200);
  });

  it("opens a submenu beside its row, on the side with room", () => {
    const right = menuPlacement(button(100, 40), [sheet(""), sheet("2", 150, 80, 46)], area);
    expect(where(right, "2")).toEqual({ x: 304, y: 108 });
    const left = menuPlacement(button(790, 40), [sheet(""), sheet("2", 150, 80, 46)], area);
    expect(where(left, "")).toEqual({ x: 790, y: 68 });
    expect(where(left, "2")).toEqual({ x: 636, y: 108 });
  });

  it("holds every sheet in one view that never leaves the area", () => {
    const placed = menuPlacement(point(0, 0), [sheet(""), sheet("0", 150, 80, 6)], area);
    expect(placed?.view.x).toBe(0);
    expect(placed?.view.y).toBe(0);
    expect(where(placed, "")).toEqual({ x: 8, y: 0 });
  });

  it("works in screen coordinates, on a display that doesn't start at 0", () => {
    const display = { x: 1920, y: 0, width: 1280, height: 1040 };
    expect(where(menuPlacement(point(3150, 500), [sheet("")], display), "")).toEqual({ x: 2992, y: 500 });
  });

  it("places nothing without the menu itself, or for a submenu whose row isn't placed", () => {
    expect(menuPlacement(point(10, 10), [], area)).toBeNull();
    expect(menuPlacement(point(10, 10), [sheet("2")], area)).toBeNull();
    expect(menuPlacement(point(10, 10), [sheet(""), sheet("3.1")], area)).toBeNull();
  });
});
