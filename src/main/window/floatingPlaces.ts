import type { Layout, Point, Rect } from "../../shared/ipc";
import { clamp, FLOATING_INSET } from "./Layout";

export const PROMPT_WIDTH = 408;
export const PROMPT_DEFAULT_HEIGHT = 200;

// The site permission card, in the page's top corner with room around it for its shadow. The card sizes the height.
export const promptRect = (page: Rect, cardHeight: number): Rect => {
  const height = Math.round(Math.min(Math.max(cardHeight, 1), page.height));
  return { x: page.x, y: page.y, width: Math.min(PROMPT_WIDTH, page.width), height };
};

// The list under the address field while it's being edited: a menu sheet as wide as the field, 8px under it, with 40px
// rows, 6px inside its edges, and a hairline with 6px either side before asking a mascot. The view has room round the
// sheet for the whole of its `lift` shadow, but none above it, so it never covers the field.
const SUGGESTIONS = { gap: 8, row: 40, padding: 6, rule: 13, side: 24, below: 40 };

export const suggestionsRect = (
  field: Rect,
  rows: number,
  ruled: boolean,
  window: { width: number; height: number },
): { view: Rect; sheet: Rect } => {
  const { gap, row, padding, rule, side, below } = SUGGESTIONS;
  const sheetHeight = 2 * padding + rows * row + (ruled ? rule : 0);
  const x = Math.max(Math.round(field.x) - side, 0);
  const y = Math.round(field.y + field.height + gap);
  const width = Math.max(Math.min(Math.round(field.width) + 2 * side, window.width - x), 0);
  const height = Math.max(Math.min(sheetHeight + below, window.height - y), 0);
  const sheetX = Math.round(field.x) - x;
  const sheet = {
    x: sheetX,
    y: 0,
    width: Math.max(Math.min(Math.round(field.width), width - sheetX), 0),
    height: Math.min(sheetHeight, height),
  };
  return { view: { x, y, width, height }, sheet };
};

// A tooltip over the page: a strip as wide as the window, with room under the pill for its shadow and only a little above
// it, so the strip never reaches the control it belongs to. Along a row the strip stays where it is and the pill slides
// inside it, so moving to a neighbour moves nothing native, which would judder.
const TOOLTIP_ROOM = { above: 2, below: 14 };
export const tooltipRect = (pill: Rect, window: { width: number; height: number }): { view: Rect; pill: Rect } => {
  const { above, below } = TOOLTIP_ROOM;
  const y = Math.min(Math.max(Math.round(pill.y) - above, 0), window.height);
  const height = Math.max(Math.min(Math.round(pill.height) + above + below, window.height - y), 0);
  return {
    view: { x: 0, y, width: Math.max(window.width, 0), height },
    pill: { x: Math.round(pill.x), y: Math.round(pill.y) - y, width: Math.round(pill.width), height: Math.round(pill.height) },
  };
};

// Our menus (DESIGN.md section 8). A menu opens 4px under its button, or at the pointer, and a submenu 4px beside its
// row, with its first row level with it. All of them stay 8px inside the area, moving in, or opening upward when there's
// no room below. The view holds the sheets and room for their `lift` shadow, which falls mostly downwards and is darkest
// in dark mode, so it fades out before the view's edge even over a white page.
const MENU = { gap: 4, edge: 8, padding: 6, room: { side: 32, above: 16, below: 48 } };

export interface MenuSheetBox {
  // "" for the menu, and a submenu by its row's place: "3", "3.1".
  path: string;
  width: number;
  height: number;
  // Where its row starts in the sheet above it.
  rowTop: number;
}

const parentPath = (path: string): string | null => (path === "" ? null : path.split(".").slice(0, -1).join("."));

