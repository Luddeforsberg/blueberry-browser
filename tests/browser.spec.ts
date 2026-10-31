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
import { startFakeModel, type FakeModel } from "./fakeModel";

declare global {
  interface Window {
    slideRuns: number;
  }
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwAEAgH/1oN2SgAAAABJRU5ErkJggg==",
  "base64"
);

let server: Server;
let origin: string;
let model: FakeModel;
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
    if (request.url === "/risks") {
      response.end(`<!doctype html><meta charset="utf-8"><title>Risks</title><body>
        <a href="/next" onclick="event.preventDefault(); window.clicked = 'Next page'">Next page</a>
        <button onclick="window.clicked = 'Load more'">Load more</button>
        <form onsubmit="event.preventDefault(); window.clicked = 'Find'"><input type="search" aria-label="Search"><button>Find</button></form>
        <button onclick="window.clicked = 'Delete'">Delete account</button>
        <button onclick="window.clicked = 'Ta bort'">Ta bort inlägg</button>
        <button onclick="window.clicked = 'Icon'" aria-label=""><svg width="16" height="16"></svg></button>
        <form method="post" onsubmit="event.preventDefault(); window.clicked = 'Go'"><input aria-label="Title"><button>Go</button></form>
      </body>`);
      return;
    }
    if (request.url === "/form") {
      response.end(`<!doctype html><title>Form</title><body>
        <button onclick="document.title = 'Saved'">Save</button>
        <form onsubmit="event.preventDefault(); document.title = 'Sent ' + this.elements.note.value">
          <label>Note <input name="note" value="old"></label>
          <input type="password" name="secret" aria-label="Secret" value="hunter2">
          <button formaction="/draft">Draft</button>
        </form>
        <a href="/one">Continue</a></body>`);
      return;
    }
    response.end(
      '<!doctype html><title>Fixture</title><link rel="icon" href="/icon.png"><body>hello from the page</body>'
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  model = await startFakeModel();
});

test.afterAll(() => {
  server.close();
  model.close();
});

test.beforeEach(async () => {
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  chrome = await findView(app, "view=chrome");
});

test.afterEach(async () => {
  // No app if the launch failed, and this error would hide that one.
  await app?.close();
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

const tabOrder = async () => (await getTabs()).map((tab) => tab.page ?? tab.url.replace(origin, ""));

const openChat = async () => {
  await chrome.getByRole("button", { name: "Show Berry" }).click();
  await expect(chrome.getByRole("complementary", { name: "Berry" })).toBeVisible();
};

const askBeforeActing = (actionApproval: "risky" | "always" | "never") =>
  chrome.evaluate((value) => window.chromeAPI.settings.updateSettings({ actionApproval: value }), actionApproval);

const askInPanel = async (text: string) => {
  const message = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await message.fill(text);
  await message.press("Enter");
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
  model.replyWith("# Heading\n\n", "- item");
  await openFixture();
  await openChat();
  await askInPanel("Show me a list");

  const list = chrome.locator(".prose ul");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("list-style-type", "disc");
});

test("a reply streams as it arrives, and Stop keeps what was written", async () => {
  model.replyWith("first words ", "never sent");
  const release = model.holdAfterFirstToken();
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("hello");

  await expect(panel.getByText("first words")).toBeVisible();
  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(panel.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(panel.getByText("first words")).toBeVisible();
  release();
  await expect(panel.getByText("never sent")).toHaveCount(0);

  // The stopped reply is part of the conversation the model sees next.
  model.replyWith("second reply");
  await askInPanel("and again");
  await expect(panel.getByText("second reply")).toBeVisible();
  const roles = model.requests.at(-1)?.messages.map((message) => message.role);
  expect(roles).toEqual(["system", "user", "assistant", "user"]);
});

test("the panel shares the page with the model, and the main chat doesn't", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("What's here?");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  const shared = JSON.stringify(model.requests.at(-1)?.messages);
  expect(shared).toContain("hello from the page");
  expect(shared).toContain("data:image/png");

  await panel.getByRole("group", { name: "Berry can see 127.0.0.1" }).hover();
  await panel.getByRole("button", { name: "Remove this page" }).click();
  await askInPanel("And now?");
  await expect(panel.getByText("A reply from the model")).toHaveCount(2);
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain("hello from the page");

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  // The panel stays open, so wait for the main chat's composer before picking it.
  await expect(chrome.getByRole("textbox", { name: "Message" })).toHaveCount(2);
  const message = chrome.getByRole("textbox", { name: "Message" }).first();
  await message.fill("Something else");
  await message.press("Enter");
  await expect.poll(() => model.requests.length).toBe(3);
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain("hello from the page");
});

test("Berry reads a page with a tool and shows the step, and only where it can see a page", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const site = new URL(origin).hostname;

  model.callTools({ name: "find_in_page", args: { query: "HELLO" } });
  await askInPanel("Does it say hello?");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(panel.getByRole("list", { name: "Steps" }).getByText(`Searched ${site}`)).toBeVisible();

  const [offered, answered] = model.requests;
  expect(offered.tools?.map((tool) => tool.function.name)).toContain("find_in_page");
  const toolMessage = answered.messages.at(-1);
  expect(toolMessage?.role).toBe("tool");
  expect(toolMessage?.content).toContain("1 matches");
  expect(toolMessage?.content).toContain("hello from the page");
  await expect(panel.getByText("matches on")).toHaveCount(0);

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  await expect(chrome.getByRole("textbox", { name: "Message" })).toHaveCount(2);
  const message = chrome.getByRole("textbox", { name: "Message" }).first();
  await message.fill("Something else");
  await message.press("Enter");
  await expect.poll(() => model.requests.length).toBe(3);
});

