// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

const SHOTS = join(homedir(), "blueberry-audit", "shots-job-tabs");

const startSite = async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Page ${request.url}</title><body style="margin:0"><button style="margin:200px">Press</button>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

test.describe("a job's tabs", () => {
  let model: FakeModel;
  let site: Awaited<ReturnType<typeof startSite>>;
  let app: ElectronApplication;
  let chrome: Page;

  test.beforeEach(async () => {
    model = await startFakeModel();
    site = await startSite();
    app = await launchApp(undefined, { modelEnv: model.env });
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1400, 860));
    chrome = await findView(app, "view=chrome");
  });

  test.afterEach(async () => {
    await app.close();
    model.close();
    site.close();
  });

  // Opens each page in turn, then holds its answer until `finish` is called.
  const startJob = async (paths: string[], reply: string) => {
    paths.forEach((path) => model.callTools({ name: "open_tab", args: { url: `${site.origin}${path}` } }));
    model.replyWith(reply);
    const finish = model.holdBeforeFirstToken();
    const sent = await chrome.evaluate((origin) => window.chromeAPI.chat.send(null, `Find it on ${origin} and add it to my cart`, { seePage: false }), site.origin);
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
    return { chatId: sent!.id, finish };
  };

  const tabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());
  const userTabs = () => chrome.getByRole("list", { name: "Tabs", exact: true });
  const underChat = () => chrome.getByRole("list", { name: "Pages Berry opened" });

  test("show under the chat while it runs, and close when it's done, but for the one the reply points to", async () => {
    const { finish } = await startJob(["/a", "/b", "/c"], "It's in your cart on 127.0.0.1.");
    await expect(underChat().getByRole("button")).toHaveText(["Page /a", "Page /b", "Page /c"]);
    await expect(userTabs().getByText(/^Page \//)).toHaveCount(0);
    await chrome.screenshot({ path: join(SHOTS, "1-while-it-runs.png") });

    finish();
    await expect(chrome.getByRole("button", { name: "Pages it used (3)" })).toBeVisible();
    // The last page it worked in is where the reply sends you, so it's yours now. The others have gone.
    await expect.poll(async () => (await tabs()).filter(({ url }) => url.startsWith(site.origin)).map(({ url, jobChatId }) => [url, jobChatId])).toEqual([[`${site.origin}/c`, null]]);
    await expect(underChat()).toHaveCount(0);
    await expect(userTabs().getByText("Page /c")).toBeVisible();
    // Not in history until the user goes there, and then it is.
    const recent = () => chrome.evaluate(() => window.chromeAPI.browser.getRecent());
    expect((await recent()).map(({ title }) => title)).not.toContain("Page /c");
    const chat = (await tabs()).find(({ page }) => page === "chat")!;
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), (await tabs()).find(({ url }) => url === `${site.origin}/c`)!.id);
    await expect.poll(async () => (await recent()).map(({ title }) => title)).toContain("Page /c");
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), chat.id);

    await chrome.getByRole("button", { name: "Pages it used (3)" }).click();
    const used = chrome.getByRole("list", { name: "Pages it used" }).getByRole("button");
    await expect(used).toHaveText(["/a", "/b", "/c"].map((path) => new RegExp(`^Page ${path}`)));
    await chrome.screenshot({ path: join(SHOTS, "2-pages-it-used.png") });
    await used.first().click();
    await expect.poll(async () => (await tabs()).find(({ isActive }) => isActive)?.url).toBe(`${site.origin}/a`);
    await expect(userTabs().getByText("Page /a")).toBeVisible();
  });

  test("a tab the user took over mid-job stays theirs, and the rest close", async () => {
    const { finish } = await startJob(["/a", "/b"], "All done");
    await expect(underChat().getByRole("button")).toHaveCount(2);
    const chatTab = (await tabs()).find(({ page }) => page === "chat")!;
    const taken = (await tabs()).find(({ url }) => url === `${site.origin}/a`)!;
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), taken.id);
    const page = await findView(app, `${site.origin}/a`);
    await page.mouse.click(300, 300);
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), chatTab.id);
    await expect(underChat().getByRole("button")).toHaveText(["Page /b"]);
    await expect(userTabs().getByText("Page /a")).toBeVisible();

    finish();
    await expect(chrome.getByRole("button", { name: "Pages it used (1)" })).toBeVisible();
    await expect.poll(async () => (await tabs()).filter(({ url }) => url.startsWith(site.origin)).map(({ url }) => url)).toEqual([`${site.origin}/a`]);
    await chrome.screenshot({ path: join(SHOTS, "3-taken-over.png") });
  });
});
