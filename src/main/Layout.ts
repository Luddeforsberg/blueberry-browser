import type { DesktopBerrySpot, DesktopEdge, DesktopLineAnchor, Layout, LayoutMode, Point, Rect } from "../shared/ipc";

export type { Layout, LayoutMode, Rect };

// DESIGN.md section 2, to tune.
export const SIDEBAR_WIDTH = { default: 280, min: 200, max: 360 };
export const CHAT_WIDTH = { default: 400, min: 320, max: 480 };
// The top bar above the page, which holds the address row, and the window buttons along it.
export const TOP_BAR_HEIGHT = 48;
// In horizontal mode the address row sits under the tabs, with a bar for bookmarks under it, as there's no sidebar.
const HORIZONTAL_ADDRESS_ROW_HEIGHT = 44;
const BOOKMARKS_BAR_HEIGHT = 36;
export const TAB_ROW_HEIGHT = 40;
export const VERTICAL_TOP_ROW_HEIGHT = TOP_BAR_HEIGHT;
// The page's one rounded corner, where it meets the sidebar and the top bar.
export const PAGE_CORNER = 16;
// The reading and recording rings. While one shows, the page is inset by this much and the chrome draws it in the gap.
export const RING_WIDTH = 3;
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
// Off a Mac the menu bar is hidden, so a button opens the app's menu. In the vertical layout it's More in the sidebar's
// top row. In the horizontal one it's left of the window buttons, the size of a toolbar button, with this much room on
// each side.
const MENU_BUTTON_SIZE = 32;
const MENU_BUTTON_GAP = 4;

export interface LayoutOptions {
  mode: LayoutMode;
  sidebarOpen: boolean;
  chatOpen: boolean;
  sidebarWidth: number;
  chatWidth: number;
  platform: NodeJS.Platform;
  // A ring round the page, which only the chrome can draw, so the page makes room for it.
  ring?: boolean;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const clampWidth = (width: number, range: { min: number; max: number }): number =>
  Math.round(Math.min(Math.max(width, range.min), range.max));

// The site permission card, in the page's top corner with room around it for its shadow. The card sizes the height.
export const promptRect = (page: Rect, cardHeight: number): Rect => {
  const height = Math.round(Math.min(Math.max(cardHeight, 1), page.height));
  return { x: page.x, y: page.y, width: Math.min(PROMPT_WIDTH, page.width), height };
};

// The bird on the edge of the screen. Its window keeps one size wherever it stands, so nothing resizes while it moves or
// speaks, and the bird tucks by being moved past the side of the window that lies along the edge.
export const DESKTOP_BIRD_SIZE = 72;
// Along the edge it keeps this much room, because its tail and wings go past the drawing.
const DESKTOP_ROOM = 96;
const DESKTOP_WINDOW = { width: 430, height: 112 };
// How much of it shows when tucked: the top of its head and its eye. More when something is waiting on the user.
export const DESKTOP_PEEK = 30;
export const DESKTOP_PEEK_WAITING = 42;
// Its toes are a little inside the drawing, so that much goes past the edge.
const DESKTOP_TOES_PAST = 2;
const DESKTOP_GAP = 8;
const DESKTOP_MARGIN = 8;
// Let go this close to a corner, and that's where it goes.
const DESKTOP_CORNER_SNAP = 56;
// The middle of its head, along the drawing, and how wide a target that makes.
const DESKTOP_HEAD_AT = 40;
const DESKTOP_HEAD_WIDTH = 52;
// With nothing saved, right of the middle of the bottom: on top of a Dock of the usual width, and clear of most work.
export const DESKTOP_DEFAULT_SPOT = { edge: "bottom", fraction: 0.66 } as const;

export interface DesktopPlace {
  window: Rect;
  // The top left of the bird in the window, out in full.
  out: Point;
  // Which way along the edge it faces, so that it looks towards the middle of the screen.
  flip: boolean;
  line: DesktopLineAnchor;
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));

