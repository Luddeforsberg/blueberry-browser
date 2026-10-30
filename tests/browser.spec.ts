// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwAEAgH/1oN2SgAAAABJRU5ErkJggg==",
  "base64"
);

let server: Server;
let origin: string;
let app: ElectronApplication;
let chrome: Page;

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
  chrome = await findView(app, "view=chrome");
});

test.afterEach(async () => {
  await app.close();
});

const getTabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());

const activeTab = async () => {
  const active = (await getTabs()).filter((tab) => tab.isActive);
  expect(active).toHaveLength(1);
  return active[0];
};

const openFixture = async (path = "/") => {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}${path}`);
  const page = await findView(app, `${origin}${path}`);
  await page.waitForLoadState();
  return page;
};

const sendToChrome = (channel: string, payload: unknown) =>
  app.evaluate(
    ({ webContents }, [channel, payload]) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().includes("view=chrome"))
        ?.send(channel as string, payload);
    },
    [channel, payload] as const
  );

const openChat = async () => {
  await chrome.getByRole("button", { name: "Show Berry" }).click();
  await expect(chrome.getByRole("complementary", { name: "Berry" })).toBeVisible();
};

test("page text reaches the chat", async () => {
  await openFixture();

  const text = await chrome.evaluate(() => window.chromeAPI.chat.getPageText());

  expect(text).toContain("hello from the page");
});

test("a new tab becomes the active tab", async () => {
  const before = await getTabs();

  const created = await chrome.evaluate(
    (url) => window.chromeAPI.browser.createTab(url),
    `${origin}/`
  );

  expect(await getTabs()).toHaveLength(before.length + 1);
  expect((await activeTab()).id).toBe(created.id);
});

test("the sidebar lists tabs as they change, without being asked", async () => {
  await openFixture();

  const tab = chrome
    .getByRole("list", { name: "Tabs" })
    .getByRole("button", { name: "Fixture", exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-current", "page");
});

test("back and forward reflect the page's real history", async () => {
  const page = await openFixture("/first");
  const back = chrome.getByRole("button", { name: "Back", exact: true });
  const forward = chrome.getByRole("button", { name: "Forward", exact: true });

  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await page.evaluate((url) => {
    window.location.href = url;
  }, `${origin}/second`);
  await expect(back).toBeEnabled();

  await back.click();
  await expect(forward).toBeEnabled();
  await expect.poll(async () => (await activeTab()).url).toContain("/first");
});

test("links that open a new window become tabs, from every tab and from the chrome", async () => {
  const page = await openFixture();
  const windows = () =>
    app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);
  const count = (await getTabs()).length;

  await page.evaluate((url) => void window.open(url), `${origin}/from-page`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-page");

  await chrome.evaluate((url) => void window.open(url), `${origin}/from-chrome`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-chrome");

  expect(await getTabs()).toHaveLength(count + 2);
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
  await expect(chrome.locator(`img[src="${origin}/icon.png"]`).first()).toBeAttached();
  await expect(chrome.locator('img[src*="google.com/s2/favicons"]')).toHaveCount(0);
});

test("chat markdown gets typography styles", async () => {
  await openChat();
  await sendToChrome("chat:messages-updated", [
    { role: "assistant", content: "# Heading\n\n- item" },
  ]);

  const list = chrome.locator(".prose ul");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("list-style-type", "disc");
});

test("streamed chunks appear in the chat as they arrive", async () => {
  await openChat();
  await sendToChrome("chat:messages-updated", [
    { role: "user", content: "hello" },
    { role: "assistant", content: "" },
  ]);
  for (const content of ["first ", "second"]) {
    await sendToChrome("chat:chunk", { messageId: "1", content, isComplete: false });
  }

  await expect(chrome.getByText("first second")).toBeVisible();
});

test("the chrome renderer gets no raw IPC or code execution in tabs", async () => {
  expect(await chrome.evaluate(() => "electron" in window)).toBe(false);
  expect(await chrome.evaluate(() => "tabRunJs" in window.chromeAPI.browser)).toBe(false);
});

test("the chrome renderers run sandboxed", async () => {
  const sandboxed = await app.evaluate(({ app, webContents }) => {
    const metrics = app.getAppMetrics();
    return webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().includes("/chrome/"))
      .map((contents) => metrics.find((metric) => metric.pid === contents.getOSProcessId())?.sandboxed);
  });

  // The chrome view, and the overlay view for the floating sidebar.
  expect(sandboxed).toEqual([true, true]);
});

test("the chrome renderer can't be navigated away from its own page", async () => {
  const own = chrome.url();
  await chrome.evaluate((url) => {
    window.location.href = url;
  }, `${origin}/elsewhere`);
  await chrome.waitForTimeout(300);

  expect(await chrome.evaluate(() => window.location.href)).toBe(own);
});

test("the appearance setting switches the chrome between light and dark", async () => {
  const html = chrome.locator("html");

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "dark" }));
  await expect(html).toHaveClass(/dark/);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light" }));
  await expect(html).not.toHaveClass(/dark/);
});

test("the page card follows the sidebar and chat as they open and close", async () => {
  // The window may not get the size it asks for on a small screen, such as a CI runner.
  const [width, height] = await app.evaluate(({ BaseWindow }) => {
    const baseWindow = BaseWindow.getAllWindows()[0];
    baseWindow.setContentSize(1200, 700);
    return baseWindow.getContentSize();
  });
  expect(width).toBe(1200);

  const page = await openFixture();
  const size = () => page.evaluate(() => [window.innerWidth, window.innerHeight]);

  // Sidebar open and chat closed, which is how the app starts.
  await expect.poll(size).toEqual([width - 280, height - 76]);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  await expect.poll(size).toEqual([width - 280 - 400, height - 76]);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await expect.poll(size).toEqual([width - 4 - 400, height - 76]);

  // A tab opened now gets the same space as the others.
  const second = await openFixture("/second");
  await expect
    .poll(() => second.evaluate(() => window.innerWidth))
    .toBe(width - 4 - 400);
});

test("the chrome fills the window as it resizes", async () => {
  const [width, height] = await app.evaluate(({ BaseWindow }) => {
    const baseWindow = BaseWindow.getAllWindows()[0];
    baseWindow.setContentSize(1100, 700);
    return baseWindow.getContentSize();
  });
  expect(width).toBe(1100);

  await expect
    .poll(() => chrome.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([width, height]);
});

const setContentSize = (width: number, height: number) =>
  app.evaluate(
    ({ BaseWindow }, [width, height]) => {
      const baseWindow = BaseWindow.getAllWindows()[0];
      baseWindow.setContentSize(width, height);
      return baseWindow.getContentSize();
    },
    [width, height]
  );

const overlayVisible = () =>
  app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()[0]
      .contentView.children.find((view) =>
        "webContents" in view
          ? (view as Electron.WebContentsView).webContents.getURL().includes("view=overlay")
          : false
      )
      ?.getVisible()
  );

test("horizontal tabs put a tab row above the toolbar, with the same tabs", async () => {
  const [width, height] = await setContentSize(1200, 700);
  expect(width).toBe(1200);
  const page = await openFixture();

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));

  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
  const tab = chrome
    .getByRole("list", { name: "Tabs" })
    .getByRole("button", { name: "Fixture", exact: true });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([width, height - 40 - 76]);
  expect(
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("horizontal-tabs")?.checked)
  ).toBe(true);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "vertical" }));
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
});

test("the sidebar and chat resize within their limits, by pointer or keyboard", async () => {
  const [width] = await setContentSize(1400, 700);
  expect(width).toBe(1400);
  const page = await openFixture();
  const pageWidth = () => page.evaluate(() => window.innerWidth);

  await chrome.evaluate(() => window.chromeAPI.layout.resize("sidebar", 300));
  await expect.poll(pageWidth).toBe(width - 300);

  await chrome.evaluate(() => window.chromeAPI.layout.resize("sidebar", 9999));
  await expect.poll(pageWidth).toBe(width - 360);

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
  await expect(chrome.getByRole("separator", { name: "Resize Berry" })).toHaveAttribute(
    "aria-valuenow",
    "400"
  );
  await expect.poll(pageWidth).toBe(width - 250 - 400);
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
  await expect(
    overlay.getByRole("list", { name: "Tabs" }).getByRole("button", { name: "Fixture", exact: true })
  ).toBeVisible();

  await overlay.evaluate(() => window.chromeAPI.layout.hideFloatingSidebar());
  await expect.poll(overlayVisible).toBe(false);

  // Pinning it from the floating sidebar opens the real one.
  await chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
  await overlay.getByRole("button", { name: "Keep sidebar open" }).click();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
  expect(await overlayVisible()).toBe(false);
});

test("the app starts on the new tab page, and typing an address opens it in that tab", async () => {
  const [first] = await getTabs();
  expect(first).toMatchObject({ page: "new-tab", isActive: true });
  await expect(chrome.getByRole("heading", { name: "Where shall we start today?" })).toBeVisible();

  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill(`${origin}/typed`);
  await input.press("Enter");

  await expect.poll(async () => (await activeTab()).url).toBe(`${origin}/typed`);
  expect((await activeTab()).id).toBe(first.id);
  expect((await activeTab()).page).toBeNull();
});

test("recent on the new tab page lists pages really visited", async () => {
  await openFixture("/visited");
  await expect.poll(async () => (await activeTab()).title).toBe("Fixture");

  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  const recent = chrome.getByRole("region", { name: "Recent" });
  await expect(recent.getByRole("button", { name: /Fixture/ })).toBeVisible();
});

test("asking Berry from the new tab page opens a chat that the sidebar lists", async () => {
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill("Plan a trip to Porto");
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  expect((await getTabs()).some((tab) => tab.page === "new-tab")).toBe(false);
  await expect(chrome.getByText("Plan a trip to Porto").first()).toBeVisible();
  await expect(chrome.getByText(/This is sample data/)).toBeVisible();

  const chats = chrome.getByRole("region", { name: "Chats" });
  await expect(chats.getByRole("button", { name: "Plan a trip to Porto" })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("the sidebar opens Routines and Settings as tabs, once each", async () => {
  const places = chrome.getByRole("list", { name: "Places" });

  await places.getByRole("button", { name: "Routines" }).click();
  await expect(chrome.getByRole("heading", { name: "Routines", level: 1 })).toBeVisible();
  await expect(chrome.getByText("Needs your OK")).toBeVisible();

  await places.getByRole("button", { name: "Settings" }).click();
  await places.getByRole("button", { name: "Routines" }).click();

  const pages = (await getTabs()).map((tab) => tab.page).filter(Boolean);
  expect(pages.filter((page) => page === "routines")).toHaveLength(1);
  expect(pages.filter((page) => page === "settings")).toHaveLength(1);
  expect((await activeTab()).page).toBe("routines");
});

test("settings are saved and come back after a restart", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-settings-"));
  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await chrome.getByRole("button", { name: "Layout" }).click();
  await chrome.getByRole("radio", { name: "Horizontal" }).click();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);

  await app.close();
  app = await launchApp(profile);
  chrome = await findView(app, "view=chrome");

  await expect
    .poll(() => chrome.evaluate(() => window.chromeAPI.settings.getSettings().then((s) => s.layoutMode)))
    .toBe("horizontal");
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
});

test("Close Tab in the menu closes internal pages too", async () => {
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  expect((await activeTab()).page).toBe("settings");

  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "Close Tab")?.click();
  });

  await expect.poll(async () => (await getTabs()).some((tab) => tab.page === "settings")).toBe(false);
});

test("first launch shows onboarding until it's finished or skipped", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-first-"));
  await app.close();
  app = await launchApp(profile, { firstLaunch: true });
  chrome = await findView(app, "view=chrome");

  await expect(chrome.getByRole("heading", { name: "Hi, I’m Berry." })).toBeVisible();
  await chrome.getByRole("button", { name: "Nice to meet you" }).click();
  await chrome.getByRole("radio", { name: "Tabs along the top" }).click();
  await chrome.getByRole("button", { name: "Skip setup" }).click();

  await expect(chrome.getByRole("heading", { name: "Where shall we start today?" })).toBeVisible();
  expect(await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).toMatchObject({
    onboarded: true,
    layoutMode: "horizontal",
  });

  await app.close();
  app = await launchApp(profile, { firstLaunch: true });
  chrome = await findView(app, "view=chrome");
  await expect(chrome.getByRole("heading", { name: "Where shall we start today?" })).toBeVisible();
});

test("the new tab composer sends only when there is text, and asks Berry unless it's an address", async () => {
  const send = chrome.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();

  await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" }).fill("Plan a trip to Porto");
  await send.click();

  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  await expect(chrome.getByText(/This is sample data/)).toBeVisible();
});

test("the main chat and the chat panel share one composer", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  const main = chrome.getByRole("textbox", { name: "Message" });
  await expect(main).toBeVisible();
  const mainClass = await main.getAttribute("class");

  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await expect(panel).toBeVisible();
  expect(await panel.getAttribute("class")).toBe(mainClass);
});

test("the sidebar's search button focuses the address bar", async () => {
  await chrome.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: "Search" }).click();

  await expect(chrome.getByRole("textbox", { name: "Address" })).toBeFocused();
});

test("a card on the composer shows the page Berry can see, and removing it takes the page away", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("group", { name: "Berry can see 127.0.0.1" });

  await expect(card).toBeVisible();
  await card.hover();
  await panel.getByRole("button", { name: "Remove this page" }).click();

  await expect(card).toHaveCount(0);
  expect(await chrome.evaluate(() => window.chromeAPI.chat.getPageAccess())).toBe(false);

  await panel.getByRole("button", { name: "Add this page" }).click();
  await expect(card).toBeVisible();
  expect(await chrome.evaluate(() => window.chromeAPI.chat.getPageAccess())).toBe(true);
});

test("Hide Berry swaps the character for a plain icon and neutral words", async () => {
  await expect(chrome.getByRole("img", { name: /^Berry, / }).first()).toBeVisible();

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: false }));

  await expect(chrome.getByRole("img", { name: /^Berry, / })).toHaveCount(0);
  await expect(chrome.getByRole("textbox", { name: "Search, enter a URL, or ask a question" })).toBeVisible();
});

test("the component gallery shows Berry in every mood", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("gallery"));

  for (const mood of ["at rest", "fetching", "something went wrong", "asleep"]) {
    await expect(chrome.getByRole("img", { name: `Berry, ${mood}` }).first()).toBeVisible();
  }
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toBeVisible();
});