// Where each sheet goes in the view, and the view in the area. Anchors and the area are in the same coordinates: the
// window's, or the screen's for the desktop. Null without the menu itself, or with a submenu whose row isn't placed.
export const menuPlacement = (anchor: Rect, sheets: MenuSheetBox[], area: Rect): { view: Rect; sheets: Record<string, Point> } | null => {
  const { gap, edge, padding, room } = MENU;
  const right = area.x + area.width - edge;
  const bottom = area.y + area.height - edge;
  const fit = (sheet: MenuSheetBox) => ({
    width: Math.round(Math.min(sheet.width, area.width - 2 * edge)),
    height: Math.round(Math.min(sheet.height, area.height - 2 * edge)),
  });
  const placed = new Map<string, Rect>();

  const root = sheets.find(({ path }) => path === "");
  if (!root) return null;
  const { width, height } = fit(root);
  const point = anchor.width === 0 && anchor.height === 0;
  const below = point ? anchor.y : anchor.y + anchor.height + gap;
  const above = point ? anchor.y - height : anchor.y - gap - height;
  const y = below + height <= bottom ? below : above >= area.y + edge ? above : clamp(below, area.y + edge, bottom - height);
  placed.set("", { x: Math.round(clamp(anchor.x, area.x + edge, right - width)), y: Math.round(y), width, height });

  // Parents before their submenus.
  const nested = sheets.filter(({ path }) => path !== "").sort((a, b) => a.path.split(".").length - b.path.split(".").length);
  for (const sheet of nested) {
    const parent = placed.get(parentPath(sheet.path) ?? "");
    if (!parent) return null;
    const { width, height } = fit(sheet);
    const toRight = parent.x + parent.width + gap;
    const toLeft = parent.x - gap - width;
    const x =
      toRight + width <= right
        ? toRight
        : toLeft >= area.x + edge
          ? toLeft
          : right - toRight > toLeft - area.x
            ? clamp(toRight, area.x + edge, right - width)
            : area.x + edge;
    const y = clamp(parent.y + sheet.rowTop - padding, area.y + edge, bottom - height);
    placed.set(sheet.path, { x: Math.round(x), y: Math.round(y), width, height });
  }

  const rects = [...placed.values()];
  const left = Math.max(Math.min(...rects.map((rect) => rect.x)) - room.side, area.x);
  const top = Math.max(Math.min(...rects.map((rect) => rect.y)) - room.above, area.y);
  const viewRight = Math.min(Math.max(...rects.map((rect) => rect.x + rect.width)) + room.side, area.x + area.width);
  const viewBottom = Math.min(Math.max(...rects.map((rect) => rect.y + rect.height)) + room.below, area.y + area.height);
  return {
    view: { x: left, y: top, width: viewRight - left, height: viewBottom - top },
    sheets: Object.fromEntries([...placed].map(([path, rect]) => [path, { x: rect.x - left, y: rect.y - top }])),
  };
};

// A tab's preview card (DESIGN.md section 8): 280px wide, its picture 16:10, then up to two lines of title, its site
// and, while a mascot works there, a line saying so. Its words take at most `words` and the working line `working`.
export const TAB_PREVIEW = { width: 280, picture: 175, words: 77, working: 22 };
// From the sidebar's edge, under the tab row, and from the window's edges.
const TAB_PREVIEW_GAP = { sidebar: 8, row: 6, edge: 8 };
// Room in the view for the card's `lift` shadow, which falls mostly downwards.
const TAB_PREVIEW_SHADOW = { side: 24, below: 40 };

// The tallest the card can be, counting its title as two lines.
const tabPreviewHeight = (card: { picture: boolean; working: boolean }): number =>
  (card.picture ? TAB_PREVIEW.picture : 0) + TAB_PREVIEW.words + (card.working ? TAB_PREVIEW.working : 0);

// Where a tab's card goes, for a tab whose row is at `row` in the window. Its view starts at the sidebar's edge or the tab
// row's, so it never covers a tab, and it's one strip along the tabs, the window's height beside the sidebar and its width
// under the row, so following the pointer from tab to tab moves the card inside it and never the native view.
export const tabPreviewRect = (
  layout: Pick<Layout, "mode" | "sidebarOpen" | "sidebarWidth" | "tabStrip">,
  row: Rect,
  card: { picture: boolean; working: boolean },
  window: { width: number; height: number },
): { view: Rect; card: Rect } => {
  const { edge } = TAB_PREVIEW_GAP;
  const height = tabPreviewHeight(card);
  const width = TAB_PREVIEW.width;
  if (layout.mode === "vertical") {
    // The sidebar's edge, or the floating sidebar's card's when it's collapsed.
    const sidebarEdge = layout.sidebarOpen ? layout.sidebarWidth : FLOATING_INSET + layout.sidebarWidth;
    const viewWidth = Math.max(Math.min(TAB_PREVIEW_GAP.sidebar + width + TAB_PREVIEW_SHADOW.side, window.width - sidebarEdge), 0);
    const x = Math.max(Math.min(TAB_PREVIEW_GAP.sidebar, window.width - edge - width - sidebarEdge), 0);
    const y = clamp(Math.round(row.y), edge, window.height - edge - height);
    return {
      view: { x: sidebarEdge, y: 0, width: viewWidth, height: Math.max(window.height, 0) },
      card: { x, y, width, height },
    };
  }
  const rowBottom = layout.tabStrip.y + layout.tabStrip.height;
  const tallest = tabPreviewHeight({ picture: true, working: true });
  const viewHeight = Math.max(Math.min(TAB_PREVIEW_GAP.row + tallest + TAB_PREVIEW_SHADOW.below, window.height - rowBottom), 0);
  return {
    view: { x: 0, y: rowBottom, width: Math.max(window.width, 0), height: viewHeight },
    card: { x: clamp(Math.round(row.x), edge, window.width - edge - width), y: TAB_PREVIEW_GAP.row, width, height },
  };
};