// On the screen, the bird's top left when it's out, and which way the middle of the screen is.
const birdOnScreen = (area: Rect, { edge, fraction }: Pick<DesktopBerrySpot, "edge" | "fraction">) => {
  const along = (start: number, length: number) =>
    Math.round(start + clamp(fraction, 0, 1) * Math.max(length - DESKTOP_ROOM, 0) + (DESKTOP_ROOM - DESKTOP_BIRD_SIZE) / 2);
  const x =
    edge === "left"
      ? area.x - DESKTOP_TOES_PAST
      : edge === "right"
        ? area.x + area.width - DESKTOP_BIRD_SIZE + DESKTOP_TOES_PAST
        : along(area.x, area.width);
  const y =
    edge === "top"
      ? area.y - DESKTOP_TOES_PAST
      : edge === "bottom"
        ? area.y + area.height - DESKTOP_BIRD_SIZE + DESKTOP_TOES_PAST
        : along(area.y, area.height);
  return { x, y, towardsRight: x + DESKTOP_BIRD_SIZE / 2 <= area.x + area.width / 2 };
};

// Where the bird's window goes for a spot on the edge, always wholly inside the work area, with the words on the side
// towards the middle of the screen.
export const desktopPlace = (area: Rect, spot: Pick<DesktopBerrySpot, "edge" | "fraction">): DesktopPlace => {
  const { edge } = spot;
  const bird = birdOnScreen(area, spot);
  const { towardsRight } = bird;
  const width = Math.min(DESKTOP_WINDOW.width, area.width);
  const height = Math.min(DESKTOP_WINDOW.height, area.height);
  const wantedX =
    edge === "left"
      ? area.x
      : edge === "right"
        ? area.x + area.width - width
        : towardsRight
          ? bird.x - (DESKTOP_ROOM - DESKTOP_BIRD_SIZE) / 2
          : bird.x + DESKTOP_BIRD_SIZE + (DESKTOP_ROOM - DESKTOP_BIRD_SIZE) / 2 - width;
  const wantedY =
    edge === "top" ? area.y : edge === "bottom" ? area.y + area.height - height : bird.y + DESKTOP_BIRD_SIZE / 2 - height / 2;
  const window: Rect = {
    x: Math.round(clamp(wantedX, area.x, area.x + area.width - width)),
    y: Math.round(clamp(wantedY, area.y, area.y + area.height - height)),
    width,
    height,
  };
  const out = { x: bird.x - window.x, y: bird.y - window.y };
  const fromSide = towardsRight ? out.x + DESKTOP_BIRD_SIZE + DESKTOP_GAP : width - out.x + DESKTOP_GAP;
  return {
    window,
    out,
    flip: edge === "left" ? bird.y + DESKTOP_BIRD_SIZE / 2 > area.y + area.height / 2 : edge === "right" ? bird.y + DESKTOP_BIRD_SIZE / 2 <= area.y + area.height / 2 : !towardsRight,
    line: {
      side: towardsRight ? "left" : "right",
      fromSide,
      maxWidth: Math.max(width - fromSide - DESKTOP_MARGIN, 0),
      across: edge === "top" ? "top" : edge === "bottom" ? "bottom" : "middle",
      // Two lines of words stay inside the window, wherever along the edge it is.
      middle: Math.round(clamp(out.y + DESKTOP_BIRD_SIZE / 2, 32, height - 32)),
    },
  };
};

// Where the bird is when tucked: past the edge, by all but what shows.
export const desktopTucked = ({ out }: Pick<DesktopPlace, "out">, edge: DesktopEdge, peek: number): Point => {
  const hidden = DESKTOP_BIRD_SIZE - DESKTOP_TOES_PAST - peek;
  return {
    x: out.x + (edge === "left" ? -hidden : edge === "right" ? hidden : 0),
    y: out.y + (edge === "top" ? -hidden : edge === "bottom" ? hidden : 0),
  };
};

