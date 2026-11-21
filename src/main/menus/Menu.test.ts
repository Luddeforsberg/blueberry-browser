import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import type { Window } from "../window/Window";

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
vi.mock("../window/Window", () => ({ HORIZONTAL_TABS_MENU_ID: "horizontal-tabs", WEB_PAGE_MENU_IDS: ["print"] }));

const { setAppMenu } = await import("./Menu");

const viewMenu = (isPackaged: boolean) => {
  electron.app.isPackaged = isPackaged;
  setAppMenu({ settings: { layoutMode: "vertical" }, syncMenu: () => {} } as unknown as Window, () => {
    throw new Error("A window is open.");
  });
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

  it("with no window, opens a page in a new window and has everything that acts on a window off", () => {
    electron.app.isPackaged = true;
    const opened: string[] = [];
    let windows = 0;
    const window = { openPage: (page: string) => void opened.push(page) } as unknown as Window;
    setAppMenu(null, () => {
      windows++;
      return window;
    });
    const rows = electron.built.flatMap((menu) => (menu.submenu as MenuItemConstructorOptions[]).filter((item) => item.label));
    const row = (label: string) => rows.find((item) => item.label === label);
    const click = (label: string) => (row(label)?.click as () => void)();

    click("Settings…");
    click("History");
    expect(opened).toEqual(["settings", "history"]);
    click("New Window");
    click("New Tab");
    expect(windows).toBe(4);
    // Off, and pressing one anyway does nothing.
    const off = rows.filter((item) => item.enabled === false).map((item) => item.label);
    expect(off).toEqual(expect.arrayContaining(["Close Tab", "Reload", "Toggle Fullscreen", "Back", "Find…", "Show Berry How"]));
    expect(() => click("Toggle Fullscreen")).not.toThrow();
    const working = rows.filter((item) => item.enabled !== false && !item.role).map((item) => item.label);
    expect(working.sort()).toEqual(
      ["New Window", "Settings…", "Downloads", "New Tab", "Quit", "History", "Routines", "Your Mascots", "Gallery", "Needs You"].sort(),
    );
  });
});
