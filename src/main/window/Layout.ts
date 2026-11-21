import type { Layout, LayoutMode, Rect } from "../../shared/ipc";

export type { Layout, Rect };

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
const PAGE_INSET = 8;
export const FLOATING_INSET = 8;
// The find bar's card, 360 by 48, 12px from the page's top and right edges, with room for its `lift` shadow to fade out
// before the view ends: 24px to its left and 40px under it, where it falls. Less leaves the view's edge showing as a
// pale box round the card.
const FIND_BAR = { width: 396, height: 100 };
export const MIN_PAGE_WIDTH = 480;
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

export const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));

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