// The part of a tucked bird that's on screen, in the window: its head, showing past the edge. This is all it takes the
// pointer with, so nothing else in the window can get in the way of what's beneath.
export const desktopPeekHit = (place: Pick<DesktopPlace, "out" | "flip">, edge: DesktopEdge, peek: number): Rect => {
  const { x, y } = desktopTucked(place, edge, peek);
  const head = place.flip ? DESKTOP_BIRD_SIZE - DESKTOP_HEAD_AT : DESKTOP_HEAD_AT;
  const start = head - DESKTOP_HEAD_WIDTH / 2;
  if (edge === "bottom") return { x: x + start, y, width: DESKTOP_HEAD_WIDTH, height: peek };
  if (edge === "top") return { x: x + start, y: y + DESKTOP_BIRD_SIZE - peek, width: DESKTOP_HEAD_WIDTH, height: peek };
  // On its side, the top of the drawing points away from the edge and its length runs along it.
  const along = edge === "left" ? y + start : y + DESKTOP_BIRD_SIZE - start - DESKTOP_HEAD_WIDTH;
  return edge === "left"
    ? { x: x + DESKTOP_BIRD_SIZE - peek, y: along, width: peek, height: DESKTOP_HEAD_WIDTH }
    : { x, y: along, width: peek, height: DESKTOP_HEAD_WIDTH };
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
  const horizontal = edge === "top" || edge === "bottom";
  const start = horizontal ? area.x : area.y;
  const length = horizontal ? area.width : area.height;
  const at = (horizontal ? point.x : point.y) - start;
  if (at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 0 };
  if (length - at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 1 };
  const room = length - DESKTOP_ROOM;
  return { displayId, edge, fraction: room > 0 ? clamp((at - DESKTOP_ROOM / 2) / room, 0, 1) : 0 };
};

