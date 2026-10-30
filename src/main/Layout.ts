const TOP_BAR_HEIGHT = 88;
const SIDEBAR_WIDTH = 400;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  topBar: Rect;
  sidebar: Rect;
  tab: Rect;
}

// The only place that decides where the window's views go.
export function computeLayout(
  window: { width: number; height: number },
  { sidebarVisible }: { sidebarVisible: boolean }
): Layout {
  const contentHeight = Math.max(window.height - TOP_BAR_HEIGHT, 0);
  const sidebarWidth = sidebarVisible ? Math.min(SIDEBAR_WIDTH, window.width) : 0;

  return {
    topBar: { x: 0, y: 0, width: window.width, height: TOP_BAR_HEIGHT },
    sidebar: sidebarVisible
      ? {
          x: window.width - sidebarWidth,
          y: TOP_BAR_HEIGHT,
          width: sidebarWidth,
          height: contentHeight,
        }
      : { x: 0, y: 0, width: 0, height: 0 },
    tab: {
      x: 0,
      y: TOP_BAR_HEIGHT,
      width: window.width - sidebarWidth,
      height: contentHeight,
    },
  };
}
