/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";

const SIZE = 64 * 1024;
let slow: ServerResponse | null = null;
const server = createServer((request, response) => {
  if (request.url === "/fast") {
    response.setHeader("Content-Disposition", 'attachment; filename="report.txt"');
    response.end("finished");
  } else if (request.url === "/pixel.gif") {
    response.setHeader("Content-Type", "image/gif");
    response.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  } else if (request.url === "/slow") {
    // Half now, and the rest only when the test says, so it can act on a download still running.
    response.setHeader("Content-Disposition", 'attachment; filename="large.bin"');
    response.setHeader("Content-Length", SIZE);
    response.write(Buffer.alloc(SIZE / 2));
    slow = response;
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Files</title>
      <a id="fast" href="/fast">Fast</a> <a id="slow" href="/slow">Slow</a>
      <a id="blank" href="/fast" target="_blank">New tab</a>
      <img id="pixel" src="/pixel.gif" width="40" height="40">`);
  }
});
let origin: string;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});

// The folder is set before the first launch, so nothing here can reach the real Downloads folder.
const startProfile = () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-downloads-"));
  const folder = join(profile, "saved");
  writeFileSync(join(profile, "settings.json"), JSON.stringify({ onboarded: true, downloadFolder: folder }));
  return { profile, folder };
};

const openFiles = async (app: ElectronApplication, chrome: Page): Promise<Page> => {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}/`);
  const page = await findView(app, `${origin}/`);
  await page.waitForLoadState();
  return page;
};

test("a download saves without a dialog and can be followed, paused, cancelled and found again", async () => {
  const { profile, folder } = startProfile();
  let app = await launchApp(profile);
  let chrome = await findView(app, "view=chrome");
  const page = await openFiles(app, chrome);

  // Stubbed so the test doesn't open anything on the Mac.
  const stubShell = () =>
    app.evaluate(({ shell }) => {
      const calls: string[] = [];
      (globalThis as unknown as { shellCalls: string[] }).shellCalls = calls;
      shell.openPath = async (path) => (calls.push(`open ${path}`), "");
      shell.showItemInFolder = (path) => void calls.push(`show ${path}`);
    });
  const shellCalls = () => app.evaluate(() => (globalThis as unknown as { shellCalls: string[] }).shellCalls);
  await stubShell();

  await page.click("#slow");
  const toolbar = chrome.getByRole("button", { name: /^Downloads: large\.bin/ });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAccessibleName(/50%/);

  await toolbar.click();
  await expect.poll(() => chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.find((tab) => tab.isActive)!.page))).toBe("downloads");
  const large = chrome.getByRole("listitem", { name: "large.bin" });
  await expect(large.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await expect(large.getByText("32.0 KB of 64.0 KB")).toBeVisible();

  await large.getByRole("button", { name: "Pause large.bin" }).click();
  await expect(large.getByText(/^Paused/)).toBeVisible();
  await large.getByRole("button", { name: "Resume large.bin" }).click();
  await expect(large.getByRole("button", { name: "Pause large.bin" })).toBeVisible();
  slow!.end(Buffer.alloc(SIZE / 2));
  await expect(large.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  expect(readFileSync(join(folder, "large.bin")).length).toBe(SIZE);

  // A second one with the same name doesn't overwrite the first. A link to a new tab doesn't leave one behind.
  const switchToFiles = () => chrome.evaluate(async (url) => {
    const tabs = await window.chromeAPI.browser.getTabs();
    await window.chromeAPI.browser.switchTab(tabs.find((tab) => tab.url === url)!.id);
  }, `${origin}/`);
  await switchToFiles();
  await page.click("#fast");
  await expect.poll(() => existsSync(join(folder, "report.txt"))).toBe(true);
  const tabCount = await chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.length));
  await page.click("#blank");
  await expect.poll(() => existsSync(join(folder, "report (1).txt"))).toBe(true);
  await expect.poll(() => chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.length))).toBe(tabCount);
  expect(readFileSync(join(folder, "report.txt"), "utf8")).toBe("finished");

  // Save Image in the page's right-click menu arrives through the same handler.
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () { this.items.find((item) => item.label.startsWith("Save Image"))?.click(); };
  });
  await switchToFiles();
  await page.click("#pixel", { button: "right" });
  await expect.poll(() => existsSync(join(folder, "pixel.gif"))).toBe(true);

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("downloads"));
  const report = chrome.getByRole("listitem", { name: "report (1).txt" });
  await report.getByRole("button", { name: "Open", exact: true }).click();
  await report.getByRole("button", { name: "Show report (1).txt in folder" }).click();
  const saved = join(folder, "report (1).txt");
  await expect.poll(shellCalls).toEqual([`open ${saved}`, `show ${saved}`]);

  // Cancelling leaves nothing behind.
  await switchToFiles();
  await page.click("#slow");
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("downloads"));
  const copy = chrome.getByRole("listitem", { name: "large (1).bin" });
  await copy.getByRole("button", { name: "Cancel large (1).bin" }).click();
  await expect(copy.getByText("Cancelled")).toBeVisible();
  slow!.destroy();
  await expect(chrome.locator('button[title="Downloads"]')).toBeVisible();
  await expect.poll(() => readdirSync(folder).sort()).toEqual(["large.bin", "pixel.gif", "report (1).txt", "report.txt"]);

  // The list survives a restart, and a file that's gone says so and can't be opened.
  rmSync(join(folder, "report.txt"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("downloads"));
  const gone = chrome.getByRole("listitem", { name: "report.txt" });
  await expect(gone.getByText("File is missing")).toBeVisible();
  await expect(gone.getByRole("button", { name: "Open", exact: true })).toHaveCount(0);
  await expect(chrome.getByRole("listitem", { name: "large.bin" }).getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await expect(chrome.getByRole("listitem", { name: "large (1).bin" }).getByText("Cancelled")).toBeVisible();

  await gone.getByRole("button", { name: "Remove report.txt from the list" }).click();
  await expect(gone).toHaveCount(0);
  await app.close();
});

