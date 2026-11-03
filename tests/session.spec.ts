// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

let server: Server;
let origin: string;
let model: FakeModel;

const THREE_LAUNCHES_MS = 60_000;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Title of ${request.url?.slice(1)}</title><body>Words on ${request.url}`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  model = await startFakeModel();
});

test.afterAll(() => {
  server.close();
  model.close();
});

const tabs = (chrome: Page) => chrome.evaluate(() => window.chromeAPI.browser.getTabs());

const open = async (chrome: Page, path: string) => {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}/${path}`);
  await expect(chrome.locator("[data-berry-tab]", { hasText: `Title of ${path}` })).toBeVisible();
};

const goToInActive = async (chrome: Page, path: string) => {
  await chrome.evaluate(async (url) => {
    const list = await window.chromeAPI.browser.getTabs();
    await window.chromeAPI.browser.navigateTab(list.find((tab) => tab.isActive)!.id, url);
  }, `${origin}/${path}`);
  await expect(chrome.locator("[data-berry-tab]", { hasText: `Title of ${path}` })).toBeVisible();
};

const launch = async (profile: string, modelEnv: Record<string, string> = {}) => {
  const app = await launchApp(profile, { modelEnv });
  return { app, chrome: await findView(app, "view=chrome") };
};

test("a restart brings tabs back without loading them all, and history is kept", async () => {
  test.setTimeout(THREE_LAUNCHES_MS);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));

  let { app, chrome } = await launch(profile);
  await goToInActive(chrome, "page-one");
  await goToInActive(chrome, "page-two");
  await open(chrome, "page-three");
  await open(chrome, "page-four");
  // Four goes before three now, and three is the tab being looked at.
  const before = await tabs(chrome);
  await chrome.evaluate(([id]) => window.chromeAPI.browser.moveTab(id, 1), [before[2].id]);
  await chrome.evaluate(([id]) => window.chromeAPI.browser.switchTab(id), [before[1].id]);
  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await app.close();

  ({ app, chrome } = await launch(profile));
  // Only the pages that exist in a view. A restored page can come from the cache, so the server can't tell.
  const loaded = () =>
    app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().map((contents) => contents.getURL()).filter((url) => url.startsWith("http")).sort()
    );
  await expect.poll(async () => (await tabs(chrome)).map((tab) => tab.title)).toEqual([
    "Title of page-two",
    "Title of page-four",
    "Title of page-three",
  ]);
  expect((await tabs(chrome)).map((tab) => tab.isActive)).toEqual([false, false, true]);
  expect((await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).sidebarOpen).toBe(false);
  await expect.poll(loaded).toEqual([`${origin}/page-three`]);

  // Going to a tab loads it, with its back button working.
  const [first] = await tabs(chrome);
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), first.id);
  await expect.poll(loaded).toEqual([`${origin}/page-three`, `${origin}/page-two`]);
  await expect.poll(async () => (await tabs(chrome))[0]).toMatchObject({ canGoBack: true, isLoading: false });
  await chrome.evaluate((id) => window.chromeAPI.browser.goBack(id), first.id);
  await expect.poll(async () => (await tabs(chrome))[0].title).toBe("Title of page-one");

  // Coming back after a restart wasn't a visit, but going back was.
  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await app.evaluate(({ Menu }) => {
    const go = Menu.getApplicationMenu()!.items.find((item) => item.label === "Go")!;
    go.submenu!.items.find((item) => item.accelerator === "CmdOrCtrl+Y")!.click();
  });
  const list = chrome.getByRole("region", { name: "Today" }).getByRole("listitem");
  await expect(list).toHaveCount(5);
  await expect(list.first()).toContainText("Title of page-one");

  await chrome.getByRole("searchbox", { name: "Search history" }).fill("page-tw");
  await expect(list).toHaveCount(1);
  await list.first().hover();
  await chrome.getByRole("button", { name: "Delete Title of page-two from history" }).click();
  await expect(chrome.getByText("No pages match “page-tw”.")).toBeVisible();

  await chrome.getByRole("searchbox", { name: "Search history" }).fill("");
  await expect(list).toHaveCount(4);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  });
  await chrome.getByRole("button", { name: "Clear history" }).click();
  await expect(chrome.getByText("Nothing here yet. I looked under everything.")).toBeVisible();
  expect(await chrome.evaluate(() => window.chromeAPI.browser.getRecent())).toEqual([]);
  await app.close();

  // Starting fresh opens a new tab, and doesn't keep the old ones to come back to.
  ({ app, chrome } = await launch(profile));
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ onStartup: "fresh" }));
  await app.close();
  expect(readdirSync(profile)).not.toContain("session.json");
  ({ app, chrome } = await launch(profile));
  await expect.poll(async () => (await tabs(chrome)).map((tab) => tab.page)).toEqual(["new-tab"]);
  await app.close();
});