test("a chat with no page opens tabs behind itself, and reaches only those", async () => {
  await askBeforeActing("always");
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  const message = chrome.getByRole("textbox", { name: "Message" });
  const card = chrome.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_tabs", args: {} });
  model.callTools({ name: "open_tab", args: { url: `${origin}/form` } });
  model.callTools({ name: "read_page", args: {} });
  await message.fill("Look at the form");
  await message.press("Enter");

  await expect(card.getByText(`Open ${origin}/form in a new tab`)).toBeVisible();
  const reachable = JSON.stringify(model.requests.at(-1)?.messages.at(-1));
  expect(reachable).not.toContain(origin);
  await card.getByRole("button", { name: "Allow" }).click();

  await expect(chrome.getByText("A reply from the model")).toBeVisible();
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Save");
  expect((await activeTab()).page).toBe("chat");
  expect((await getTabs()).map((tab) => tab.url)).toContain(`${origin}/form`);
});

test("Berry does nothing if a link changes while the user decides", async () => {
  await askBeforeActing("always");
  const page = await openFixture("/form");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_elements", args: { query: "Continue" } });
  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Continue");
  await expect(card.getByText(`Click the link “Continue” on ${origin}/form, which goes to ${origin}/one`)).toBeVisible();

  await page.evaluate(() => document.querySelector("a")!.setAttribute("href", "/delete"));
  await card.getByRole("button", { name: "Allow" }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();

  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("the page changed");
  expect(page.url()).toBe(`${origin}/form`);

  model.callTools({ name: "list_elements", args: { query: "Draft" } });
  model.callTools({ name: "click", args: { ref: "e2" } });
  await askInPanel("Save a draft");
  await expect(card.getByText(`Click the button “Draft” on ${origin}/form, which goes to ${origin}/draft`)).toBeVisible();
});

test("Berry only acts on a page once allowed, and shows what will happen", async () => {
  await askBeforeActing("always");
  const page = await openFixture("/form");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_elements", args: {} });
  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Save it");
  await expect(card.getByText(`Click the button “Save” on ${origin}/form`)).toBeVisible();
  expect(await page.title()).toBe("Form");
  const listed = String(model.requests.at(-1)?.messages.at(-1)?.content);
  expect(listed).toContain('"name":"Save"');
  expect(listed).not.toContain("hunter2");

  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await page.title()).toBe("Form");
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("The user said no");

  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Please save it");
  await card.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => page.title()).toBe("Saved");
  await expect(panel.getByText("Clicked something on")).toBeVisible();

  model.callTools({ name: "type_text", args: { ref: "e2", text: "hi there", submit: true } });
  await askInPanel("Write a note");
  await expect(card.getByText(`Type “hi there” into the field “Note” and submit it on ${origin}/form, which goes to ${origin}/form`)).toBeVisible();
  await card.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => page.title()).toBe("Sent hi there");
  await expect(card).toHaveCount(0);
});

