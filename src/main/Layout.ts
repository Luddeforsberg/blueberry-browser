import type { DesktopBerrySpot, DesktopEdge, Layout, LayoutMode, Point, Rect } from "../shared/ipc";
import { DESKTOP_BOX, DESKTOP_DROP, DESKTOP_DROP_MOST, DESKTOP_FILLET, DESKTOP_SHADOW } from "../shared/desktopSizes";

export type { Layout, LayoutMode, Rect };

// DESIGN.md section 2, to tune.
export const SIDEBAR_WIDTH = { default: 248, min: 200, max: 360 };
export const CHAT_WIDTH = { default: 348, min: 320, max: 480 };
// The toolbar is a row on the ground above the page. In the vertical layout the window buttons share it.
export const TOOLBAR_HEIGHT = 48;
// The horizontal layout's three rows above the page: tabs, the toolbar, and the bookmarks bar, which is only there with
// something saved, since there's no sidebar to hold the bookmarks.
export const TAB_ROW_HEIGHT = 42;
const HORIZONTAL_TOOLBAR_HEIGHT = 44;
const BOOKMARKS_BAR_HEIGHT = 40;
// The gutter: the ground showing between the page's sheet and the window's right and bottom edges, and between sheets.
export const PAGE_INSET = 8;
export const FLOATING_INSET = 8;
// The find bar's card with 12px on every side, for its shadow.
export const FIND_BAR = { width: 384, height: 72 };
export const MIN_PAGE_WIDTH = 480;
export const PROMPT_WIDTH = 408;
export const PROMPT_DEFAULT_HEIGHT = 200;
export const MIN_WINDOW = { width: 900, height: 600 };

// Room kept clear for the system's window buttons.
const MAC_CONTROLS_WIDTH = 80;
const WINDOWS_CONTROLS_WIDTH = 138;
// Off a Mac the menu bar is hidden, so a button left of the window buttons opens the app's menu. It's the size of a
// toolbar button, with this much room on each side.
const MENU_BUTTON_SIZE = 32;
const MENU_BUTTON_GAP = 4;

export interface LayoutOptions {
  mode: LayoutMode;
  sidebarOpen: boolean;
  chatOpen: boolean;
  sidebarWidth: number;
  chatWidth: number;
  platform: NodeJS.Platform;
  // Whether anything is saved, for the horizontal layout's bookmarks bar.
  savedSites?: boolean;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const clampWidth = (width: number, range: { min: number; max: number }): number =>
  Math.round(Math.min(Math.max(width, range.min), range.max));

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

// The drop on the edge of the screen (DESIGN.md, On your desktop), with its sizes in src/shared/desktopSizes.ts. Its
// window keeps one size wherever it stands, big enough for everything the drop says by itself, so nothing native moves
// or resizes while it grows.
const DESKTOP_SHEETS_FROM_EDGE = DESKTOP_DROP.out + 8;
// Let go this close to a corner, and that's where it goes.
const DESKTOP_CORNER_SNAP = 56;
// With nothing saved, the right edge, a little below the middle, where no taskbar or Dock is under it.
export const DESKTOP_DEFAULT_SPOT = { edge: "right", fraction: 0.6 } as const;

type Spot = Pick<DesktopBerrySpot, "edge" | "fraction">;

export interface DesktopPlace {
  window: Rect;
  // The middle of the drop, on the edge, in the window. It can be outside the window, for the sheets beside it.
  anchor: Point;
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));

export const sideEdge = (edge: DesktopEdge): boolean => edge === "left" || edge === "right";

// From its middle to the end of a fillet, along the edge, so that at rest it's wholly on screen however far along it is.
const DESKTOP_REACH = DESKTOP_FILLET + DESKTOP_DROP.along / 2;

// The middle of the drop on the screen: a point on the edge.
const dropMiddle = (area: Rect, { edge, fraction }: Spot): Point => {
  const across = sideEdge(edge);
  const start = across ? area.y : area.x;
  const length = across ? area.height : area.width;
  const along = Math.round(start + Math.min(DESKTOP_REACH, length / 2) + clamp(fraction, 0, 1) * Math.max(length - 2 * DESKTOP_REACH, 0));
  if (edge === "right") return { x: area.x + area.width, y: along };
  if (edge === "left") return { x: area.x, y: along };
  if (edge === "top") return { x: along, y: area.y };
  return { x: along, y: area.y + area.height };
};

// A window against the edge, `out` from it and `along` it, centred on the drop and wholly inside the work area.
const againstEdge = (area: Rect, edge: DesktopEdge, middle: Point, out: number, along: number): Rect => {
  const width = Math.min(sideEdge(edge) ? out : along, area.width);
  const height = Math.min(sideEdge(edge) ? along : out, area.height);
  const x =
    edge === "right"
      ? area.x + area.width - width
      : edge === "left"
        ? area.x
        : clamp(middle.x - width / 2, area.x, area.x + area.width - width);
  const y =
    edge === "bottom"
      ? area.y + area.height - height
      : edge === "top"
        ? area.y
        : clamp(middle.y - height / 2, area.y, area.y + area.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
};

const placed = (window: Rect, middle: Point): DesktopPlace => ({ window, anchor: { x: middle.x - window.x, y: middle.y - window.y } });

// The drop's own window. Along a side edge it grows out of it, and along the top or bottom it grows along it.
export const desktopPlace = (area: Rect, spot: Spot): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const { long, thick } = DESKTOP_DROP_MOST;
  const across = thick + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW);
  return placed(
    sideEdge(spot.edge)
      ? againstEdge(area, spot.edge, middle, long + DESKTOP_SHADOW, across)
      : againstEdge(area, spot.edge, middle, thick + DESKTOP_SHADOW, long + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW)),
    middle,
  );
};

