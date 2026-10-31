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
export const MIN_PAGE_WIDTH = 480;
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
    tabStrip,
    toolbar: { x: cardX, y: toolbarY, width: cardWidth, height: toolbarHeight },
    chat: chat ? { x: window.width - right, y: 0, width: right, height } : EMPTY,
    page: {
      x: cardX,
      y: pageY,
      width: cardWidth,
      height: Math.max(height - pageY - PAGE_INSET, 0),
    },
  };
}