test("by default Berry acts without asking unless it's risky, and Settings can turn asking off", async () => {
  const page = await openFixture("/risks");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });
  const clicked = () => page.evaluate(() => (window as unknown as { clicked?: string }).clicked);
  const act = async (name: string, args: object) => {
    model.callTools({ name, args });
    await askInPanel(`Do ${JSON.stringify(args)}`);
  };

  model.callTools({ name: "list_elements", args: {} });
  await askInPanel("What's here?");
  await expect(panel.getByRole("button", { name: "Stop" })).toHaveCount(0);
  const replies = () => panel.getByText("A reply from the model");
  await expect(replies()).toHaveCount(1);
  const listed = JSON.parse(String(model.requests.at(-1)?.messages.at(-1)?.content).trim()) as {
    elements: Array<{ ref: string; name: string; role: string }>;
  };
  const ref = (name: string) => listed.elements.find((element) => element.name === name)!.ref;
  const unnamed = listed.elements.find((element) => element.name === "")!.ref;

  let done = 1;
  for (const [name, expected] of [["Next page", "Next page"], ["Load more", "Load more"], ["Find", "Find"]]) {
    await act("click", { ref: ref(name) });
    await expect(replies()).toHaveCount(++done);
    expect(await clicked()).toBe(expected);
    await expect(card).toHaveCount(0);
  }
  await act("type_text", { ref: ref("Search"), text: "berries" });
  await expect(replies()).toHaveCount(++done);
  await expect(card).toHaveCount(0);

  for (const [element, expected] of [[ref("Delete account"), "Delete account"], [ref("Ta bort inlägg"), "Ta bort inlägg"], [unnamed, "”"], [ref("Go"), "Go"]]) {
    await act("click", { ref: element });
    await expect(card.getByText(expected, { exact: false })).toBeVisible();
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(replies()).toHaveCount(++done);
  }
  await act("type_text", { ref: ref("Title"), text: "hello" });
  await expect(card.getByText("Type “hello”", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(replies()).toHaveCount(++done);
  await act("type_text", { ref: ref("Search"), text: "x".repeat(101) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(replies()).toHaveCount(++done);
  await act("open_tab", { url: `${origin}/?secret=abc` });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(replies()).toHaveCount(++done);

  await askBeforeActing("never");
  await act("click", { ref: ref("Delete account") });
  await expect(replies()).toHaveCount(++done);
  await expect(card).toHaveCount(0);
  expect(await clicked()).toBe("Delete");
});

test("a tab Berry is using glows and shimmers until the reply ends", async () => {
  const page = await openFixture();
  await openChat();
  const row = chrome.getByRole("region", { name: "Tabs" }).getByRole("listitem").filter({ hasText: "Fixture" });
  const glow = () => page.evaluate(() => getComputedStyle(document.documentElement, "::after").boxShadow);
  expect(await glow()).toBe("none");

  model.callTools({ name: "read_page", args: {} });
  const release = model.holdBeforeFirstToken();
  await askInPanel("Read this");
  await expect.poll(glow).not.toBe("none");
  await expect(row.getByText("Berry is working here")).toBeAttached();
  expect((await getTabs()).find((tab) => tab.url.startsWith(origin))?.berryWorking).toBe(true);
  await chrome.waitForTimeout(600);
  await chrome.screenshot({ path: "/tmp/working-chrome.png" });

  release();
  await expect.poll(glow).toBe("none");
  await expect(row.getByText("Berry is working here")).toHaveCount(0);
});

test("Berry opens an address only once allowed, and never a non-web one", async () => {
  await askBeforeActing("always");
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "open_tab", args: { url: "file:///etc/hosts" } });
  await askInPanel("Open the file");
  await card.getByRole("button", { name: "Allow" }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Only http and https");

  const before = (await getTabs()).length;
  model.callTools({ name: "open_tab", args: { url: `${origin}/form` } });
  await askInPanel("Open the form");
  await expect(card.getByText(`Open ${origin}/form in a new tab`)).toBeVisible();
  expect(await getTabs()).toHaveLength(before);
  await card.getByRole("button", { name: "Allow" }).click();
  await expect.poll(async () => (await getTabs()).length).toBe(before + 1);
  await expect.poll(async () => (await activeTab()).title).toBe("Form");
});

test("chats are still there after a restart", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-chats-"));
  await app.close();
  app = await launchApp(profile, { modelEnv: model.env });
  chrome = await findView(app, "view=chrome");
  const { id } = (await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Remember this", { seePage: false })))!;
  await expect
    .poll(async () => (await chrome.evaluate((chatId) => window.chromeAPI.library.getChat(chatId), id))?.partial)
    .toBeNull();
  await app.close();

  app = await launchApp(profile, { modelEnv: model.env });
  chrome = await findView(app, "view=chrome");
  await chatInSidebar("Remember this").click();
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
});

test("a missing API key says what to do", async () => {
  await app.close();
  app = await launchApp();
  chrome = await findView(app, "view=chrome");
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill("Plan a trip");
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect(chrome.getByRole("alert")).toContainText("OPENAI_API_KEY");
});

// A row's name starts with the chat's title, and a chat that isn't open adds its age.
const chatInSidebar = (title: string) =>
  chrome.getByRole("region", { name: "Chats" }).getByRole("button", { name: new RegExp(`^${title}`) });

const startChat = async (text: string) => {
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill(text);
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
};

// Native menus can't be driven, so popup keeps the menu to click its items by label.
const captureMenus = () =>
  app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () {
      Menu.setApplicationMenu(this);
    };
    Menu.setApplicationMenu(null);
  });