// The drop at rest in its window, without its fillets: what takes the pointer until the view says what it's drawing.
export const desktopRestingDrop = ({ anchor }: Pick<DesktopPlace, "anchor">, edge: DesktopEdge): Rect => {
  const { along, out } = DESKTOP_DROP;
  if (sideEdge(edge)) return { x: edge === "right" ? anchor.x - out : anchor.x, y: anchor.y - along / 2, width: out, height: along };
  return { x: anchor.x - along / 2, y: edge === "bottom" ? anchor.y - out : anchor.y, width: along, height: out };
};

// The prompt box's window: from the same place on the edge, so the drop can grow into it. Along a side edge it grows
// out of the edge, and along the top or bottom it grows along it. `thick` is the box's own, taller with more lines.
export const desktopBoxPlace = (area: Rect, spot: Spot, thick: number = DESKTOP_BOX.thick): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const across = Math.max(thick, DESKTOP_BOX.thick) + 2 * DESKTOP_BOX.around;
  return placed(
    sideEdge(spot.edge)
      ? againstEdge(area, spot.edge, middle, DESKTOP_BOX.long + DESKTOP_SHADOW, across)
      : againstEdge(area, spot.edge, middle, across, DESKTOP_BOX.long + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW)),
    middle,
  );
};

// The tray and the ask: beside the drop, towards the middle of the screen, and wholly on screen at any size.
export const desktopSheetsPlace = (area: Rect, spot: Spot, size: { width: number; height: number }): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const { edge } = spot;
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  const x =
    edge === "right"
      ? area.x + area.width - DESKTOP_SHEETS_FROM_EDGE - width
      : edge === "left"
        ? area.x + DESKTOP_SHEETS_FROM_EDGE
        : middle.x - width / 2;
  const y =
    edge === "bottom"
      ? area.y + area.height - DESKTOP_SHEETS_FROM_EDGE - height
      : edge === "top"
        ? area.y + DESKTOP_SHEETS_FROM_EDGE
        : middle.y - height / 2;
  const window = {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
  return placed(window, middle);
};

// The nearest edge to a point on a display, and how far along it. Near a corner, it's the corner.
export const desktopSpotAt = (area: Rect, displayId: number, point: Point): DesktopBerrySpot => {
  const distances: Array<[DesktopEdge, number]> = [
    ["bottom", area.y + area.height - point.y],
    ["top", point.y - area.y],
    ["left", point.x - area.x],
    ["right", area.x + area.width - point.x],
  ];
  const [edge] = distances.reduce((nearest, next) => (next[1] < nearest[1] ? next : nearest));
  const horizontal = !sideEdge(edge);
  const start = horizontal ? area.x : area.y;
  const length = horizontal ? area.width : area.height;
  const at = (horizontal ? point.x : point.y) - start;
  if (at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 0 };
  if (length - at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 1 };
  const room = length - 2 * DESKTOP_REACH;
  return { displayId, edge, fraction: room > 0 ? clamp((at - DESKTOP_REACH) / room, 0, 1) : 0 };
};

export const desktopHit = (point: Point, window: Rect, hits: Rect[]): boolean =>
  hits.some(({ x, y, width, height }) => {
    const left = window.x + x;
    const top = window.y + y;
    return point.x >= left && point.x < left + width && point.y >= top && point.y < top + height;
  });

