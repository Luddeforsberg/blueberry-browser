// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/topbar.d.ts" />
/// <reference path="../src/preload/sidebar.d.ts" />
/// <reference path="../src/preload/darkMode.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwAEAgH/1oN2SgAAAABJRU5ErkJggg==",
  "base64"
);

let server: Server;
let origin: string;
let app: ElectronApplication;
let topBar: Page;
let sidebar: Page;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/icon.png") {
      response.setHeader("content-type", "image/png");
      response.end(PNG);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(
      '<!doctype html><title>Fixture</title><link rel="icon" href="/icon.png"><body>hello from the page</body>'
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  server.close();
});

test.beforeEach(async () => {
  app = await launchApp();
  topBar = await findView(app, "topbar/index.html");
  sidebar = await findView(app, "sidebar/index.html");
});

test.afterEach(async () => {
  await app.close();
});

const getTabs = () => topBar.evaluate(() => window.topBarAPI.getTabs());

const activeTab = async () => {
  const active = (await getTabs()).filter((tab) => tab.isActive);
  expect(active).toHaveLength(1);
  return active[0];
};

const openFixture = async () => {
  await topBar.evaluate((url) => window.topBarAPI.createTab(url), `${origin}/`);
  const page = await findView(app, origin);
  await page.waitForLoadState();
  return page;
};

test("page text reaches the chat", async () => {
  await openFixture();

  const text = await sidebar.evaluate(() => window.sidebarAPI.getPageText());

  expect(text).toContain("hello from the page");
});

test("a new tab becomes the active tab", async () => {
  const before = await getTabs();

  const created = await topBar.evaluate(
    (url) => window.topBarAPI.createTab(url),
    `${origin}/`
  );

  expect(await getTabs()).toHaveLength(before.length + 1);
  expect((await activeTab()).id).toBe(created?.id);
});

test("links that open a new window become tabs, from every tab and from the chrome", async () => {
  const page = await openFixture();
  const windows = () =>
    app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);
  const count = (await getTabs()).length;

  await page.evaluate((url) => void window.open(url), `${origin}/from-page`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-page");

  await sidebar.evaluate((url) => void window.open(url), `${origin}/from-chat`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-chat");

  await topBar.evaluate((url) => void window.open(url), `${origin}/from-topbar`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-topbar");

  expect(await getTabs()).toHaveLength(count + 3);
  expect(await windows()).toBe(1);
});

test("window.open ignores anything that isn't a web link", async () => {
  const page = await openFixture();
  const count = (await getTabs()).length;

  await page.evaluate(() => void window.open("file:///etc/hosts"));
  await page.evaluate((url) => window.fetch(url), `${origin}/settled`);

  expect(await getTabs()).toHaveLength(count);
});

test("activating the app with a window open doesn't start a second one", async () => {
  const windows = await app.evaluate(({ app, BaseWindow }) => {
    app.emit("activate");
    return BaseWindow.getAllWindows().length;
  });

  expect(windows).toBe(1);
});

test("the app reopens after its last window closes", async () => {
  test.skip(process.platform !== "darwin", "Only macOS keeps running with no windows");

  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].close());
  await expect.poll(() =>
    app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)
  ).toBe(0);

  const windows = await app.evaluate(({ app, BaseWindow }) => {
    app.emit("activate");
    return BaseWindow.getAllWindows().length;
  });

  expect(windows).toBe(1);
});

test("favicons come from the page, not from Google", async () => {
  await openFixture();

  await expect.poll(async () => (await activeTab()).favicon).toBe(`${origin}/icon.png`);
  await expect(topBar.locator(`img[src="${origin}/icon.png"]`).first()).toBeAttached();
  await expect(topBar.locator('img[src*="google.com/s2/favicons"]')).toHaveCount(0);
});

test("chat markdown gets typography styles", async () => {
  await app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().includes("sidebar/index.html"))
      ?.send("chat:messages-updated", [
        { role: "assistant", content: "# Heading\n\n- item" },
      ]);
  });

  const list = sidebar.locator(".prose ul");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("list-style-type", "disc");
});

test("streamed chunks appear in the chat as they arrive", async () => {
  await app.evaluate(({ webContents }) => {
    const chat = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().includes("sidebar/index.html"));
    chat?.send("chat:messages-updated", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "" },
    ]);
    for (const content of ["first ", "second"]) {
      chat?.send("chat:chunk", { messageId: "1", content, isComplete: false });
    }
  });

  await expect(sidebar.getByText("first second")).toBeVisible();
});

test("chrome renderers get no raw IPC or code execution in tabs", async () => {
  for (const view of [topBar, sidebar]) {
    expect(await view.evaluate(() => "electron" in window)).toBe(false);
  }
  expect(await topBar.evaluate(() => "tabRunJs" in window.topBarAPI)).toBe(false);
});

test("chrome renderers run sandboxed", async () => {
  const sandboxed = await app.evaluate(({ app, webContents }) => {
    const metrics = app.getAppMetrics();
    return webContents
      .getAllWebContents()
      .filter((contents) => /\/(topbar|sidebar)\//.test(contents.getURL()))
      .map((contents) => metrics.find((metric) => metric.pid === contents.getOSProcessId())?.sandboxed);
  });

  expect(sandboxed).toEqual([true, true]);
});

test("chrome renderers can't be navigated away from their own page", async () => {
  for (const view of [topBar, sidebar]) {
    const own = view.url();
    await view.evaluate((url) => {
      window.location.href = url;
    }, `${origin}/elsewhere`);
    await view.waitForTimeout(300);

    expect(await view.evaluate(() => window.location.href)).toBe(own);
  }
});

test("dark mode still syncs between the chrome renderers", async () => {
  await topBar.evaluate(() => window.darkModeAPI.notifyChanged(true));

  await expect(sidebar.locator("html")).toHaveClass(/dark/);
});

test("the sidebar and tabs fill the window, whether the sidebar is open or not", async () => {
  const page = await openFixture();
  const width = (view: Page) => view.evaluate(() => window.innerWidth);
  const windowWidth = await width(topBar);

  expect(await width(sidebar)).toBe(400);
  expect(await width(page)).toBe(windowWidth - 400);

  await topBar.evaluate(() => window.topBarAPI.toggleSidebar());
  await expect.poll(() => width(page)).toBe(windowWidth);

  // A tab opened while the sidebar is hidden gets the same space as the others.
  await topBar.evaluate((url) => window.topBarAPI.createTab(url), `${origin}/second`);
  const second = await findView(app, `${origin}/second`);
  await expect.poll(() => width(second)).toBe(windowWidth);

  await topBar.evaluate(() => window.topBarAPI.toggleSidebar());
  await expect.poll(() => width(sidebar)).toBe(400);
  await expect.poll(() => width(second)).toBe(windowWidth - 400);
});

test("views follow the window when it resizes", async () => {
  // The window may not get the size it asks for on a small screen, such as a CI runner.
  const [width, height] = await app.evaluate(({ BaseWindow }) => {
    const baseWindow = BaseWindow.getAllWindows()[0];
    baseWindow.setContentSize(1100, 800);
    return baseWindow.getContentSize();
  });
  expect(width).toBe(1100);

  await expect.poll(() => topBar.evaluate(() => window.innerWidth)).toBe(width);
  await expect.poll(() => sidebar.evaluate(() => window.innerHeight)).toBe(height - 88);
});