const menuLabels = () =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label));

const clickMenuItem = (label: string) =>
  app.evaluate(({ Menu, BaseWindow, webContents }, label) => {
    const item = Menu.getApplicationMenu()?.items.find((candidate) => candidate.label === label);
    item?.click(undefined, BaseWindow.getAllWindows()[0], webContents.getAllWebContents()[0]);
  }, label);

test("a chat is named once it has a topic, and keeps its first message until then", async () => {
  await startChat("hey");
  await expect.poll(() => model.titleRequests.length).toBe(1);
  await expect(chatInSidebar("hey")).toBeVisible();

  model.titleWith("Weekend in Porto");
  const message = chrome.getByRole("textbox", { name: "Message" });
  await message.fill("Help me plan a weekend in Porto");
  await message.press("Enter");

  await expect(chatInSidebar("Weekend in Porto")).toBeVisible();
  await expect.poll(async () => (await activeTab()).title).toBe("Weekend in Porto");
  expect(JSON.stringify(model.titleRequests.at(-1)?.messages)).toContain("plan a weekend in Porto");

  // Named for good, so later replies don't pay for another title.
  await message.fill("And the food?");
  await message.press("Enter");
  await expect.poll(() => model.requests.length).toBe(3);
  await expect(chrome.getByText("A reply from the model")).toHaveCount(3);
  expect(model.titleRequests).toHaveLength(2);
});

for (const change of ["renamed", "generated"] as const) {
  test(`reopening a closed chat uses its ${change} title`, async () => {
    await startChat("Original title");
    const tab = await activeTab();
    const [chat] = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats;
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), tab.id);

    const title = "Weekend in Porto";
    if (change === "renamed") {
      await chrome.evaluate(({ id, title }) => window.chromeAPI.chat.rename(id, title), { id: chat.id, title });
    } else {
      model.titleWith(title);
      await chrome.evaluate((id) => window.chromeAPI.chat.send(id, "Plan a weekend in Porto", { seePage: false }), chat.id);
    }
    await expect(chatInSidebar(title)).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const items = Menu.getApplicationMenu()!.items.flatMap((item) => item.submenu?.items ?? []);
      const item = items.find((item) => item.label === "Reopen Closed Tab");
      if (!item) throw new Error("Missing Reopen Closed Tab menu item");
      item.click();
    });
    await expect.poll(async () => (await activeTab()).title).toBe(title);
    await expect.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getTitle())).toBe(title);
  });
}