// The only place that decides where the window's regions go.
export function computeLayout(window: { width: number; height: number }, options: LayoutOptions): Layout {
  const { mode, platform } = options;
  const sidebarWidth = clampWidth(options.sidebarWidth, SIDEBAR_WIDTH);
  const chatWidth = clampWidth(options.chatWidth, CHAT_WIDTH);
  const vertical = mode === "vertical";

  // The chat panel is a second sheet, with the gutter between it and the page.
  const pageWidth = (sidebar: boolean, chat: boolean) =>
    window.width - (sidebar ? sidebarWidth : PAGE_INSET) - (chat ? chatWidth + PAGE_INSET : 0) - PAGE_INSET;

  // When space runs out, the sidebar collapses first and the chat closes next.
  let sidebar = vertical && options.sidebarOpen;
  let chat = options.chatOpen;
  if (sidebar && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) sidebar = false;
  if (chat && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) chat = false;

  const left = sidebar ? sidebarWidth : 0;
  const { height } = window;
  const cardX = sidebar ? left : PAGE_INSET;
  const chatX = Math.max(window.width - PAGE_INSET - chatWidth, 0);
  const cardRight = chat ? chatX - PAGE_INSET : window.width - PAGE_INSET;
  const cardWidth = Math.max(cardRight - cardX, 0);

  // The top row holds the window buttons: the toolbar when vertical, the tab row when horizontal.
  // Off a Mac, the menu button is part of what's kept clear, so whatever sits in the top right corner leaves room for it.
  const topRow = vertical ? TOOLBAR_HEIGHT : TAB_ROW_HEIGHT;
  const mac = platform === "darwin";
  // Linux has no window buttons of its own here, only the menu button.
  const systemButtons = platform === "win32" ? WINDOWS_CONTROLS_WIDTH : 0;
  // In the horizontal layout the menu button is at the toolbar's end, so the tab row keeps only the system's buttons clear.
  const menuInTopRow = !mac && vertical;
  const controlsWidth = mac ? MAC_CONTROLS_WIDTH : systemButtons + (menuInTopRow ? MENU_BUTTON_SIZE + 2 * MENU_BUTTON_GAP : 0);
  const controls: Rect = mac
    ? { x: 0, y: 0, width: controlsWidth, height: topRow }
    : {
        x: Math.max(window.width - controlsWidth, 0),
        y: 0,
        width: Math.min(controlsWidth, window.width),
        height: topRow,
      };
  // In the horizontal layout it ends the toolbar instead, at the gutter's width from the window's edge.
  const menuButton: Rect = mac
    ? EMPTY
    : menuInTopRow
      ? {
          x: Math.max(window.width - systemButtons - MENU_BUTTON_GAP - MENU_BUTTON_SIZE, 0),
          y: Math.round((topRow - MENU_BUTTON_SIZE) / 2),
          width: MENU_BUTTON_SIZE,
          height: MENU_BUTTON_SIZE,
        }
      : {
          x: Math.max(window.width - PAGE_INSET - MENU_BUTTON_SIZE, 0),
          y: TAB_ROW_HEIGHT + Math.round((HORIZONTAL_TOOLBAR_HEIGHT - MENU_BUTTON_SIZE) / 2),
          width: MENU_BUTTON_SIZE,
          height: MENU_BUTTON_SIZE,
        };

  // The tab row and the toolbar run over the chat panel too, so the panel's button stays at the window's edge.
  const tabStrip = vertical ? EMPTY : { x: 0, y: 0, width: window.width, height: TAB_ROW_HEIGHT };
  const toolbarY = vertical ? 0 : TAB_ROW_HEIGHT;
  const addressHeight = vertical ? TOOLBAR_HEIGHT : HORIZONTAL_TOOLBAR_HEIGHT;
  const toolbarHeight = vertical ? TOOLBAR_HEIGHT : HORIZONTAL_TOOLBAR_HEIGHT + (options.savedSites ? BOOKMARKS_BAR_HEIGHT : 0);
  const toolbarX = vertical ? cardX : 0;
  const pageY = toolbarY + toolbarHeight;
  const pageHeight = Math.max(height - pageY - PAGE_INSET, 0);
  const findBarWidth = Math.min(FIND_BAR.width, cardWidth);

  return {
    mode,
    sidebarOpen: sidebar,
    chatOpen: chat,
    sidebarWidth,
    chatWidth,
    panelLimits: {
      sidebar: { min: SIDEBAR_WIDTH.min, max: SIDEBAR_WIDTH.max },
      chat: { min: CHAT_WIDTH.min, max: CHAT_WIDTH.max },
    },
    controls,
    menuButton,
    sidebar: sidebar ? { x: 0, y: 0, width: left, height } : EMPTY,
    // The collapsed sidebar floats over the page, with room around its card for the shadow.
    floatingSidebar:
      vertical && !sidebar ? { x: 0, y: 0, width: Math.min(sidebarWidth + 2 * FLOATING_INSET, window.width), height } : EMPTY,
    // In the page's top right corner.
    findBar: {
      x: cardX + cardWidth - findBarWidth,
      y: pageY,
      width: findBarWidth,
      height: Math.min(FIND_BAR.height, pageHeight),
    },
    tabStrip,
    toolbar: { x: toolbarX, y: toolbarY, width: Math.max(window.width - toolbarX, 0), height: toolbarHeight },
    addressRow: { x: toolbarX, y: toolbarY, width: Math.max(window.width - toolbarX, 0), height: addressHeight },
    // In the horizontal layout, what Chats and a mascot's card open over: everything under the toolbar's own row. It
    // covers the page too, since a tab's view would cover the chrome, and a press anywhere in it closes them.
    popover: vertical
      ? EMPTY
      : { x: 0, y: toolbarY + addressHeight, width: window.width, height: Math.max(height - toolbarY - addressHeight, 0) },
    chat: chat ? { x: chatX, y: pageY, width: chatWidth, height: pageHeight } : EMPTY,
    page: {
      x: cardX,
      y: pageY,
      width: cardWidth,
      height: pageHeight,
    },
    // A view wholly outside the window gets no size and draws nothing, so one corner pixel stays inside.
    parkedPage: {
      x: window.width - 1,
      y: height - 1,
      width: cardWidth,
      height: pageHeight,
    },
  };
}
