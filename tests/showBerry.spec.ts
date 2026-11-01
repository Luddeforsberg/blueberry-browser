// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const PASSWORD = "hunter2-do-not-keep";
const CARD = "4111 1111 1111 1111";

const PAGES: Record<string, string> = {
  "/shop": `<!doctype html><title>Shop</title>
    <form action="/search"><input name="searchString" aria-label="Search"></form>
    <button id="fake" onclick="this.textContent='clicked'">Fake me</button>`,
  "/search": `<!doctype html><title>Results</title><a href="/product/1">Cable <span>two metres</span></a>`,
  "/product/1": `<!doctype html><title>Cable</title>
    <button>Add to cart</button>
    <form><input type="password" aria-label="Password"></form>
    <input name="cardnumber" aria-label="Card number">
    <input aria-label="Plain box">
    <select autocomplete="cc-exp-month" aria-label="Expiry month"><option>Month-01</option><option>Month-12</option></select>
    <iframe id="same" src="/pay" width="300" height="80"></iframe>
    <iframe id="other" src="http://localhost:PORT/pay" width="300" height="80"></iframe>`,
  "/pay": `<!doctype html><title>Pay</title><input aria-label="In the frame">`,
};

test("show Berry a job once, see the notes, and it becomes a routine that runs", async () => {
  test.setTimeout(90_000);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    const port = (server.address() as AddressInfo).port;
    response.end((PAGES[new URL(request.url ?? "/", "http://x").pathname] ?? "<!doctype html>").replace("PORT", String(port)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });

  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Show Berry how" }).click();
    const notice = chrome.getByRole("status").filter({ hasText: "Berry’s watching" });
    await expect(notice).toBeVisible();

    // From the new tab page, through the address bar. Nothing on a page can answer this view's channels.
    await chrome.evaluate(async (url) => {
      const { browser } = window.chromeAPI;
      const tabs = await browser.getTabs();
      await browser.navigateTab(tabs[0].id, url);
    }, `${origin}/shop`);
    const page = await findView(app, `${origin}/shop`);
    await page.waitForLoadState();
    await page.waitForTimeout(300);

    // A click the page faked for itself isn't one of the user's.
    await page.evaluate(() => document.getElementById("fake")?.click());
    await page.getByRole("textbox", { name: "Search" }).click();
    await page.keyboard.type("usb-c cable");
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/search\?/);
    await page.waitForTimeout(300);
    // A click that goes to another page still gets noted.
    await page.getByRole("link", { name: /Cable/ }).click();
    await page.waitForURL(/\/product\/1/);
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("textbox", { name: "Password" }).click();
    await page.keyboard.type(PASSWORD);
    await page.getByRole("textbox", { name: "Card number" }).click();
    await page.keyboard.type(CARD);
    await page.getByRole("combobox", { name: "Expiry month" }).focus();
    // Typing to choose, as a click or an arrow key opens the Mac's own menu.
    await page.keyboard.type("Month-12");
    await expect(page.getByRole("combobox", { name: "Expiry month" })).toHaveValue("Month-12");
    await page.getByRole("button", { name: "Add to cart" }).focus();
    // A frame from the same origin is watched like the page, and only once.
    await page.frameLocator("#same").getByRole("textbox", { name: "In the frame" }).click();
    await page.keyboard.type("in the same origin");
    await page.getByRole("textbox", { name: "Plain box" }).click();

    // What goes on in a frame from another origin is its own business, and its use is all that gets noted.
    await page.frameLocator("#other").getByRole("textbox", { name: "In the frame" }).click();
    await page.keyboard.type("said in the frame");

    // Another tab comes into it, and closing that one doesn't stop anything.
    const other = await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url).then(({ id }) => id), `${origin}/search?private=yes`);
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.recording.state())).steps.at(-1)?.text).toBe("Opened 127.0.0.1 in a new tab");
    await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), other);

    // Left in the field when Stop is pressed, and not forgotten.
    await page.getByRole("textbox", { name: "Plain box" }).click();
    await page.keyboard.type("left over");

    await notice.getByRole("button", { name: "Stop" }).click();
    await expect(chrome.getByRole("heading", { name: "What I watched" })).toBeVisible();
    await expect(notice).toHaveCount(0);
    // Nothing's left watching in the page once Stop is pressed.
    const stillThere = await app.evaluate(({ webContents }, url) => {
      const tab = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith(url));
      return tab?.executeJavaScriptInIsolatedWorld(1001, [{ code: "typeof globalThis.__watching" }]);
    }, origin);
    expect(stillThere).toBe("undefined");

    const notes = chrome.locator("ol li");
    await expect(notes.filter({ hasText: "Searched for “usb-c cable”" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Clicked Add to cart" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Typed in the password field" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Typed in the card field" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "left over" })).toHaveCount(1);
    await expect(notes.filter({ hasText: /Clicked Cable/ })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Fake me" })).toHaveCount(0);
    await expect(notes.filter({ hasText: "in the same origin" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Used something in a frame from localhost" })).toHaveCount(1);
    await expect(notes.filter({ hasText: "Went back to the 127.0.0.1 tab" })).toHaveCount(1);

    const state = await chrome.evaluate(() => window.chromeAPI.recording.state());
    const said = JSON.stringify(state);
    expect(said).not.toContain(PASSWORD);
    expect(said).not.toContain(CARD);
    expect(said).not.toContain("Month-12");
    expect(said).not.toContain("said in the frame");
    expect(said).not.toContain("private");

    // Nothing has gone anywhere yet, and what's left out never does.
    expect(model.titleRequests).toHaveLength(0);
    await chrome.getByRole("button", { name: "Leave out: Typed “left over”" }).click();
    await expect(notes.filter({ hasText: "left over" })).toHaveCount(0);

    // The model's words, with a site of its own that goes nowhere.
    model.titleWith(JSON.stringify({
      name: "Buy a cable",
      instructions: `1. Go to ${origin}/shop\n2. Search for usb-c cable`,
      sites: ["evil.example"],
      changes: [{ label: "Search term", value: "usb-c cable" }],
    }));
    await chrome.getByRole("button", { name: "Turn this into a routine" }).click();
    await expect(chrome.getByRole("heading", { name: "New routine" })).toBeVisible();
    const sent = JSON.stringify(model.titleRequests[0].messages);
    expect(sent).toContain("Add to cart");
    expect(sent).not.toContain(PASSWORD);
    expect(sent).not.toContain("left over");
    // A page's name for something goes as data, marked as such.
    expect(sent).toContain("page_label");

    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Buy a cable");
    await expect(chrome.getByRole("textbox", { name: "Sites it may use" })).toHaveValue("127.0.0.1");
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.routines).toHaveLength(0);
    expect((await chrome.evaluate(() => window.chromeAPI.recording.state())).steps).toHaveLength(0);

    // Changing what might change changes the instructions.
    await chrome.getByRole("textbox", { name: "Search term" }).fill("hdmi cable");
    await expect(chrome.getByRole("textbox", { name: "What should it do?" })).toHaveValue(/hdmi cable/);

    // The run goes the normal way, and the tools stop it going off the sites it was shown.
    model.reset();
    model.callTools({ name: "open_tab", args: { url: "https://evil.example/" } });
    model.replyWith("Done, and I stayed where you showed me.");
    await chrome.getByRole("button", { name: "Save and run it now" }).click();
    await expect(chrome.getByRole("heading", { name: "Buy a cable" })).toBeVisible();
    await expect(chrome.getByText("When you ask")).toBeVisible();
    await expect(chrome.getByText("Done, and I stayed where you showed me.").first()).toBeVisible({ timeout: 20_000 });
    await expect(chrome.getByText(/Stayed off evil\.example/).first()).toBeVisible();
    expect(JSON.stringify(model.requests[0].messages)).toContain("hdmi cable");

  } finally {
    await app.close();
    model.close();
    server.close();
  }
});

test("with nothing to go through, there's nothing to send", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Show Berry how" }).click();
    await chrome.getByRole("button", { name: "Stop" }).click();
    await expect(chrome.getByRole("button", { name: "Turn this into a routine" })).toBeDisabled();
    await chrome.getByRole("button", { name: "Close", exact: true }).click();
    await expect(chrome.getByRole("heading", { name: "What I watched" })).toHaveCount(0);
    expect((await chrome.evaluate(() => window.chromeAPI.recording.state())).status).toBe("idle");
  } finally {
    await app.close();
  }
});
