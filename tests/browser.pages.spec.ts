import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setUpBrowserApp,
  relaunch,
  origin,
  app,
  chrome,
  getTabs,
  activeTab,
  openFixture,
  openChat,
  chatInSidebar,
  showChats,
} from "./browserSetup";

setUpBrowserApp();

test("the app starts on the new tab page, and typing an address opens it in that tab", async () => {
  const [first] = await getTabs();
  expect(first).toMatchObject({ page: "new-tab", isActive: true });
  await expect(chrome.getByRole("heading", { name: "Where to?" })).toBeVisible();

  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill(`${origin}/typed`);
  await input.press("Enter");

  await expect.poll(async () => (await activeTab()).url).toBe(`${origin}/typed`);
  expect((await activeTab()).id).toBe(first.id);
  expect((await activeTab()).page).toBeNull();
});

test("asking Berry from the new tab page opens a chat that the sidebar lists", async () => {
  const input = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
  await input.fill("Plan a trip to Porto");
  await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  expect((await getTabs()).some((tab) => tab.page === "new-tab")).toBe(false);
  await expect(chrome.getByText("Plan a trip to Porto").first()).toBeVisible();
  await expect(chrome.getByText("A reply from the model")).toBeVisible();

  // An open chat is a tab like any page, and the current one, under Tabs.
  const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
  const tab = sidebar.getByRole("list", { name: "Tabs", exact: true }).getByRole("button", { name: "Plan a trip to Porto", exact: true });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(sidebar.locator("[aria-current=page]")).toHaveCount(1);

  // On Chats it's under Earlier, and highlighted there too while it's open.
  await showChats();
  await expect(chatInSidebar("Plan a trip to Porto")).toHaveAttribute("aria-current", "page");

  // Closing its tab keeps the chat. Another tab is open, since closing the last one closes the window.
  await chrome.getByRole("tab", { name: "Tabs" }).click();
  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await tab.hover();
  await chrome.getByRole("button", { name: "Close Plan a trip to Porto" }).click();
  await expect.poll(async () => (await getTabs()).some((tab) => tab.page === "chat")).toBe(false);
  await showChats();
  await expect(chatInSidebar("Plan a trip to Porto")).toBeVisible();
  await expect(chatInSidebar("Plan a trip to Porto")).not.toHaveAttribute("aria-current", "page");
});

test("the sidebar opens Routines and Settings as tabs, once each", async () => {
  // Both from the menu beside the dock. Chats has no Routines group with nothing scheduled, so no arrow to them either.
  const fromMenu = async (name: RegExp) => {
    await chrome.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: "Settings and more" }).click();
    await chrome.getByRole("dialog", { name: "Account" }).getByRole("button", { name }).click();
  };
  await showChats();
  await expect(chrome.getByRole("button", { name: "Open Routines" })).toHaveCount(0);
  await fromMenu(/^Routines/);
  await expect(chrome.getByRole("heading", { name: "Routines", level: 1 })).toBeVisible();

  await fromMenu(/^Settings/);
  await fromMenu(/^Routines/);

  const pages = (await getTabs()).map((tab) => tab.page).filter(Boolean);
  expect(pages.filter((page) => page === "routines")).toHaveLength(1);
  expect(pages.filter((page) => page === "settings")).toHaveLength(1);
  expect((await activeTab()).page).toBe("routines");
});

test("settings are saved and come back after a restart", async () => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-settings-"));
  await app.close();
  await relaunch(profile);

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
  await chrome.getByRole("radio", { name: "On top" }).click();
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);

  await app.close();
  await relaunch(profile);

  await expect.poll(() => chrome.evaluate(() => window.chromeAPI.settings.getSettings().then((s) => s.layoutMode))).toBe("horizontal");
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

test("the new tab composer sends only when there is text, and asks Berry unless it's an address", async () => {
  const send = chrome.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();

  await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" }).fill("Plan a trip to Porto");
  await send.click();

  await expect.poll(async () => (await activeTab()).page).toBe("chat");
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
});

test("the new tab page has no chat panel, and it comes back on the next page", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });

  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await expect(panel).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: /^(Show|Hide) Berry$/ })).toHaveCount(0);

  await chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  expect((await chrome.evaluate(() => window.chromeAPI.layout.getLayout())).chatOpen).toBe(false);

  const { id } = await activeTab();
  await chrome.evaluate(([tabId, url]) => window.chromeAPI.browser.navigateTab(tabId, url), [id, `${origin}/next`]);
  await expect(panel).toBeVisible();
});
