// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";

const clickMenu = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, name) => {
    const search = (items: Electron.MenuItem[]): Electron.MenuItem | undefined =>
      items.flatMap((item) => (item.submenu ? [search(item.submenu.items)] : item.label === name ? [item] : []))[0];
    const found = (Menu.getApplicationMenu()?.items ?? []).map((top) => search(top.submenu?.items ?? [])).find(Boolean);
    if (!found) throw new Error(`No menu item ${name}`);
    found.click();
  }, label);

const findBarVisible = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()[0].contentView.children.some(
      (view) =>
        "webContents" in view &&
        (view as Electron.WebContentsView).webContents.getURL().includes("view=find") &&
        view.getVisible()
    )
  );

test("find, zoom and the page menu on a web page", async () => {
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Birds</title><body>
      <p>jackdaw one, jackdaw two, jackdaw three</p>
      <a id="link" href="/next">a link</a>
      <input id="field" value="text">
    </body>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));

  let app = await launchApp(profile);
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), origin);
    const page = await findView(app, origin);
    const find = await findView(app, "view=find");
    await expect(page).toHaveTitle("Birds");

    // Find: counts matches, steps through them, and closes on Esc.
    await clickMenu(app, "Find…");
    await expect.poll(() => findBarVisible(app)).toBe(true);
    const input = find.getByRole("textbox", { name: "Find in page" });
    await expect(input).toBeFocused();
    await input.fill("jackdaw");
    await expect(find.getByText("1 of 3")).toBeVisible();
    await input.press("Enter");
    await expect(find.getByText("2 of 3")).toBeVisible();
    await input.press("Shift+Enter");
    await expect(find.getByText("1 of 3")).toBeVisible();
    await find.getByRole("button", { name: "Next match" }).click();
    await expect(find.getByText("2 of 3")).toBeVisible();
    await find.getByRole("button", { name: "Next match" }).press("Escape");
    await expect.poll(() => findBarVisible(app)).toBe(false);
    await clickMenu(app, "Find…");
    await expect(input).toBeFocused();
    await input.fill("nothing here");
    await expect(find.getByText("No results")).toBeVisible();
    await input.press("Escape");
    await expect.poll(() => findBarVisible(app)).toBe(false);

    // Right-click: the real event builds the menu, with the native popup caught so nothing blocks.
    await app.evaluate(({ Menu }) => {
      const scope = globalThis as unknown as { lastMenu: Electron.Menu | null };
      scope.lastMenu = null;
      Menu.prototype.popup = function (this: Electron.Menu) {
        scope.lastMenu = this;
      };
    });
    const openedMenu = () =>
      app.evaluate(() =>
        (globalThis as unknown as { lastMenu: Electron.Menu | null }).lastMenu?.items.map((item) => item.label)
      );
    const clickOpened = (label: string) =>
      app.evaluate((_, name) => {
        (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.find((item) => item.label === name)?.click();
      }, label);

    await page.locator("#link").click({ button: "right" });
    await expect.poll(openedMenu).toContain("Open Link in New Tab");
    await clickOpened("Open Link in New Tab");
    await expect.poll(() => chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.at(-1)?.url))).toBe(
      `${origin}/next`
    );
    await chrome.evaluate(async (url) => {
      const tabs = await window.chromeAPI.browser.getTabs();
      await window.chromeAPI.browser.switchTab(tabs.find((tab) => tab.url === url)!.id);
    }, `${origin}/`);

    // Ask Berry: the selected text waits in the composer, and nothing is sent.
    await page.locator("p").selectText();
    await page.locator("p").click({ button: "right", position: { x: 5, y: 5 } });
    await expect.poll(openedMenu).toContain("Ask Berry About This");
    await clickOpened("Ask Berry About This");
    const composer = chrome.getByPlaceholder("Ask Berry", { exact: true });
    await expect(composer).toHaveValue("jackdaw one, jackdaw two, jackdaw three");
    await expect(composer).toBeFocused();
    expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats).toEqual([]);

    // Zoom: shown in the toolbar, applied to the page, and kept for the site.
    await clickMenu(app, "Zoom In");
    const badge = chrome.getByRole("button", { name: "Zoom 110%, reset to 100%" });
    await expect(badge).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(1.1 * (await chrome.evaluate(() => window.devicePixelRatio)));
  } finally {
    await app.close();
  }

  // Settings decide the level: Electron keeps a zoom of its own for a host, which this must override.
  const settingsFile = join(profile, "settings.json");
  const saved = JSON.parse(readFileSync(settingsFile, "utf8"));
  expect(saved.siteZoom).toEqual({ "127.0.0.1": 110 });
  writeFileSync(settingsFile, JSON.stringify({ ...saved, siteZoom: { "127.0.0.1": 125 } }));

  // After a restart the saved level comes back when the site opens, and the button resets it.
  app = await launchApp(profile);
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), origin);
    const page = await findView(app, origin);
    const badge = chrome.getByRole("button", { name: "Zoom 125%, reset to 100%" });
    await expect(badge).toBeVisible();
    const chromeRatio = await chrome.evaluate(() => window.devicePixelRatio);
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(1.25 * chromeRatio);
    await badge.click();
    await expect(badge).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(chromeRatio);
  } finally {
    await app.close();
    server.close();
  }
});
