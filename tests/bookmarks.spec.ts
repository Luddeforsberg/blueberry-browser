/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";

let app: ElectronApplication;
let chrome: Page;
const server = createServer((_, response) => response.end("<!doctype html><title>Saved page</title>Hello"));
let url: string;

async function menuAction(label: string): Promise<void> {
  await app.evaluate(({ Menu }, label) => {
    const items = Menu.getApplicationMenu()!.items.flatMap((item) => item.submenu?.items ?? []);
    const item = items.find((item) => item.label === label);
    if (!item) throw new Error(`Missing menu item: ${label}`);
    item.click();
  }, label);
}

async function visit(address = url): Promise<void> {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), address);
  await (await findView(app, address)).waitForLoadState();
  await expect.poll(async () => (await active()).title).toBe("Saved page");
}

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
test.afterEach(async () => { await app?.close(); });

test("bookmarking a page saves it across restarts and both layouts, and the star removes it", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-bookmarks-"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  await expect(chrome.getByRole("button", { name: "Bookmark this page", exact: true })).toBeDisabled();
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
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal", appearance: "dark", keepBerryStill: true }));
  await chrome.emulateMedia({ reducedMotion: "reduce" });
  await expect(saved).toBeVisible();
  await chrome.screenshot({ path: "/tmp/blueberry-bookmarks-horizontal.png" });
  await chrome.getByRole("button", { name: "Remove bookmark", exact: true }).click();
  await expect(saved).toHaveCount(0);
  await menuAction("Bookmark This Page");
  await expect(saved).toBeVisible();
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "vertical", appearance: "light" }));
  await chrome.screenshot({ path: "/tmp/blueberry-bookmarks-vertical.png" });
  // Capture and select the native menu without opening a popup outside Playwright.
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () { this.items.find((item) => item.label === "Remove Bookmark")?.click(); };
  });
  await saved.click({ button: "right" });
  await expect(saved).toHaveCount(0);
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).bookmarks).toEqual([]);
});

test("pinning a page keeps it across restarts, and the sidebar has Settings and no account", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-pins-"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  const cluster = sidebar.getByRole("list", { name: "Bookmarks" });
  await expect(cluster).toHaveText("Pin or bookmark a page to keep it here.");
  await expect(sidebar.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(sidebar.getByText("Sam Rivera")).toHaveCount(0);
  await expect(sidebar.getByText("sam@example.com")).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: "Pin this page", exact: true })).toBeDisabled();

  await visit();
  await chrome.getByRole("button", { name: "Pin this page", exact: true }).click();
  // This server has no icon, so the site shows its first letter.
  await expect(cluster.getByRole("button", { name: "Saved page" })).toHaveText("S");

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  const pin = chrome.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "Saved page" });
  await pin.click();
  await expect.poll(async () => (await active()).url).toBe(url);
  await expect.poll(async () => (await active()).title).toBe("Saved page");
  await expect(chrome.getByRole("button", { name: "Unpin this page", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Saved both ways it's still one button, and unpinning leaves the bookmark.
  await chrome.getByRole("button", { name: "Bookmark this page", exact: true }).click();
  await expect(chrome.getByRole("button", { name: "Remove bookmark", exact: true })).toBeVisible();
  await expect(pin).toHaveCount(1);
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () { this.items.find((item) => item.label === "Unpin")?.click(); };
  });
  await pin.click({ button: "right" });
  await expect(chrome.getByRole("button", { name: "Pin this page", exact: true })).toBeVisible();
  await expect(pin).toHaveCount(1);
  await chrome.getByRole("button", { name: "Remove bookmark", exact: true }).click();
  await expect(pin).toHaveCount(0);

  await menuAction("Pin This Page");
  await expect(pin).toBeVisible();
  await chrome.getByRole("button", { name: "Unpin this page", exact: true }).click();
  await expect(pin).toHaveCount(0);

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).pinned).toEqual([]);
  await expect(chrome.getByRole("list", { name: "Bookmarks" })).toHaveText("Pin or bookmark a page to keep it here.");
});

test("bookmarked pages show a filled yellow star in both layouts and themes", async () => {
  await visit();
  for (const layoutMode of ["vertical", "horizontal"] as const) {
    for (const appearance of ["light", "dark"] as const) {
      await chrome.evaluate((settings) => window.chromeAPI.settings.updateSettings(settings), { layoutMode, appearance });
      const emptyStar = chrome.getByRole("button", { name: "Bookmark this page", exact: true });
      await expect(emptyStar.locator("svg")).toHaveCSS("fill", "none");
      await emptyStar.click();
      const savedStar = chrome.getByRole("button", { name: "Remove bookmark", exact: true });
      const color = appearance === "light" ? "rgb(250, 204, 21)" : "rgb(253, 224, 71)";
      await expect(savedStar.locator("svg")).toHaveCSS("fill", color);
      await expect(savedStar.locator("svg")).toHaveCSS("stroke", color);
      await expect(savedStar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await savedStar.hover();
      await expect(savedStar.locator("svg")).toHaveCSS("fill", color);
      await expect(savedStar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await chrome.screenshot({ path: `/tmp/blueberry-star-${layoutMode}-${appearance}.png` });
      await savedStar.click();
      await expect(emptyStar.locator("svg")).toHaveCSS("fill", "none");
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
