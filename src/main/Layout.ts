import type { Layout, Rect } from "../shared/ipc";

export type { Layout, Rect };

// DESIGN.md section 2, to tune.
export const SIDEBAR_WIDTH = 240;
export const CHAT_WIDTH = 360;
export const TOOLBAR_HEIGHT = 44;
export const FRAME_INSET = 8;
export const MIN_PAGE_WIDTH = 480;
export const MIN_WINDOW = { width: 900, height: 600 };

// Room kept clear for the system's window buttons.
const MAC_CONTROLS_WIDTH = 80;
const WINDOWS_CONTROLS_WIDTH = 138;

export interface LayoutOptions {
  sidebarOpen: boolean;
  chatOpen: boolean;
  platform: NodeJS.Platform;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

const pageWidth = (windowWidth: number, sidebar: boolean, chat: boolean) =>
  windowWidth -
  (sidebar ? SIDEBAR_WIDTH : FRAME_INSET) -
  (chat ? CHAT_WIDTH : FRAME_INSET);

// The only place that decides where the window's regions go.
export function computeLayout(
  window: { width: number; height: number },
  { sidebarOpen, chatOpen, platform }: LayoutOptions
): Layout {
  // When space runs out, the sidebar collapses first and the chat closes next.
  let sidebar = sidebarOpen;
  let chat = chatOpen;
  if (sidebar && pageWidth(window.width, sidebar, chat) < MIN_PAGE_WIDTH) sidebar = false;
  if (chat && pageWidth(window.width, sidebar, chat) < MIN_PAGE_WIDTH) chat = false;

  const left = sidebar ? SIDEBAR_WIDTH : 0;
  const right = chat ? CHAT_WIDTH : 0;
  const height = window.height;

  const controls: Rect =
    platform === "darwin"
      ? { x: 0, y: 0, width: MAC_CONTROLS_WIDTH, height: TOOLBAR_HEIGHT }
      : {
          x: Math.max(window.width - WINDOWS_CONTROLS_WIDTH, 0),
          y: 0,
          width: Math.min(WINDOWS_CONTROLS_WIDTH, window.width),
          height: TOOLBAR_HEIGHT,
        };

  const pageX = sidebar ? left : FRAME_INSET;
  const pageRight = window.width - (chat ? right : FRAME_INSET);

  return {
    sidebarOpen: sidebar,
    chatOpen: chat,
    controls,
    sidebar: sidebar ? { x: 0, y: 0, width: left, height } : EMPTY,
    toolbar: {
      x: left,
      y: 0,
      width: Math.max(window.width - left - right, 0),
      height: TOOLBAR_HEIGHT,
    },
    chat: chat ? { x: window.width - right, y: 0, width: right, height } : EMPTY,
    page: {
      x: pageX,
      y: TOOLBAR_HEIGHT,
      width: Math.max(pageRight - pageX, 0),
      height: Math.max(height - TOOLBAR_HEIGHT - FRAME_INSET, 0),
    },
  };
}