test("a chat can be renamed from its menu, and is never renamed for you after that", async () => {
  await startChat("hey");
  await expect.poll(() => model.titleRequests.length).toBe(1);
  await captureMenus();

  const options = chrome.getByRole("button", { name: "More options for hey" });
  await expect(options).toHaveCSS("opacity", "0");
  await chatInSidebar("hey").hover();
  await expect(options).toHaveCSS("opacity", "1");
  await options.click();
  await expect.poll(menuLabels).toEqual(["Rename", "Delete…"]);
  await clickMenuItem("Rename");

  const name = chrome.getByRole("textbox", { name: "Chat name" });
  await expect(name).toBeFocused();
  await name.press("Escape");
  await expect(chatInSidebar("hey")).toBeVisible();

  await options.click();
  await clickMenuItem("Rename");
  await name.fill("My own name");
  await name.press("Enter");
  await expect(chatInSidebar("My own name")).toBeVisible();
  await expect.poll(async () => (await activeTab()).title).toBe("My own name");

  model.titleWith("A generated name");
  const message = chrome.getByRole("textbox", { name: "Message" });
  await message.fill("Help me plan a weekend in Porto");
  await message.press("Enter");
  await expect(chrome.getByText("A reply from the model")).toHaveCount(2);
  await expect(chatInSidebar("My own name")).toBeVisible();
  expect(model.titleRequests).toHaveLength(1);
});

test("deleting a chat asks first, then removes it and its tab", async () => {
  await startChat("Delete me");
  await captureMenus();
  await app.evaluate(({ dialog }) => {
    const answers = [1, 0];
    dialog.showMessageBox = (async () => ({ response: answers.shift(), checkboxChecked: false })) as never;
  });
  const options = chrome.getByRole("button", { name: "More options for Delete me" });

  await chatInSidebar("Delete me").hover();
  await options.click();
  await clickMenuItem("Delete…");
  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  await expect(chatInSidebar("Delete me")).toBeVisible();

  await chatInSidebar("Delete me").hover();
  await options.click();
  await clickMenuItem("Delete…");
  await expect(chatInSidebar("Delete me")).toHaveCount(0);

  // It was the only tab, and the window stays open on a new one.
  await expect.poll(async () => (await getTabs()).map((tab) => tab.page)).toEqual(["new-tab"]);
  expect(await chrome.evaluate(() => window.chromeAPI.library.getLibrary().then(({ chats }) => chats.length))).toBe(0);
});

test("deleting the panel's chat starts it fresh", async () => {
  await setContentSize(1200, 700);
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("Delete me");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
  await captureMenus();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  });

  await chatInSidebar("Delete me").hover();
  await chrome.getByRole("button", { name: "More options for Delete me" }).click();
  await clickMenuItem("Delete…");
  await expect(panel.getByText("A reply from the model")).toHaveCount(0);

  await askInPanel("A new start");
  await expect(chatInSidebar("A new start")).toBeVisible();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  expect(model.requests.at(-1)?.messages.map((message) => message.role)).toEqual(["system", "user"]);
});

test("the thinking state shimmers", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("gallery"));
  await expect(chrome.getByRole("status").getByText("Thinking")).toHaveCSS("animation-name", "shimmer");
});

