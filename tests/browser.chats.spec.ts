import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerAsk, chooseFromMenu, findView, openMenuRows } from "./app";
import {
  setUpBrowserApp,
  relaunch,
  model,
  app,
  chrome,
  getTabs,
  activeTab,
  openFixture,
  openChat,
  askInPanel,
  chatInSidebar,
  showChats,
  setContentSize,
} from "./browserSetup";
import { defined } from "../src/shared/testing";

setUpBrowserApp();

test("chats are still there after a restart", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-chats-"));
  await app.close();
  await relaunch(profile, { modelEnv: model.env });
  const { id } = (await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Remember this", { seePage: false })))!;
  await expect.poll(async () => (await chrome.evaluate((chatId) => window.chromeAPI.library.getChat(chatId), id))?.partial).toBeNull();
  await app.close();

  await relaunch(profile, { modelEnv: model.env });
  await showChats();
  await chatInSidebar("Remember this").click();
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
});

test("a missing API key says what to do", async () => {
  await app.close();
  await relaunch();
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill("Plan a trip");
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect(chrome.getByRole("alert")).toContainText("Berry needs an AI key to answer.");
});

const startChat = async (text: string) => {
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill(text);
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
};

test("a chat is named once it has a topic, and keeps its first message until then", async () => {
  await startChat("hey");
  await expect.poll(() => model.titleRequests.length).toBe(1);
  await showChats();
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

test("a chat that finishes behind another tab is Done until it's opened, and one that finishes in front isn't", async () => {
  const chatsFace = chrome.getByRole("tabpanel", { name: "Chats" });
  const done = chatsFace.getByRole("region", { name: /^Done/ });
  const earlier = chatsFace.getByRole("region", { name: /^Earlier/ });

  await startChat("Plan a weekend");
  await showChats();
  await expect(earlier.getByRole("button", { name: /^Plan a weekend/ })).toBeVisible();
  await expect(done).toHaveCount(0);

  const finish = model.holdBeforeFirstToken();
  const message = chrome.getByRole("textbox", { name: "Message" });
  await message.fill("And the food?");
  await message.press("Enter");
  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await expect.poll(async () => (await activeTab()).page).toBe("new-tab");
  finish();

  await expect(done).toContainText("1 new");
  await done.getByRole("button", { name: /^Plan a weekend.*new/ }).click();
  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  await expect(done).toHaveCount(0);
  await expect(earlier.getByRole("button", { name: /^Plan a weekend/ })).toBeVisible();
});

test("a chat that finishes in the open chat panel isn't Done, and one that finishes with the panel closed is until the panel shows it", async () => {
  const chatsFace = chrome.getByRole("tabpanel", { name: "Chats" });
  const done = chatsFace.getByRole("region", { name: /^Done/ });
  const earlier = chatsFace.getByRole("region", { name: /^Earlier/ });

  await openFixture();
  await openChat();
  const message = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await message.fill("What is this page");
  await message.press("Enter");
  await showChats();
  await expect(earlier.getByRole("button", { name: /^What is this page/ })).toBeVisible();
  await expect(done).toHaveCount(0);

  const finish = model.holdBeforeFirstToken();
  await message.fill("And then?");
  await message.press("Enter");
  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  expect((await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).chatOpen).toBe(false);
  finish();
  await expect(done).toContainText("1 new");

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  await expect(done).toHaveCount(0);
});

for (const change of ["renamed", "generated"] as const) {
  test(`reopening a closed chat uses its ${change} title`, async () => {
    await startChat("Original title");
    const tab = await activeTab();
    const chat = defined((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats[0]);
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), tab.id);

    const title = "Weekend in Porto";
    if (change === "renamed") {
      await chrome.evaluate(({ id, title }) => window.chromeAPI.chat.rename(id, title), { id: chat.id, title });
    } else {
      model.titleWith(title);
      await chrome.evaluate((id) => window.chromeAPI.chat.send(id, "Plan a weekend in Porto", { seePage: false }), chat.id);
    }
    await showChats();
    await expect(chatInSidebar(title)).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const items = Menu.getApplicationMenu()!.items.flatMap((item) => item.submenu?.items ?? []);
      const item = items.find((item) => item.label === "Reopen Closed Tab");
      if (!item) throw new Error("Missing Reopen Closed Tab menu item");
      item.click();
    });
    await expect.poll(async () => (await activeTab()).title).toBe(title);
    await expect
      .poll(() =>
        app.evaluate(({ BaseWindow }) => {
          const [main] = BaseWindow.getAllWindows();
          if (!main) throw new Error("No window");
          return main.getTitle();
        }),
      )
      .toBe(title);
  });
}