// The composer, beside the bird on the side towards the middle of the screen, and wholly on screen at any size.
export const desktopComposerBounds = (area: Rect, spot: Pick<DesktopBerrySpot, "edge" | "fraction">, size: { width: number; height: number }): Rect => {
  const bird = birdOnScreen(area, spot);
  const width = Math.min(size.width, area.width - 2 * DESKTOP_MARGIN);
  const height = Math.min(size.height, area.height - 2 * DESKTOP_MARGIN);
  const x = bird.towardsRight ? bird.x + DESKTOP_BIRD_SIZE + DESKTOP_GAP : bird.x - DESKTOP_GAP - width;
  const y =
    spot.edge === "top"
      ? area.y + DESKTOP_MARGIN
      : spot.edge === "bottom"
        ? area.y + area.height - DESKTOP_MARGIN - height
        : bird.y + DESKTOP_BIRD_SIZE / 2 - height / 2;
  return {
    x: Math.round(clamp(x, area.x + DESKTOP_MARGIN, area.x + area.width - DESKTOP_MARGIN - width)),
    y: Math.round(clamp(y, area.y + DESKTOP_MARGIN, area.y + area.height - DESKTOP_MARGIN - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
};

export const desktopHit = (point: Point, window: Rect, hits: Rect[]): boolean =>
  hits.some(({ x, y, width, height }) => {
    const left = window.x + x;
    const top = window.y + y;
    return point.x >= left && point.x < left + width && point.y >= top && point.y < top + height;
  });

// The way there, as an arc over the straight line, for `t` from 0 to 1. It starts and lands gently.
export const desktopFlightPoint = (from: Point, to: Point, t: number): Point => {
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const peak = Math.max(Math.min(from.y, to.y) - Math.min(Math.hypot(to.x - from.x, to.y - from.y) * 0.18, 120), 0);
  const rest = 1 - eased;
  return {
    x: Math.round(from.x + (to.x - from.x) * eased),
    y: Math.round(rest * rest * from.y + 2 * rest * eased * peak + eased * eased * to.y),
  };
};

// The only place that decides where the window's regions go.
export function computeLayout(
  window: { width: number; height: number },
  options: LayoutOptions
): Layout {
  const { mode, platform } = options;
  const sidebarWidth = clampWidth(options.sidebarWidth, SIDEBAR_WIDTH);
  const chatWidth = clampWidth(options.chatWidth, CHAT_WIDTH);
  const vertical = mode === "vertical";

  const pageWidth = (sidebar: boolean, chat: boolean) =>
    window.width - (sidebar ? sidebarWidth : 0) - (chat ? chatWidth : 0);

  // When space runs out, the sidebar collapses first and the chat closes next.
  let sidebar = vertical && options.sidebarOpen;
  let chat = options.chatOpen;
  if (sidebar && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) sidebar = false;
  if (chat && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) chat = false;

  const left = sidebar ? sidebarWidth : 0;
  const right = chat ? chatWidth : 0;
  const { height } = window;
  const middleWidth = Math.max(window.width - left - right, 0);

  // The top row holds the window buttons: the toolbar when vertical, the tab row when horizontal.
  // Off a Mac in the horizontal layout, the menu button is part of what's kept clear, so whatever sits in the top right
  // corner leaves room for it.
  const topRow = vertical ? VERTICAL_TOP_ROW_HEIGHT : TAB_ROW_HEIGHT;
  const mac = platform === "darwin";
  const menuInRow = !mac && !vertical;
  // Linux has no window buttons of its own here, only the menu button.
  const systemButtons = platform === "win32" ? WINDOWS_CONTROLS_WIDTH : 0;
  const controlsWidth = mac ? MAC_CONTROLS_WIDTH : systemButtons + (menuInRow ? MENU_BUTTON_SIZE + 2 * MENU_BUTTON_GAP : 0);
  const controls: Rect = mac
    ? { x: 0, y: 0, width: controlsWidth, height: topRow }
    : {
        x: Math.max(window.width - controlsWidth, 0),
        y: 0,
        width: Math.min(controlsWidth, window.width),
        height: topRow,
      };
  const menuButton: Rect = !menuInRow
    ? EMPTY
    : {
        x: Math.max(window.width - systemButtons - MENU_BUTTON_GAP - MENU_BUTTON_SIZE, 0),
        y: Math.round((topRow - MENU_BUTTON_SIZE) / 2),
        width: MENU_BUTTON_SIZE,
        height: MENU_BUTTON_SIZE,
      };

  const tabStrip = vertical ? EMPTY : { x: 0, y: 0, width: middleWidth, height: TAB_ROW_HEIGHT };
  const toolbarY = vertical ? 0 : TAB_ROW_HEIGHT;
  const addressRowHeight = vertical ? TOP_BAR_HEIGHT : HORIZONTAL_ADDRESS_ROW_HEIGHT;
  const toolbarHeight = vertical ? TOP_BAR_HEIGHT : HORIZONTAL_ADDRESS_ROW_HEIGHT + BOOKMARKS_BAR_HEIGHT;
  const pageY = toolbarY + toolbarHeight;
  // The page is whatever the chrome leaves, with no gutter. A ring takes its width from every side.
  const frame: Rect = { x: left, y: pageY, width: middleWidth, height: Math.max(height - pageY, 0) };
  const inset = options.ring ? RING_WIDTH : 0;
  const page: Rect = {
    x: frame.x + inset,
    y: frame.y + inset,
    width: Math.max(frame.width - 2 * inset, 0),
    height: Math.max(frame.height - 2 * inset, 0),
  };
  const findBarWidth = Math.min(FIND_BAR.width, page.width);

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
    floatingSidebar: vertical && !sidebar
      ? { x: 0, y: 0, width: Math.min(sidebarWidth + 2 * FLOATING_INSET, window.width), height }
      : EMPTY,
    // In the page's top right corner.
    findBar: {
      x: page.x + page.width - findBarWidth,
      y: page.y,
      width: findBarWidth,
      height: Math.min(FIND_BAR.height, page.height),
    },
    tabStrip,
    toolbar: { x: left, y: toolbarY, width: middleWidth, height: toolbarHeight },
    addressRow: { x: left, y: toolbarY, width: middleWidth, height: addressRowHeight },
    chat: chat ? { x: window.width - right, y: 0, width: right, height } : EMPTY,
    pageFrame: frame,
    page,
    // Only where the page meets the sidebar and the top bar. Collapsed, and in the horizontal layout, it has none.
    pageCorner: sidebar ? PAGE_CORNER : 0,
    // A view wholly outside the window gets no size and draws nothing, so one corner pixel stays inside.
    parkedPage: {
      x: window.width - 1,
      y: height - 1,
      width: page.width,
      height: page.height,
    },
  };
}