test("a reply takes over from Thinking in place, and isn't redrawn when it ends", async () => {
  const fadesDone = () =>
    chrome.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => (animation as CSSAnimation).animationName === "fade-in")
          .map((animation) => animation.finished)
      ).then(() => undefined)
    );
  model.replyWith("first words ", "and the rest");
  const releaseStart = model.holdBeforeFirstToken();
  const releaseRest = model.holdAfterFirstToken();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  const message = chrome.getByRole("textbox", { name: "Message" }).last();
  await message.fill("hello");
  await message.press("Enter");

  const berry = chrome.getByRole("img", { name: "Berry, thinking" });
  await expect(chrome.getByRole("status").getByText("Thinking")).toBeVisible();
  await fadesDone();
  const thinking = await berry.boundingBox();

  releaseStart();
  const words = chrome.getByText("first words");
  await expect(words).toBeVisible();
  await expect(chrome.getByRole("status")).toHaveCount(0);
  await fadesDone();
  expect(await berry.boundingBox()).toEqual(thinking);
  const reply = await words.elementHandle();

  releaseRest();
  await expect(chrome.getByRole("button", { name: "Send" }).last()).toBeVisible();
  await expect(words).toHaveText("first words and the rest");
  expect(await reply?.evaluate((element) => element.isConnected)).toBe(true);
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

  // The chrome view, the overlay view for the floating sidebar, and the find bar.
  expect(sandboxed).toEqual([true, true, true]);
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
  await expect.poll(size).toEqual([width - 280 - 8, height - 56]);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  await expect.poll(size).toEqual([width - 280 - 400, height - 56]);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  await expect.poll(size).toEqual([width - 8 - 400, height - 56]);

  // A tab opened now gets the same space as the others.
  const second = await openFixture("/second");
  await expect
    .poll(() => second.evaluate(() => window.innerWidth))
    .toBe(width - 8 - 400);
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
    .toEqual([width - 16, height - 40 - 76 - 8]);
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
  await expect(chrome.getByText("A reply from the model")).toBeVisible();

  await expect(chatInSidebar("Plan a trip to Porto")).toHaveAttribute("aria-current", "page");
});

test("the sidebar opens Routines and Settings as tabs, once each", async () => {
  const places = chrome.getByRole("list", { name: "Places" });

  await places.getByRole("button", { name: "Routines" }).click();
  await expect(chrome.getByRole("heading", { name: "Routines", level: 1 })).toBeVisible();

  await chrome.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: /^Settings/ }).click();
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
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
});

test("the main chat and the chat panel share one composer", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("chat"));
  const main = chrome.getByRole("textbox", { name: "Message" });
  await expect(main).toBeVisible();
  const mainClass = await main.getAttribute("class");

  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await expect(panel).toBeVisible();
  expect(await panel.getAttribute("class")).toBe(mainClass);
});

test("the new tab page has no chat panel, and it comes back on the next page", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });

  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await expect(panel).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: /(Show|Hide) Berry/ })).toHaveCount(0);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  expect((await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).chatOpen).toBe(false);

  const { id } = await activeTab();
  await chrome.evaluate(([tabId, url]) => window.chromeAPI.browser.navigateTab(tabId, url), [id, `${origin}/next`]);
  await expect(panel).toBeVisible();
});

test("settings and the account sit at the bottom of the sidebar", async () => {
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  const row = sidebar.getByRole("button", { name: "Settings, Sam Rivera" });

  await expect(sidebar.getByText("sam@example.com")).toBeVisible();
  const [rowBox, sidebarBox] = await Promise.all([row.boundingBox(), sidebar.boundingBox()]);
  expect(rowBox!.y + rowBox!.height).toBeGreaterThan(sidebarBox!.y + sidebarBox!.height - 16);

  await row.click();
  expect((await activeTab()).page).toBe("settings");
  await expect(row).toHaveAttribute("aria-current", "page");
});

