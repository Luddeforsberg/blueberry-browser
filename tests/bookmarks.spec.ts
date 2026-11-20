import { expect, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseFromMenu, findView, launchApp } from "./app";

let app: ElectronApplication;
let chrome: Page;
const server = createServer((request, response) =>
  response.end(`<!doctype html><title>${request.url === "/second" ? "Second page" : "Saved page"}</title>Hello`),
);
let url: string;

async function menuAction(label: string): Promise<void> {
  await app.evaluate(({ Menu }, label) => {
    const items = Menu.getApplicationMenu()!.items.flatMap((item) => item.submenu?.items ?? []);
    const item = items.find((item) => item.label === label);
    if (!item) throw new Error(`Missing menu item: ${label}`);
    item.click();
  }, label);
}

async function visit(address = url, title = "Saved page"): Promise<void> {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), address);
  await (await findView(app, address)).waitForLoadState();
  await expect.poll(async () => (await active()).title).toBe(title);
}

// A real press, moved in steps so the drag starts, released where it's asked to be.
const drag = async (from: Locator, to: { x: number; y: number }, whileOver?: () => Promise<void>) => {
  const box = (await from.boundingBox())!;
  await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(to.x, to.y, { steps: 8 });
  await whileOver?.();
  await chrome.mouse.up();
};
const leftOf = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  return { x: box.x + 4, y: box.y + box.height / 2 };
};

const active = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.find((tab) => tab.isActive)!));

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  url = `http://127.0.0.1:${address.port}/`;
});
test.afterAll(() => server.close());
test.beforeEach(async () => {
  app = await launchApp();
  chrome = await findView(app, "view=chrome");
});
test.afterEach(async () => {
  await app?.close();
});

test("bookmarking a page saves it across restarts and both layouts, and the star removes it", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-bookmarks-"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  // Our own pages can't be saved, so the new tab page has no star.
  await expect(chrome.getByRole("button", { name: "Bookmark this page", exact: true })).toHaveCount(0);
  await visit();
  await chrome.getByRole("button", { name: "Bookmark this page", exact: true }).click();
  let saved = chrome.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "Saved page" });
  await expect(saved).toBeVisible();
  await expect(chrome.getByRole("button", { name: "Remove bookmark", exact: true })).toHaveAttribute("aria-pressed", "true");

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  saved = chrome.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "Saved page" });
  await saved.click();
  await expect.poll(async () => (await active()).url).toBe(url);
  await expect.poll(async () => (await active()).title).toBe("Saved page");
  await chrome.evaluate(() =>
    window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal", appearance: "dark", keepBerryStill: true }),
  );
  await chrome.emulateMedia({ reducedMotion: "reduce" });
  await expect(saved).toBeVisible();
  await chrome.screenshot({ path: test.info().outputPath("blueberry-bookmarks-horizontal.png") });
  await chrome.getByRole("button", { name: "Remove bookmark", exact: true }).click();
  await expect(saved).toHaveCount(0);
  await menuAction("Bookmark This Page");
  await expect(saved).toBeVisible();
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "vertical", appearance: "light" }));
  await chrome.screenshot({ path: test.info().outputPath("blueberry-bookmarks-vertical.png") });
  await saved.click({ button: "right" });
  await chooseFromMenu(app, "Remove Bookmark");
  await expect(saved).toHaveCount(0);
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).bookmarks).toEqual([]);
});

