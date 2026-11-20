import { describe, expect, it } from "vitest";
import { computeLayout, MIN_PAGE_WIDTH, promptRect, PROMPT_WIDTH, suggestionsRect,
  DESKTOP_DEFAULT_SPOT,
  desktopBoxPlace,
  desktopHit,
  desktopPlace,
  desktopRestingDrop,
  desktopSheetsPlace,
  desktopSpotAt,
  menuPlacement,
  tabPreviewRect,
  TAB_PREVIEW,
} from "./Layout";
import { DESKTOP_BOX, DESKTOP_DROP, DESKTOP_FILLET } from "../shared/desktopSizes";

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
    expect(findBar).toEqual({ x: page.x + page.width - 384, y: page.y, width: 384, height: 72 });

    const tiny = computeLayout({ width: 300, height: 90 }, { sidebarOpen: false, chatOpen: false, ...mac });
    expect(tiny.findBar).toEqual({ x: 8, y: 48, width: 284, height: 34 });
  });

  it("keeps the gutter round the page when both panels are gone", () => {
    const layout = computeLayout(
      { width: 1280, height: 800 },
      { sidebarOpen: false, chatOpen: false, ...mac }
    );

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
        layout.menuButton,
      ]) {
        expect(rect.width).toBeGreaterThanOrEqual(0);
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("puts a tab row and a toolbar above the page in horizontal mode, with no sidebar, and a bookmarks bar only with something saved", () => {
    const layout = computeLayout(
      { width: 1280, height: 800 },
      { ...both, mode: "horizontal" }
    );

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
    const resized = computeLayout(
      { width: 1400, height: 800 },
      { ...both, sidebarWidth: 300, chatWidth: 400 }
    );
    expect(resized.sidebar.width).toBe(300);
    expect(resized.chat).toEqual({ x: 992, y: 48, width: 400, height: 744 });
    expect(resized.page.width).toBe(684);

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

describe("the drop on the desktop", () => {
  const area = { x: 100, y: 25, width: 1000, height: 700 };
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const EDGES = ["bottom", "top", "left", "right"] as const;
  const FRACTIONS = [0, 0.25, 0.5, 0.51, 1];
  type Box = { x: number; y: number; width: number; height: number };
  const inside = (rect: Box, within: Box) =>
    rect.x >= within.x && rect.y >= within.y && rect.x + rect.width <= within.x + within.width && rect.y + rect.height <= within.y + within.height;
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const onScreen = (window: Box, rect: Box): Box => ({ ...rect, x: window.x + rect.x, y: window.y + rect.y });
  const side = (edge: (typeof EDGES)[number]) => edge === "left" || edge === "right";

  it("keeps its window one size along an edge, and on screen, at every edge and corner", () => {
    EDGES.forEach((edge) => {
      const { width, height } = desktopPlace(area, { edge, fraction: 0 }).window;
      FRACTIONS.forEach((fraction) => {
        const { window } = desktopPlace(area, { edge, fraction });
        expect(inside(window, area)).toBe(true);
        expect([window.width, window.height]).toEqual([width, height]);
      });
    });
  });

  it("puts the side of its window along the edge it's on, with the drop's middle on that side", () => {
    const at = (edge: (typeof EDGES)[number]) => desktopPlace(area, { edge, fraction: 0.3 });
    expect(at("bottom").window.y + at("bottom").window.height).toBe(bottom);
    expect(at("bottom").anchor.y).toBe(at("bottom").window.height);
    expect(at("top").window.y).toBe(area.y);
    expect(at("top").anchor.y).toBe(0);
    expect(at("left").window.x).toBe(area.x);
    expect(at("left").anchor.x).toBe(0);
    expect(at("right").window.x + at("right").window.width).toBe(right);
    expect(at("right").anchor.x).toBe(at("right").window.width);
  });

  it("rests 28 out of the edge and 32 along it, wholly in its window with its fillets, and that's what takes the pointer", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const place = desktopPlace(area, { edge, fraction });
        const window = { x: 0, y: 0, width: place.window.width, height: place.window.height };
        const drop = desktopRestingDrop(place, edge);
        expect(side(edge) ? [drop.width, drop.height] : [drop.height, drop.width]).toEqual([DESKTOP_DROP.out, DESKTOP_DROP.along]);
        const withFillets = side(edge)
          ? { ...drop, y: drop.y - DESKTOP_FILLET, height: drop.height + 2 * DESKTOP_FILLET }
          : { ...drop, x: drop.x - DESKTOP_FILLET, width: drop.width + 2 * DESKTOP_FILLET };
        expect(inside(withFillets, window)).toBe(true);
        if (edge === "bottom") expect(drop.y + drop.height).toBe(window.height);
        if (edge === "top") expect(drop.y).toBe(0);
        if (edge === "left") expect(drop.x).toBe(0);
        if (edge === "right") expect(drop.x + drop.width).toBe(window.width);
      })
    );
  });

  it("starts on the right edge, a little below the middle", () => {
    expect(DESKTOP_DEFAULT_SPOT.edge).toBe("right");
    const { window, anchor } = desktopPlace(area, DESKTOP_DEFAULT_SPOT);
    const middle = window.y + anchor.y;
    expect(middle).toBeGreaterThan(area.y + area.height / 2);
    expect(middle).toBeLessThan(area.y + area.height * 0.75);
  });

  it("grows the prompt box from the drop's own place on the edge, and keeps it on screen", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const spot = { edge, fraction };
        const drop = desktopPlace(area, spot);
        const box = desktopBoxPlace(area, spot);
        expect(inside(box.window, area)).toBe(true);
        // The same point on the screen, so the box grows out of the drop.
        expect({ x: box.window.x + box.anchor.x, y: box.window.y + box.anchor.y }).toEqual({ x: drop.window.x + drop.anchor.x, y: drop.window.y + drop.anchor.y });
        if (edge === "right") expect(box.window.x + box.window.width).toBe(right);
        if (edge === "bottom") expect(box.window.y + box.window.height).toBe(bottom);
        // Long enough for the box, and its fillets along the top and bottom.
        const long = side(edge) ? box.window.width : box.window.width - 2 * DESKTOP_FILLET;
        expect(long).toBeGreaterThanOrEqual(DESKTOP_BOX.long);
      })
    );
    // Away from the corners, the box's window is centred on the drop, with as much room for the chips over it as for the
    // keys under it.
    EDGES.forEach((edge) => {
      const { window, anchor } = desktopBoxPlace(area, { edge, fraction: 0.5 });
      if (side(edge)) expect(Math.abs(anchor.y - window.height / 2)).toBeLessThanOrEqual(1);
      else expect(Math.abs(anchor.x - window.width / 2)).toBeLessThanOrEqual(1);
    });
    // Taller with more lines, and never past the screen.
    expect(inside(desktopBoxPlace(area, { edge: "right", fraction: 1 }, 2000).window, area)).toBe(true);
    expect(desktopBoxPlace(area, { edge: "right", fraction: 0.5 }, 140).window.height).toBeGreaterThan(desktopBoxPlace(area, { edge: "right", fraction: 0.5 }).window.height);
  });

  it("puts the tray and the ask beside the drop, clear of it, and on screen at any size", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const spot = { edge, fraction };
        const sheets = desktopSheetsPlace(area, spot, { width: 372, height: 420 });
        expect(inside(sheets.window, area)).toBe(true);
        const drop = desktopPlace(area, spot);
        expect(overlaps(sheets.window, onScreen(drop.window, desktopRestingDrop(drop, edge)))).toBe(false);
      })
    );
    const tiny = { x: 0, y: 0, width: 300, height: 200 };
    EDGES.forEach((edge) => {
      expect(inside(desktopSheetsPlace(tiny, { edge, fraction: 1 }, { width: 720, height: 900 }).window, tiny)).toBe(true);
      expect(inside(desktopPlace(tiny, { edge, fraction: 1 }).window, tiny)).toBe(true);
      expect(inside(desktopBoxPlace(tiny, { edge, fraction: 1 }).window, tiny)).toBe(true);
    });
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

  it("lands where it was let go along the edge", () => {
    const spot = desktopSpotAt(area, 7, { x: right - 3, y: area.y + 300 });
    const { window, anchor } = desktopPlace(area, spot);
    expect(Math.abs(window.y + anchor.y - (area.y + 300))).toBeLessThanOrEqual(1);
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
    expect(tabPreviewRect(tabRow, row, { picture: false, working: false }, window).view).toEqual(tabPreviewRect(tabRow, row, { picture: true, working: true }, window).view);
    expect(tabPreviewRect(sidebar, row, { picture: false, working: false }, window).view).toEqual(tabPreviewRect(sidebar, { ...row, y: 600 }, full, window).view);
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