test("a page that can't load says so with its address, and Reload tries again", async () => {
  test.setTimeout(THREE_LAUNCHES_MS);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));
  // A port nothing answers on, until the page is reloaded.
  const late = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Up at last</title><body>Here now");
  });
  await new Promise<void>((resolve) => late.listen(0, "127.0.0.1", resolve));
  const { port } = late.address() as AddressInfo;
  await new Promise((resolve) => late.close(resolve));
  const url = `http://127.0.0.1:${port}/missing`;

  const { app, chrome } = await launch(profile);
  try {
    await chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), url);
    const notice = chrome.getByRole("alert").filter({ hasText: "This page couldn’t load" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(url);
    await expect(notice).toContainText("refused the connection");
    const failed = (await tabs(chrome)).find((tab) => tab.isActive)!;
    expect(failed).toMatchObject({ title: `127.0.0.1:${port}`, url, loadError: { url, description: "ERR_CONNECTION_REFUSED" } });

    await new Promise<void>((resolve) => late.listen(port, "127.0.0.1", resolve));
    await notice.getByRole("button", { name: "Reload" }).click();
    await expect(notice).toBeHidden();
    await expect.poll(async () => (await tabs(chrome)).find((tab) => tab.id === failed.id)?.title).toBe("Up at last");
    expect((await tabs(chrome)).find((tab) => tab.id === failed.id)?.loadError).toBeNull();
  } finally {
    late.close();
    await app.close();
  }
});

test("a crashed page stays in its tab, tells Berry so, and reloads; damaged databases don't stop a launch", async () => {
  test.setTimeout(THREE_LAUNCHES_MS);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));

  let { app, chrome } = await launch(profile, model.env);
  await goToInActive(chrome, "page-calm");
  await open(chrome, "page-doomed");

  const crash = () =>
    app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().find((c) => c.getURL().endsWith("/page-doomed"))!.forcefullyCrashRenderer()
    );
  await crash();
  const notice = chrome.getByRole("alert").filter({ hasText: "This page crashed" });
  await expect(notice).toBeVisible();

  model.reset();
  const doomed = (await tabs(chrome)).find((tab) => tab.isActive)!;
  expect(doomed.trouble).toBe("crashed");
  model.callTools({ name: "read_page", args: { tabId: doomed.id } }, { name: "list_elements", args: { tabId: doomed.id } });
  model.replyWith("That page has crashed.");
  await chrome.evaluate(() => window.chromeAPI.chat.send(null, "What does this page say?", { seePage: true }));
  await expect.poll(() => model.requests.length, { timeout: 15_000 }).toBeGreaterThan(1);
  const toolResults = JSON.stringify(model.requests.at(-1)!.messages.filter((message) => message.role === "tool"));
  expect(toolResults.match(/has crashed, so nothing happened/g)).toHaveLength(2);

  await notice.getByRole("button", { name: "Reload" }).click();
  await expect(notice).toBeHidden();
  await expect.poll(async () => (await tabs(chrome)).find((tab) => tab.id === doomed.id)?.trouble).toBeNull();
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().find((c) => c.getURL().endsWith("/page-doomed"))!.isCrashed()
      )
    )
    .toBe(false);

  // A crashed tab still closes like any other.
  await crash();
  await expect(notice).toBeVisible();
  await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), doomed.id);
  await expect.poll(async () => (await tabs(chrome)).length).toBe(1);
  await expect(notice).toBeHidden();
  await app.close();

  writeFileSync(join(profile, "chats.db"), "not a database".repeat(1000));
  writeFileSync(join(profile, "history.db"), "not a database".repeat(1000));
  writeFileSync(join(profile, "routines.db"), "not a database".repeat(1000));
  ({ app, chrome } = await launch(profile));
  await expect.poll(async () => (await tabs(chrome)).length).toBe(1);
  expect(readdirSync(profile).filter((file) => file.includes(".corrupt-"))).toHaveLength(3);
  expect(await chrome.evaluate(() => window.chromeAPI.library.getLibrary().then(({ chats }) => chats))).toEqual([]);
  await app.close();
});

test("pages Berry opens behind the chat stay out of history until the user goes there", async () => {
  const { app, chrome } = await launch(mkdtempSync(join(tmpdir(), "blueberry-test-")), model.env);
  model.reset();
  model.callTools({ name: "open_tab", args: { url: `${origin}/page-berrys` } });
  // Held, since its tab closes once the job is done.
  const finish = model.holdBeforeFirstToken();
  await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Open that page", { seePage: false }));
  await expect.poll(async () => (await tabs(chrome)).find((tab) => tab.title === "Title of page-berrys")?.isActive).toBe(false);
  await expect.poll(() => model.requests.length, { timeout: 15_000 }).toBeGreaterThan(1);
  const recent = () => chrome.evaluate(() => window.chromeAPI.browser.getRecent());
  expect(await recent()).toEqual([]);

  const berrys = (await tabs(chrome)).find((tab) => tab.title === "Title of page-berrys")!;
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), berrys.id);
  await expect.poll(async () => (await recent()).map((visit) => visit.title)).toEqual(["Title of page-berrys"]);
  finish();
  await app.close();
});