test("a bookmark kept on top is a tile, by its menu or by dragging, and the sidebar has its menu but no account", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-pins-"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  // Functions, since chrome is a new page after each restart.
  const sidebar = () => chrome.getByRole("navigation", { name: "Sidebar" });
  const favourites = () => sidebar().getByRole("list", { name: "Favourites" });
  const bookmarks = () => sidebar().getByRole("list", { name: "Bookmarks" });
  // With nothing on top there's no place for it at all.
  await expect(favourites()).toHaveCount(0);
  await expect(sidebar().getByText("Bookmark a page to keep it here.")).toBeVisible();
  // With no server there's no account, so the button beside the dock is only the menu.
  await expect(sidebar().getByRole("button", { name: "Settings and more", exact: true })).toBeVisible();
  await expect(sidebar().getByText("Sam Rivera")).toHaveCount(0);
  await expect(sidebar().getByText("sam@example.com")).toHaveCount(0);

  // The menu: Keep on Top makes the bookmark a tile, and it's still bookmarked.
  await visit();
  await chrome.getByRole("button", { name: "Bookmark this page", exact: true }).click();
  const row = () => bookmarks().getByRole("button", { name: "Saved page" });
  const tile = () => favourites().getByRole("button", { name: "Saved page" });
  await row().click({ button: "right" });
  await chooseFromMenu(app, "Keep on Top");
  await expect(tile()).toBeVisible();
  await expect(row()).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: "Remove bookmark", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The tile of the page in front looks selected, and not once another tab is.
  await expect(tile()).toHaveAttribute("aria-current", "page");
  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await expect(tile()).not.toHaveAttribute("aria-current");

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  await tile().click();
  await expect.poll(async () => (await active()).url).toBe(url);
  await expect(tile()).toHaveAttribute("aria-current", "page");

  // Dragged down into the bookmarks, it's a plain bookmark, and the place on top goes.
  await drag(tile(), await leftOf(sidebar().getByText("Bookmark a page to keep it here.")));
  await expect(row()).toBeVisible();
  await expect(favourites()).toHaveCount(0);
  // Dragged back up, a place shows to drop it on.
  const dropPlace = () => sidebar().getByText("Drop to keep on top");
  await expect(dropPlace()).toHaveCount(0);
  await drag(row(), { x: 120, y: 0 }, async () => {
    await expect(dropPlace()).toBeVisible();
    const box = (await dropPlace().boundingBox())!;
    await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  });
  await expect(tile()).toBeVisible();
  await expect(row()).toHaveCount(0);
  await expect(dropPlace()).toHaveCount(0);

  // Tiles reorder among themselves.
  await visit(`${url}second`, "Second page");
  await chrome.getByRole("button", { name: "Bookmark this page", exact: true }).click();
  await bookmarks().getByRole("button", { name: "Second page" }).click({ button: "right" });
  await chooseFromMenu(app, "Keep on Top");
  const order = async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).pinned.map(({ title }) => title);
  await expect.poll(order).toEqual(["Saved page", "Second page"]);
  await drag(favourites().getByRole("button", { name: "Second page" }), await leftOf(tile()));
  await expect.poll(order).toEqual(["Second page", "Saved page"]);

  // A tile's menu moves it to the bookmarks, and the app's menu keeps the page in front on top.
  await tile().click({ button: "right" });
  await chooseFromMenu(app, "Move to Bookmarks");
  await expect(row()).toBeVisible();
  await expect(tile()).toHaveCount(0);
  await visit();
  await menuAction("Keep This Page on Top");
  await expect(tile()).toBeVisible();
  await expect(row()).toHaveCount(0);

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
  expect(library.pinned.map(({ title }) => title)).toEqual(["Second page", "Saved page"]);
  expect(library.bookmarks).toEqual([]);
});

test("bookmarked pages show a filled star in ink, in both layouts and themes", async () => {
  await visit();
  for (const layoutMode of ["vertical", "horizontal"] as const) {
    for (const appearance of ["light", "dark"] as const) {
      await chrome.evaluate((settings) => window.chromeAPI.settings.updateSettings(settings), { layoutMode, appearance });
      const emptyStar = chrome.getByRole("button", { name: "Bookmark this page", exact: true });
      await expect(emptyStar.locator("[data-shown] svg")).toHaveCSS("fill", "none");
      await emptyStar.click();
      const savedStar = chrome.getByRole("button", { name: "Remove bookmark", exact: true });
      // Colour belongs to the mascots, so a saved page is marked in `ink`.
      const color = appearance === "light" ? "rgb(20, 20, 22)" : "rgb(238, 237, 232)";
      await expect(savedStar.locator("[data-shown] svg")).toHaveCSS("fill", color);
      await expect(savedStar.locator("[data-shown] svg")).toHaveCSS("stroke", color);
      await savedStar.hover();
      await expect(savedStar.locator("[data-shown] svg")).toHaveCSS("fill", color);
      await chrome.screenshot({ path: test.info().outputPath(`blueberry-star-${layoutMode}-${appearance}.png`) });
      await savedStar.click();
      await expect(emptyStar.locator("[data-shown] svg")).toHaveCSS("fill", "none");
    }
  }
});

test("reopen closed tab restores pages and internal tabs in reverse closing order", async () => {
  await menuAction("Reopen Closed Tab");
  expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).length).toBe(1);
  await visit();
  const web = await active();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), web.id);
  const settings = await active();
  await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), settings.id);
  await menuAction("Reopen Closed Tab");
  await expect.poll(async () => (await active()).page).toBe("settings");
  await menuAction("Reopen Closed Tab");
  await expect.poll(async () => (await active()).url).toBe(url);
  await menuAction("Reopen Closed Tab");
  expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).length).toBe(3);
});