test("dragging a tab reorders it in both layouts, and a short press only selects it", async () => {
  const pointerEvents = await chrome.evaluateHandle(() => {
    const events: Array<{ type: string; pointerId: number; buttons: number; x: number; y: number; trusted: boolean }> = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const) {
      window.addEventListener(type, (event) => events.push({
        type: event.type,
        pointerId: event.pointerId,
        buttons: event.buttons,
        x: event.clientX,
        y: event.clientY,
        trusted: event.isTrusted,
      }), true);
    }
    return events;
  });
  await openFixture("/a");
  await openFixture("/b");
  expect(await tabOrder()).toEqual(["new-tab", "/a", "/b"]);

  const tabs = chrome.getByRole("region", { name: "Tabs" }).getByRole("listitem");
  const drag = async (fromIndex: number, toIndex: number, axis: "x" | "y") => {
    const from = (await tabs.nth(fromIndex).boundingBox())!;
    const to = (await tabs.nth(toIndex).boundingBox())!;
    await chrome.mouse.move(from.x + 20, from.y + from.height / 2);
    await chrome.mouse.down();
    const x = axis === "x" ? to.x + 20 : from.x + 20;
    const y = axis === "y" ? to.y + to.height / 2 : from.y + from.height / 2;
    await chrome.mouse.move(x, y, { steps: 8 });
    await chrome.mouse.up();
  };

  // A press with no movement selects and keeps the order.
  await tabs.nth(0).getByRole("button", { name: "New tab", exact: true }).click();
  await expect.poll(async () => (await activeTab()).page).toBe("new-tab");
  expect(await tabOrder(), `Stationary-click pointer events: ${JSON.stringify(await pointerEvents.jsonValue())}`).toEqual(["new-tab", "/a", "/b"]);

  // Windows can report the real cursor mid-press, far away and with no button down. That isn't a drag.
  const pressed = (await tabs.nth(0).boundingBox())!;
  await chrome.mouse.move(pressed.x + 20, pressed.y + pressed.height / 2);
  await chrome.mouse.down();
  await chrome.evaluate(() =>
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 512, clientY: 384, buttons: 0 }))
  );
  await chrome.mouse.up();
  // Long enough for a drop to settle, if this had been taken for one.
  await chrome.waitForTimeout(500);
  expect(await tabOrder()).toEqual(["new-tab", "/a", "/b"]);

  await drag(0, 2, "y");
  await expect.poll(tabOrder).toEqual(["/a", "/b", "new-tab"]);
  expect((await activeTab()).page).toBe("new-tab");

  await drag(2, 0, "y");
  await expect.poll(tabOrder).toEqual(["new-tab", "/a", "/b"]);

  // Past the end of the list, the tab stops at the last slot.
  const first = (await tabs.nth(0).boundingBox())!;
  const last = (await tabs.nth(2).boundingBox())!;
  await chrome.mouse.move(first.x + 20, first.y + first.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(first.x + 20, last.y + 400, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/a", "/b", "new-tab"]);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
  const strip = chrome.getByRole("list", { name: "Tabs" }).getByRole("listitem");
  // This press lands on the favicon, which must not start the browser's own image drag.
  const a = (await strip.nth(0).boundingBox())!;
  const c = (await strip.nth(2).boundingBox())!;
  await chrome.mouse.move(a.x + 20, a.y + a.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(c.x + 20, a.y + a.height / 2, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/b", "new-tab", "/a"]);
});

test("Alt and an arrow move the focused tab, and stop at the ends", async () => {
  await openFixture("/a");
  const tab = chrome.getByRole("button", { name: "Fixture", exact: true });

  await tab.focus();
  await chrome.keyboard.press("Alt+ArrowUp");
  await expect.poll(tabOrder).toEqual(["/a", "new-tab"]);
  await expect(tab).toBeFocused();

  await chrome.keyboard.press("Alt+ArrowUp");
  await expect.poll(tabOrder).toEqual(["/a", "new-tab"]);

  await chrome.keyboard.press("Alt+ArrowDown");
  await expect.poll(tabOrder).toEqual(["new-tab", "/a"]);
  await expect(tab).toBeFocused();
});

// How long the overlay waits for its slide out, from OverlayApp.tsx.
const SLIDE_OUT_MS = 240;

test("the floating sidebar slides in, and slides out before hiding", async () => {
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
  const overlay = await findView(app, "view=overlay");
  const slideRuns = () => overlay.evaluate(() => window.slideRuns);
  const cardLeft = () =>
    overlay.evaluate(() => document.querySelector("[data-slide]")!.getBoundingClientRect().left);
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

test("Berry sits on the new tab composer, then on the active tab", async () => {
  const seatGap = (selector: string) =>
    chrome.evaluate((selector) => {
      const berry = document.querySelector("[data-berry-companion]")!.getBoundingClientRect();
      const perch = document.querySelector(selector)!.getBoundingClientRect();
      const seat = berry.top + berry.height * (46 / 64);
      return { y: Math.abs(seat - perch.top), inside: berry.left >= perch.left && berry.right <= perch.right };
    }, selector);
  const sitting = chrome.locator("[data-berry-companion]").getByRole("img", { name: "Berry, sitting" });

  await expect(sitting).toBeVisible();
  await expect.poll(async () => (await seatGap("[data-berry-home]")).y).toBeLessThan(2);
  expect((await seatGap("[data-berry-home]")).inside).toBe(true);

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await expect(sitting).toBeVisible();
  await expect.poll(async () => (await seatGap("[data-berry-tab]:has([aria-current=page])")).y).toBeLessThan(2);
  await expect.poll(async () => (await seatGap("[data-berry-tab]:has([aria-current=page])")).inside).toBe(true);
  await expect(sitting).toBeVisible();
});

test("the new tab page paints the art blueberry, and web pages don't carry it", async () => {
  const painted = () =>
    chrome.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-berry-art]")!;
      const { data } = canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
      return data[3];
    });
  await expect(chrome.locator("[data-berry-art]")).toHaveCount(1);
  await expect.poll(painted).toBe(255);

  await openFixture();
  await expect(chrome.locator("[data-berry-art]")).toHaveCount(0);
});

test("bookmarks are in the sidebar when vertical and under the address bar when horizontal", async () => {
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  await expect(sidebar.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "GitHub" })).toBeVisible();
  await expect(chrome.getByRole("list", { name: "Bookmarks" })).toHaveCount(1);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await expect(sidebar).toHaveCount(0);
  await expect(chrome.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "GitHub" })).toBeVisible();
});

