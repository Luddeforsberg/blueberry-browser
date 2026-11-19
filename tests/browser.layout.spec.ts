import { expect, test } from "@playwright/test";
import { findView, openMenuRows } from "./app";
import { setUpBrowserApp, app, chrome, activeTab, openFixture, setContentSize } from "./browserSetup";

declare global {
  interface Window {
    slideRuns: number;
  }
}

setUpBrowserApp();

test("the page card follows the sidebar and chat as they open and close", async () => {
  // The window may not get the size it asks for on a small screen, such as a CI runner, and Windows can add a few
  // pixels for its frame. The rest of this works from the size it really got.
  const [width, height] = await app.evaluate(({ BaseWindow }) => {
    const baseWindow = BaseWindow.getAllWindows()[0];
    baseWindow.setContentSize(1200, 700);
    return baseWindow.getContentSize();
  });
  expect(width).toBeGreaterThanOrEqual(1200);

  const page = await openFixture();
  const size = () => page.evaluate(() => [window.innerWidth, window.innerHeight]);

  // Sidebar open and chat closed, which is how the app starts.
  await expect.poll(size).toEqual([width - 248 - 8, height - 56]);

  // The chat panel is a second sheet, with the gutter on both sides of it.
  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  await expect.poll(size).toEqual([width - 248 - 8 - 348 - 8, height - 56]);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await expect.poll(size).toEqual([width - 8 - 8 - 348 - 8, height - 56]);

  // A tab opened now gets the same space as the others.
  const second = await openFixture("/second");
  await expect.poll(() => second.evaluate(() => window.innerWidth)).toBe(width - 8 - 8 - 348 - 8);
});

test("the chrome fills the window as it resizes", async () => {
  const [width, height] = await app.evaluate(({ BaseWindow }) => {
    const baseWindow = BaseWindow.getAllWindows()[0];
    baseWindow.setContentSize(1100, 700);
    return baseWindow.getContentSize();
  });
  expect(width).toBeGreaterThanOrEqual(1100);

  await expect.poll(() => chrome.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
});

const overlayVisible = () =>
  app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()[0]
      .contentView.children.find((view) =>
        "webContents" in view ? (view as Electron.WebContentsView).webContents.getURL().includes("view=overlay") : false,
      )
      ?.getVisible(),
  );

test("horizontal tabs put a tab row above the toolbar, with the same tabs", async () => {
  const [width, height] = await setContentSize(1200, 700);
  expect(width).toBeGreaterThanOrEqual(1200);
  const page = await openFixture();

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));

  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
  const tab = chrome.getByRole("list", { name: "Tabs" }).getByRole("button", { name: "Fixture", exact: true });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
    // The tab row and the toolbar, and no bookmarks bar with nothing saved.
    .toEqual([width - 16, height - 42 - 44 - 8]);
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("horizontal-tabs")?.checked)).toBe(true);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "vertical" }));
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
});

test("a tab closed in the row folds away without squeezing the tabs beside it", async () => {
  await setContentSize(1200, 700);
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await openFixture("/a");
  await openFixture("/b");
  await openFixture("/c");
  const row = chrome.getByRole("list", { name: "Tabs" });
  await expect(row.getByRole("listitem")).toHaveCount(4);
  await expect(row.locator("li[style*='max-width']")).toHaveCount(0);

  // Every frame from the press until the tab has folded: how wide the tabs that stay are.
  const narrowest = await row.evaluate(async (list) => {
    const staying = () => [...list.querySelectorAll("li:not([data-folding])")].map((item) => item.getBoundingClientRect().width);
    const before = Math.min(...staying());
    list.querySelectorAll("li")[1].querySelector<HTMLElement>("button[aria-label^='Close']")!.click();
    let least = before;
    const until = performance.now() + 400;
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame);
      least = Math.min(least, ...staying());
    }
    return { before, least };
  });
  await expect(row.getByRole("listitem")).toHaveCount(3);
  expect(narrowest.least).toBeGreaterThanOrEqual(narrowest.before - 1);
});