test("a site can't use anything until the user answers, and the answer can be changed in Settings", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-permissions-"));
  let app = await launchApp(profile);
  let chrome = await findView(app, "view=chrome");
  const prompt = await findView(app, "view=prompt");
  let page = await openFiles(app, chrome);
  const notifications = () => page.evaluate(() => Notification.permission);
  expect(await notifications()).not.toBe("granted");

  // Waiting on the user, with nothing granted yet.
  const ask = page.evaluate(() => Notification.requestPermission());
  const card = prompt.getByRole("region", { name: "Site permission" });
  await expect(card).toContainText(`${origin} wants to show you notifications`);
  expect(await notifications()).not.toBe("granted");

  // Only the prompt view can answer: not the chrome, and so not anything that drives it.
  const current = await prompt.evaluate(() => window.chromeAPI.permissions.current());
  await expect(chrome.evaluate((id) => window.chromeAPI.permissions.decide(id, true), current!.id)).rejects.toThrow(/Rejected permissions:decide/);

  // It only shows while its tab does.
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await expect.poll(() => prompt.evaluate(() => window.chromeAPI.permissions.current())).toBeNull();
  await chrome.evaluate(async (url) => {
    const tabs = await window.chromeAPI.browser.getTabs();
    await window.chromeAPI.browser.switchTab(tabs.find((tab) => tab.url === url)!.id);
  }, `${origin}/`);
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Allow", exact: true }).click();
  expect(await ask).toBe("granted");
  await expect.poll(notifications).toBe("granted");

  // A block is remembered too, and refuses at once.
  const blocked = page.evaluate(() => new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(() => resolve("position"), (error) => resolve(error.code))
  ));
  await expect(card).toContainText("wants to know your location");
  await card.getByRole("button", { name: "Block" }).click();
  expect(await blocked).toBe(1);
  await expect.poll(() => prompt.evaluate(() => window.chromeAPI.permissions.current())).toBeNull();

  // Screen sharing asks too, and a block needs no picker.
  const screen = page.evaluate(() =>
    navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "stream", (error) => error.name)
  );
  await expect(card).toContainText("wants to see your entire screen");
  await expect(card).toContainText("Allow is for this time only");
  await card.getByRole("button", { name: "Block" }).click();
  expect(await screen).toBe("NotAllowedError");

  // Answers survive a restart, and Settings can change them.
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");
  page = await openFiles(app, chrome);
  expect(await notifications()).toBe("granted");

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await chrome.getByRole("button", { name: "Site permissions" }).click();
  await chrome.getByRole("radiogroup", { name: `Notifications for ${origin}` }).getByRole("radio", { name: "Block" }).click();
  await expect.poll(notifications).toBe("denied");
  await chrome.getByRole("button", { name: `Forget Location for ${origin}` }).click();
  await expect(chrome.getByRole("button", { name: `Forget Location for ${origin}` })).toHaveCount(0);
  const saved = await chrome.evaluate(() => window.chromeAPI.permissions.saved());
  expect(saved.map(({ permission, decision }) => `${permission} ${decision}`).sort()).toEqual([
    "notifications block", "screen block",
  ]);
  await app.close();
});
