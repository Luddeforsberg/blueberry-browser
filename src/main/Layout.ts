import type { Layout, LayoutMode, Rect } from "../shared/ipc";

export type { Layout, LayoutMode, Rect };

// DESIGN.md section 2, to tune.
export const SIDEBAR_WIDTH = { default: 280, min: 200, max: 360 };
export const CHAT_WIDTH = { default: 400, min: 320, max: 480 };
export const ADDRESS_ROW_HEIGHT = 40;
// In horizontal mode there is no sidebar to hold the bookmarks, so the toolbar has a bar for them too.
export const TOOLBAR_HEIGHT_WITH_BOOKMARKS = 76;
export const TAB_ROW_HEIGHT = 40;
// The page card floats on the frame, with this much of it showing around the card.
export const PAGE_INSET = 8;
// The window buttons line up with the address row, which sits one inset down.
export const VERTICAL_TOP_ROW_HEIGHT = ADDRESS_ROW_HEIGHT + 2 * PAGE_INSET;
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

export interface LayoutOptions {
  mode: LayoutMode;
  sidebarOpen: boolean;
  chatOpen: boolean;
  sidebarWidth: number;
  chatWidth: number;
  platform: NodeJS.Platform;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const clampWidth = (width: number, range: { min: number; max: number }): number =>
  Math.round(Math.min(Math.max(width, range.min), range.max));

// The site permission card, in the page's top corner with room around it for its shadow. The card sizes the height.
export const promptRect = (page: Rect, cardHeight: number): Rect => {
  const height = Math.round(Math.min(Math.max(cardHeight, 1), page.height));
  return { x: page.x, y: page.y, width: Math.min(PROMPT_WIDTH, page.width), height };
};

// The bird on the edge of the screen, in a window that fits it and whatever is showing beside it.
// The drawing goes past its own box in places, such as the tail in flight, so this has room around a 72px bird.
export const DESKTOP_BIRD_SIZE = 96;
const DESKTOP_MAX_WINDOW = { width: 520, height: 320 };
// With nothing saved, over to the right of the middle: on top of a Dock of the usual width, and clear of most work.
export const DESKTOP_DEFAULT_FRACTION = 0.66;

const desktopBirdX = (area: Rect, fraction: number): number =>
  Math.round(area.x + Math.min(Math.max(fraction, 0), 1) * Math.max(area.width - DESKTOP_BIRD_SIZE, 0));

export const desktopFractionAt = (area: Rect, birdX: number): number => {
  const room = area.width - DESKTOP_BIRD_SIZE;
  return room > 0 ? Math.min(Math.max((birdX - area.x) / room, 0), 1) : 0;
};

// What's beside the bird goes towards the middle of the screen, so it always has room.
export const desktopSide = (fraction: number): "left" | "right" => (fraction > 0.5 ? "left" : "right");

// Standing on the bottom of the work area, which is the top of a Dock or the bottom of the screen. The bird keeps its
// place however big the window gets.
export const desktopBounds = (area: Rect, fraction: number, size: { width: number; height: number }): Rect => {
  const width = Math.round(Math.min(Math.max(size.width, DESKTOP_BIRD_SIZE), DESKTOP_MAX_WINDOW.width));
  const height = Math.round(Math.min(Math.max(size.height, DESKTOP_BIRD_SIZE), DESKTOP_MAX_WINDOW.height));
  const birdX = desktopBirdX(area, fraction);
  return {
    x: desktopSide(fraction) === "left" ? birdX + DESKTOP_BIRD_SIZE - width : birdX,
    y: area.y + area.height - height,
    width,
    height,
  };
};

export const desktopHit = (point: { x: number; y: number }, window: Rect, hits: Rect[]): boolean =>
  hits.some(({ x, y, width, height }) => {
    const left = window.x + x;
    const top = window.y + y;
    return point.x >= left && point.x < left + width && point.y >= top && point.y < top + height;
  });

// The way there, as an arc over the straight line, for `t` from 0 to 1. It starts and lands gently.
export const desktopFlightPoint = (from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number } => {
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const peak = Math.min(from.y, to.y) - Math.min(Math.hypot(to.x - from.x, to.y - from.y) * 0.18, 120);
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
    window.width - (sidebar ? sidebarWidth : PAGE_INSET) - (chat ? chatWidth : PAGE_INSET);

  // When space runs out, the sidebar collapses first and the chat closes next.
  let sidebar = vertical && options.sidebarOpen;
  let chat = options.chatOpen;
  if (sidebar && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) sidebar = false;
  if (chat && pageWidth(sidebar, chat) < MIN_PAGE_WIDTH) chat = false;

  const left = sidebar ? sidebarWidth : 0;
  const right = chat ? chatWidth : 0;
  const { height } = window;
  const middleWidth = Math.max(window.width - left - right, 0);
  const cardX = sidebar ? left : PAGE_INSET;
  const cardRight = window.width - (chat ? right : PAGE_INSET);
  const cardWidth = Math.max(cardRight - cardX, 0);

  // The top row holds the window buttons: the toolbar when vertical, the tab row when horizontal.
  const topRow = vertical ? VERTICAL_TOP_ROW_HEIGHT : TAB_ROW_HEIGHT;
  const controls: Rect =
    platform === "darwin"
      ? { x: 0, y: 0, width: MAC_CONTROLS_WIDTH, height: topRow }
      : {
          x: Math.max(window.width - WINDOWS_CONTROLS_WIDTH, 0),
          y: 0,
          width: Math.min(WINDOWS_CONTROLS_WIDTH, window.width),
          height: topRow,
        };

  const tabStrip = vertical ? EMPTY : { x: 0, y: 0, width: middleWidth, height: TAB_ROW_HEIGHT };
  const toolbarY = vertical ? PAGE_INSET : TAB_ROW_HEIGHT;
  const toolbarHeight = vertical ? ADDRESS_ROW_HEIGHT : TOOLBAR_HEIGHT_WITH_BOOKMARKS;
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
    sidebar: sidebar ? { x: 0, y: 0, width: left, height } : EMPTY,
    // The collapsed sidebar floats over the page, with room around its card for the shadow.
    floatingSidebar: vertical && !sidebar
      ? { x: 0, y: 0, width: Math.min(sidebarWidth + 2 * FLOATING_INSET, window.width), height }
      : EMPTY,
    // In the page's top right corner.
    findBar: {
      x: cardX + cardWidth - findBarWidth,
      y: pageY,
      width: findBarWidth,
      height: Math.min(FIND_BAR.height, pageHeight),
    },
    tabStrip,
    toolbar: { x: cardX, y: toolbarY, width: cardWidth, height: toolbarHeight },
    chat: chat ? { x: window.width - right, y: 0, width: right, height } : EMPTY,
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