test("in the tab row at the smallest window, the active tab has as much room for its title, and a crowded row shows icons", async () => {
  await setContentSize(900, 600);
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await openFixture("/a");
  await openFixture("/b");
  for (const page of ["history", "downloads", "settings"] as const)
    await chrome.evaluate((page) => window.chromeAPI.browser.openPage(page), page);
  const row = chrome.getByRole("list", { name: "Tabs" });
  const titles = () =>
    row.getByRole("listitem").evaluateAll((items) =>
      items.map((item) => ({
        active: !!item.querySelector("[aria-current]"),
        width: item.getBoundingClientRect().width,
        title: item.querySelector("button span.truncate")!.getBoundingClientRect().width,
      })),
    );

  await expect.poll(async () => (await titles()).length).toBe(6);
  // New tabs open from nothing, so the row is measured once they have.
  await expect(row.locator("li[style*='max-width']")).toHaveCount(0);
  const six = await titles();
  const others = six.filter((tab) => !tab.active).map((tab) => tab.title);
  // The mascot perches on the active tab and its close button always shows, so it's wider to make up for them.
  expect(six.find((tab) => tab.active)!.title).toBeGreaterThanOrEqual(Math.min(...others) - 1);
  expect(Math.min(...others)).toBeGreaterThan(40);

  for (let i = 0; i < 4; i++) await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await expect.poll(async () => (await titles()).filter((tab) => !tab.active).every((tab) => tab.width < 72 && tab.title <= 1)).toBe(true);
  // Only the icon shows, and the title is still its name.
  await expect(row.getByRole("button", { name: "History", exact: true })).toBeVisible();
  const history = row.getByRole("listitem").filter({ has: chrome.getByRole("button", { name: "History", exact: true }) });
  await expect(history.getByRole("button", { name: "Close History" })).toBeHidden();
  await history.hover();
  await expect(history.getByRole("button", { name: "Close History" })).toBeVisible();
});

test("off a Mac, the menu button opens the app's own menu just under itself", async () => {
  const button = chrome.getByRole("button", { name: "Menu", exact: true });
  if (process.platform === "darwin") return void (await expect(button).toHaveCount(0));
  const menu = await findView(app, "view=menu");
  // Where the open menu's sheet is in the window: the view's place, and the sheet's in the view.
  const sheetInWindow = async () => {
    const view = await app.evaluate(({ BaseWindow }) => {
      const found = BaseWindow.getAllWindows()[0].contentView.children.find(
        (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes("view=menu"),
      );
      return found?.getBounds();
    });
    const sheet = await menu.locator('[role=menu]:not([aria-hidden="true"])').first().boundingBox();
    return view && sheet && { x: view.x + sheet.x, y: view.y + sheet.y, right: view.x + sheet.x + sheet.width };
  };

  for (const layoutMode of ["vertical", "horizontal"] as const) {
    await chrome.evaluate((layoutMode) => window.chromeAPI.settings.updateSettings({ layoutMode }), layoutMode);
    const { menuButton, controls, toolbar, addressRow } = await chrome.evaluate(() => window.chromeAPI.layout.getLayout());
    // Where the layout puts it: inside the room kept clear left of the window buttons, or ending the horizontal toolbar.
    await expect.poll(() => button.boundingBox()).toEqual(menuButton);
    if (layoutMode === "vertical") expect(menuButton.x).toBeGreaterThanOrEqual(controls.x);
    else {
      expect(menuButton.x + menuButton.width).toBe(toolbar.width - 8);
      expect(menuButton.y).toBeGreaterThanOrEqual(addressRow.y);
      expect(menuButton.y + menuButton.height).toBeLessThanOrEqual(addressRow.y + addressRow.height);
    }
    await button.click();
    await expect.poll(() => openMenuRows(app)).toEqual(["File", "Edit", "View", "Go"]);
    // 4px under the button, moved in from the window's edge.
    await expect.poll(async () => (await sheetInWindow())?.y).toBe(menuButton.y + menuButton.height + 4);
    const { width } = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getContentBounds());
    expect((await sheetInWindow())!.right).toBeLessThanOrEqual(width - 8);
    // A submenu opens beside its row, on the side with room, and Escape closes only it, then the menu.
    await menu.getByRole("menuitem", { name: "View", exact: true }).focus();
    await menu.keyboard.press("ArrowRight");
    await expect(menu.getByRole("menuitemcheckbox", { name: "Horizontal Tabs" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Reload", exact: true })).toBeFocused();
    await menu.keyboard.press("Escape");
    await expect(menu.getByRole("menuitemcheckbox", { name: "Horizontal Tabs" })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: "View", exact: true })).toBeFocused();
    await menu.keyboard.press("Escape");
    await expect(menu.getByRole("menu")).toHaveCount(0);
  }
});

test("the sidebar and chat resize within their limits, by pointer or keyboard", async () => {
  const [width] = await setContentSize(1400, 700);
  expect(width).toBeGreaterThanOrEqual(1400);
  const page = await openFixture();
  const pageWidth = () => page.evaluate(() => window.innerWidth);

  await chrome.evaluate(() => window.chromeAPI.layout.resize("sidebar", 300));
  await expect.poll(pageWidth).toBe(width - 300 - 8);

  await chrome.evaluate(() => window.chromeAPI.layout.resize("sidebar", 9999));
  await expect.poll(pageWidth).toBe(width - 360 - 8);

  const handle = chrome.getByRole("separator", { name: "Resize sidebar" });
  await handle.focus();
  await chrome.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "352");

  const box = (await handle.boundingBox())!;
  await chrome.mouse.move(box.x + 2, box.y + 200);
  await chrome.mouse.down();
  await chrome.mouse.move(250, box.y + 200);
  await chrome.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "250");

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  await chrome.evaluate(() => window.chromeAPI.layout.resize("chat", 400));
  await expect(chrome.getByRole("separator", { name: "Resize Berry" })).toHaveAttribute("aria-valuenow", "400");
  await expect.poll(pageWidth).toBe(width - 250 - 8 - 400 - 8);
});

