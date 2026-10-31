// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

test("Berry keeps a tab the user only looks at, and gives it up when they click or type in it", async () => {
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Ready</title><body style="margin:0"><button onclick="document.title='Pressed'">Press</button><p>Text on the page</p>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const tabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    const goTo = (id: string) => chrome.evaluate((tab) => window.chromeAPI.browser.switchTab(tab), id);
    // Sent from wherever the user is, as the chat goes on behind them.
    const ask = async (chatId: string | null, text: string) => {
      const sent = await chrome.evaluate(([chat, words]) => window.chromeAPI.chat.send(chat, words!, { seePage: false }), [chatId, text]);
      const replies = sent!.messages.filter(({ role }) => role === "user").length;
      await expect
        .poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.filter(({ role }) => role === "assistant").length)
        .toBe(replies);
      return sent!.id;
    };
    const lastResults = () => JSON.stringify(model.requests.at(-1)?.messages.slice(-3));

    model.callTools({ name: "open_tab", args: { url: `${origin}/first` } });
    const chat = await ask(null, "Open it");
    const first = (await tabs()).find(({ url }) => url === `${origin}/first`)!;
    expect(first.isActive).toBe(false);
    const page = await findView(app, `${origin}/first`);

    // The user goes to look. Berry still has the tab, with no tab named, and its own real click doesn't count as theirs.
    await goTo(first.id);
    model.callTools({ name: "list_tabs", args: {} });
    model.callTools({ name: "list_elements", args: {} });
    model.callTools({ name: "click", args: { ref: "e1" } });
    await ask(chat, "Press it");
    await expect(page).toHaveTitle("Pressed");
    model.callTools({ name: "read_page", args: {} });
    await ask(chat, "Read it");
    expect(lastResults()).toContain("Text on the page");
    expect(await tabs()).toHaveLength(2);

    // The user clicks. Now nothing reaches it, named or not, and the model is told why.
    await page.mouse.click(200, 200);
    model.callTools({ name: "read_page", args: {} }, { name: "read_page", args: { tabId: first.id } });
    await ask(chat, "Read it again");
    expect(lastResults()).toContain(`user took over tab ${first.id}`);
    expect(lastResults()).not.toContain("Text on the page");
    const saved = await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), chat);
    expect(saved?.messages.at(-1)?.steps?.map(({ text }) => text)).toEqual(["Left the tab you took over", "Left the tab you took over"]);

    // Typing counts as well, but a keyboard shortcut doesn't.
    model.callTools({ name: "open_tab", args: { url: `${origin}/second` } });
    await ask(chat, "Open another");
    const second = (await tabs()).find(({ url }) => url === `${origin}/second`)!;
    await goTo(second.id);
    const press = (keyCode: string, modifiers: Array<"meta">) =>
      app.evaluate(({ webContents }, { url, keyCode, modifiers }) => {
        webContents.getAllWebContents().find((view) => view.getURL() === url)!.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      }, { url: second.url, keyCode, modifiers });
    await press("l", ["meta"]);
    model.callTools({ name: "read_page", args: {} });
    await ask(chat, "Read the second");
    expect(lastResults()).toContain("Text on the page");
    await press("a", []);
    model.callTools({ name: "read_page", args: {} });
    await ask(chat, "Read the second again");
    expect(lastResults()).toContain(`user took over tab ${second.id}`);
  } finally {
    await app.close();
    model.close();
    server.close();
  }
});