test("the page's card rings while Berry reads it, and not once the page is taken away", async () => {
  let release = model.holdAfterFirstToken();
  const ring = chrome.locator("[data-berry-reading]");

  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await expect(ring).toHaveCount(0);

  await askInPanel("What's on this page?");
  await expect(ring).toHaveCount(1);
  release();
  await expect(ring).toHaveCount(0);

  await panel.getByRole("group", { name: "Berry can see 127.0.0.1" }).hover();
  await panel.getByRole("button", { name: "Remove this page" }).click();
  release = model.holdAfterFirstToken();
  await askInPanel("And in general?");
  await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(ring).toHaveCount(0);
  release();
});

test("right-clicking Berry opens its menu on the composer and active tab", async () => {
  // Capture the native menu without opening a popup outside Playwright's renderer.
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () { Menu.setApplicationMenu(this); };
  });
  const sitting = chrome.locator("[data-berry-companion]").getByRole("img", { name: "Berry, sitting" });

  for (const page of ["new-tab", "settings"] as const) {
    if (page === "settings") await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
    await expect(sitting).toBeVisible();
    await app.evaluate(({ Menu }) => Menu.setApplicationMenu(null));
    await sitting.click({ button: "right", timeout: 2000 });
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label)))
      .toEqual(["Keep Berry Still", "Hide Berry"]);
  }
});

test("birds walk behind the new tab page unless Berry is kept still", async () => {
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(1);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(0);
  await expect(chrome.locator("#berry-backdrop path").first()).toBeAttached();

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: false }));
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(1);
});

test("reduced motion stops background birds immediately", async () => {
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(1);
  await chrome.emulateMedia({ reducedMotion: "reduce" });
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(0);
  await chrome.emulateMedia({ reducedMotion: "no-preference" });
  await expect(chrome.locator("[data-berry-walkers]")).toHaveCount(1);
});

test("the component gallery shows Berry in every mood", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("gallery"));

  for (const mood of ["at rest", "fetching", "something went wrong", "asleep"]) {
    await expect(chrome.getByRole("img", { name: `Berry, ${mood}` }).first()).toBeVisible();
  }
  await expect(chrome.getByRole("region", { name: "Approval needed" }).last()).toBeVisible();
});