test("a chat can be renamed from its menu, and is never renamed for you after that", async () => {
  await startChat("hey");
  await expect.poll(() => model.titleRequests.length).toBe(1);
  await showChats();

  const options = chrome.getByRole("button", { name: "More options for hey" });
  await expect(options).toHaveCSS("opacity", "0");
  await chatInSidebar("hey").hover();
  await expect(options).toHaveCSS("opacity", "1");
  await options.click();
  await expect.poll(() => openMenuRows(app)).toEqual(["Rename", "-", "Delete…"]);
  await chooseFromMenu(app, "Rename");

  const name = chrome.getByRole("textbox", { name: "Chat name" });
  await expect(name).toBeFocused();
  await name.press("Escape");
  await expect(chatInSidebar("hey")).toBeVisible();

  await options.click();
  await chooseFromMenu(app, "Rename");
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

test("our own menus: a chat's asks before it deletes, a page's copies, and Clear history asks too", async () => {
  await startChat("Delete me");
  const options = chrome.getByRole("button", { name: "More options for Delete me" });
  const menu = await findView(app, "view=menu");
  const card = menu.getByRole("alertdialog");

  // Delete… asks first, with the keyboard on Cancel, and Escape keeps the chat.
  await showChats();
  await chatInSidebar("Delete me").hover();
  await options.click();
  await expect.poll(() => openMenuRows(app)).toEqual(["Rename", "-", "Delete…"]);
  await chooseFromMenu(app, "Delete…");
  await expect(card.getByRole("heading")).toHaveText("Delete “Delete me”?");
  await expect(card.getByRole("button", { name: "Cancel" })).toBeFocused();
  await menu.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  await expect(chatInSidebar("Delete me")).toBeVisible();

  // Pressing Delete in the card deletes it.
  await chatInSidebar("Delete me").hover();
  await options.click();
  await chooseFromMenu(app, "Delete…");
  await answerAsk(app, "Delete");
  await expect(chatInSidebar("Delete me")).toHaveCount(0);
  // It was the only tab, and the window stays open on a new one.
  await expect.poll(async () => (await getTabs()).map((tab) => tab.page)).toEqual(["new-tab"]);
  expect(await chrome.evaluate(() => window.chromeAPI.library.getLibrary().then(({ chats }) => chats.length))).toBe(0);

  // Right-clicking a page opens our menu over it, and Copy copies what's selected there. The clipboard is put back after.
  const kept = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    const page = await openFixture();
    await page.locator("body").selectText();
    await page.locator("body").click({ button: "right", position: { x: 10, y: 10 } });
    await expect.poll(() => openMenuRows(app)).toEqual(["Ask Berry About This", "-", "Copy", "-", "Print…", "Inspect"]);
    await chooseFromMenu(app, "Copy");
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("hello from the page");
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), kept);
  }

  // Clear history asks with the same card, and Cancel clears nothing.
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("history"));
  await chrome.getByRole("button", { name: "Clear…" }).click();
  await expect(card.getByRole("heading")).toHaveText("Clear all browsing history?");
  await answerAsk(app, "Cancel");
  await expect(card).toHaveCount(0);
  expect(await chrome.evaluate(() => window.chromeAPI.browser.getRecent())).not.toEqual([]);
});

test("deleting the panel's chat starts it fresh", async () => {
  await setContentSize(1200, 700);
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("Delete me");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toBeVisible();

  await showChats();
  await chatInSidebar("Delete me").hover();
  await chrome.getByRole("button", { name: "More options for Delete me" }).click();
  await chooseFromMenu(app, "Delete…");
  await answerAsk(app, "Delete");
  await expect(panel.getByText("A reply from the model")).toHaveCount(0);

  await askInPanel("A new start");
  await expect(chatInSidebar("A new start")).toBeVisible();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  expect(model.requests.at(-1)?.messages.map((message) => message.role)).toEqual(["system", "user"]);
});