test("the collapsed sidebar floats over the page when the pointer reaches the left edge", async () => {
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
  expect(await overlayVisible()).toBe(false);

  const { y, height } = await chrome.evaluate(async () => (await window.chromeAPI.layout.getLayout()).page);
  await chrome.mouse.move(3, y + height / 2);
  await expect.poll(overlayVisible).toBe(true);

  const overlay = await findView(app, "view=overlay");
  await expect(overlay.getByRole("list", { name: "Tabs" }).getByRole("button", { name: "Fixture", exact: true })).toBeVisible();

  await overlay.evaluate(() => window.chromeAPI.layout.hideFloatingSidebar());
  await expect.poll(overlayVisible).toBe(false);

  // Pinning it from the floating sidebar opens the real one.
  await chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
  await overlay.getByRole("button", { name: "Keep sidebar open" }).click();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
  expect(await overlayVisible()).toBe(false);
});

test("the menu beside the dock sits at the bottom of the sidebar and opens Settings", async () => {
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  const button = sidebar.getByRole("button", { name: "Settings and more" });

  const [buttonBox, sidebarBox] = await Promise.all([button.boundingBox(), sidebar.boundingBox()]);
  expect(buttonBox!.y + buttonBox!.height).toBeGreaterThan(sidebarBox!.y + sidebarBox!.height - 24);

  await button.click();
  await sidebar
    .getByRole("dialog", { name: "Account" })
    .getByRole("button", { name: /^Settings/ })
    .click();
  await expect.poll(async () => (await activeTab()).page).toBe("settings");
  // One highlight: the Settings tab has it, and the menu it was opened from has closed.
  const tab = sidebar.getByRole("list", { name: "Tabs", exact: true }).getByRole("button", { name: "Settings", exact: true });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(sidebar.locator("[aria-current=page]")).toHaveCount(1);
  await expect(sidebar.getByRole("dialog", { name: "Account" })).toHaveCount(0);
});

// How long the overlay waits for its slide out, from OverlayApp.tsx.
const SLIDE_OUT_MS = 240;

test("the floating sidebar slides in, and slides out before hiding", async () => {
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  const overlay = await findView(app, "view=overlay");
  const slideRuns = () => overlay.evaluate(() => window.slideRuns);
  const cardLeft = () => overlay.evaluate(() => document.querySelector("[data-slide]")!.getBoundingClientRect().left);
  await overlay.evaluate(() => {
    window.slideRuns = 0;
    document.addEventListener("transitionrun", (event) => {
      if (event.propertyName === "transform") window.slideRuns++;
    });
  });

  await chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
  await expect.poll(slideRuns).toBe(1);
  await expect.poll(cardLeft).toBe(8);

  await overlay.mouse.move(100, 300);
  const leftAt = Date.now();
  await overlay.mouse.move(600, 300);
  await expect.poll(overlayVisible).toBe(false);
  // A slow machine can finish the slide before anything could look at it, but it can't hide any sooner.
  expect(Date.now() - leftAt).toBeGreaterThanOrEqual(SLIDE_OUT_MS);
  expect(await slideRuns()).toBe(2);

  // Hidden by main with no slide out, it still slides in next time rather than appearing.
  await chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
  await expect.poll(cardLeft).toBe(8);
  await overlay.evaluate(() => window.chromeAPI.layout.hideFloatingSidebar());
  const before = await slideRuns();
  await chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
  await expect.poll(slideRuns).toBeGreaterThan(before);
});

test("bookmarks are in the sidebar when vertical, and in a bar under the toolbar when horizontal, only with something saved", async () => {
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  await expect(sidebar.getByRole("list", { name: "Bookmarks" })).toBeVisible();
  await expect(chrome.getByRole("list", { name: "Bookmarks" })).toHaveCount(1);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await expect(sidebar).toHaveCount(0);
  // Nothing saved, so no bar, and the page starts under the toolbar.
  await expect(chrome.getByRole("list", { name: "Bookmarks" })).toHaveCount(0);
  const before = (await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).page.y;
  await openFixture();
  await chrome.getByRole("button", { name: "Bookmark this page", exact: true }).click();
  await expect(chrome.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "Fixture" })).toBeVisible();
  await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).page.y).toBe(before + 40);
});
