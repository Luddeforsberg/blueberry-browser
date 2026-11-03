import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import type { Window } from "./Window";

const electron = vi.hoisted(() => ({
  app: { isPackaged: false, quit: () => {} },
  built: [] as MenuItemConstructorOptions[],
}));

vi.mock("electron", () => ({
  app: electron.app,
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
      electron.built = template;
      return {};
    },
    setApplicationMenu: () => {},
  },
}));
vi.mock("./Window", () => ({ HORIZONTAL_TABS_MENU_ID: "horizontal-tabs" }));

const { AppMenu } = await import("./Menu");

const viewMenu = (isPackaged: boolean) => {
  electron.app.isPackaged = isPackaged;
  new AppMenu({ settings: { layoutMode: "vertical" }, syncMenu: () => {} } as unknown as Window);
  const view = electron.built.find((item) => item.label === "View");
  return (view?.submenu as MenuItemConstructorOptions[]).map((item) => item.label ?? "-");
};

describe("AppMenu", () => {
  beforeEach(() => {
    electron.built = [];
  });

  it("has the developer items while working on the app", () => {
    expect(viewMenu(false)).toEqual(expect.arrayContaining(["Component Gallery", "Toggle Developer Tools"]));
  });

  it("leaves the developer items out of a packaged app, and keeps the rest of the View menu", () => {
    const items = viewMenu(true);
    expect(items).not.toContain("Component Gallery");
    expect(items).not.toContain("Toggle Developer Tools");
    expect(items.slice(-2)).toEqual(["-", "Toggle Fullscreen"]);
  });
});
