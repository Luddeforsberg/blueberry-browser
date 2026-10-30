import { describe, expect, it } from "vitest";
import { computeLayout } from "./Layout";

describe("computeLayout", () => {
  it("puts the tab left of the sidebar, both below the top bar", () => {
    expect(computeLayout({ width: 1000, height: 800 }, { sidebarVisible: true })).toEqual({
      topBar: { x: 0, y: 0, width: 1000, height: 88 },
      sidebar: { x: 600, y: 88, width: 400, height: 712 },
      tab: { x: 0, y: 88, width: 600, height: 712 },
    });
  });

  it("gives the tab the full width when the sidebar is hidden", () => {
    const layout = computeLayout({ width: 1000, height: 800 }, { sidebarVisible: false });

    expect(layout.tab).toEqual({ x: 0, y: 88, width: 1000, height: 712 });
    expect(layout.sidebar).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("never returns a negative size when the window is smaller than the chrome", () => {
    for (const [width, height] of [
      [0, 0],
      [1, 1],
      [400, 88],
      [399, 87],
    ]) {
      const layout = computeLayout({ width, height }, { sidebarVisible: true });

      for (const rect of Object.values(layout)) {
        expect(rect.width).toBeGreaterThanOrEqual(0);
        expect(rect.height).toBeGreaterThanOrEqual(0);
      }
      expect(layout.sidebar.x).toBeGreaterThanOrEqual(0);
    }
  });
});
