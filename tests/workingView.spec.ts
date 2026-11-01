// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

const WIDE = { width: 1500, height: 900 };

const startSite = async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Page ${request.url}</title><body style="margin:0"><button style="margin:200px">Press</button>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

const countFrames = (chrome: Page) =>
  chrome.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { framesSeen: seen });
    window.chromeAPI.work.onFrame(({ picture }) => seen.push(picture));
  });

// A job that has opened a tab behind the chat, and is still going until `finish` is called.
const startJob = async (chrome: Page, model: FakeModel, url: string, mascotId?: string) => {
  model.callTools({ name: "open_tab", args: { url } });
  model.replyWith("All done");
  const finish = model.holdBeforeFirstToken();
  const sent = await chrome.evaluate((mascot) => window.chromeAPI.chat.send(null, "Have a look", { seePage: false, mascotId: mascot }), mascotId);
  await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
  await countFrames(chrome);
  return { chatId: sent!.id, finish };
};

const framesSeen = (chrome: Page) => chrome.evaluate(() => (window as unknown as { framesSeen: string[] }).framesSeen.length);

test.describe("the working view", () => {
  let model: FakeModel;
  let site: Awaited<ReturnType<typeof startSite>>;
  let app: ElectronApplication;
  let chrome: Page;

  test.beforeEach(async () => {
    model = await startFakeModel();
    site = await startSite();
    app = await launchApp(undefined, { modelEnv: model.env });
    await app.evaluate(({ BaseWindow }, { width, height }) => BaseWindow.getAllWindows()[0].setSize(width, height), WIDE);
    chrome = await findView(app, "view=chrome");
  });

  test.afterEach(async () => {
    await app.close();
    model.close();
    site.close();
  });

  const view = () => chrome.getByRole("complementary", { name: /working on/ });
  const picture = () => view().locator("img[src^='data:image/jpeg']");

  test("shows the job's tab with the bird in it, saves no picture, and only other views are refused", async () => {
    // A tab of the user's own, which the job isn't using.
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${site.origin}/mine`);
    const { chatId, finish } = await startJob(chrome, model, `${site.origin}/job`);
    await expect(picture()).toBeVisible();
    await expect(view().getByRole("button", { name: /Go to the tab/ })).toHaveCount(1);

    // It counts as watched, so the bird really is in the page behind the chat.
    model.callTools({ name: "list_elements", args: {} });
    await expect
      .poll(() =>
        app.evaluate(({ webContents }, url) => {
          const tab = webContents.getAllWebContents().find((contents) => contents.getURL() === url);
          return tab?.executeJavaScriptInIsolatedWorld(1000, [{ code: "!!globalThis.__berryActor" }], true);
        }, `${site.origin}/job`)
      )
      .toBe(true);

    // Going to the tab to watch isn't taking it over, and the picture comes back.
    await view().getByRole("button", { name: /Go to the tab/ }).click();
    await expect(view()).toHaveCount(0);
    const chatTab = await chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find(({ page }) => page === "chat")!.id);
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), chatTab);
    await expect(picture()).toBeVisible();

    // Only the chrome may ask for this.
    const refused = await app.evaluate(async ({ ipcMain, webContents }) => {
      const handler = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>> })._invokeHandlers.get("work:watch")!;
      const tryFrom = async (urlPart: string) => {
        const sender = webContents.getAllWebContents().find((contents) => contents.getURL().includes(urlPart))!;
        return Promise.resolve()
          .then(() => handler({ sender, senderFrame: sender.mainFrame }, null, 0))
          .then(() => "allowed", (error: Error) => error.message);
      };
      return { overlay: await tryFrom("view=overlay"), page: await tryFrom("/job"), other: await tryFrom("/mine") };
    });
    expect(refused.overlay).toContain("Rejected work:watch");
    expect(refused.page).toContain("Rejected work:watch");
    expect(refused.other).toContain("Rejected work:watch");

    finish();
    await expect(chrome.getByText("All done")).toBeVisible();
    // It settles on the last picture, and nothing about it was kept.
    await expect(view().getByText("Done")).toBeVisible();
    await expect(picture()).toBeVisible();
    const saved = await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), chatId);
    const said = JSON.stringify(saved);
    expect(said).not.toContain("data:image");
    expect(said).not.toContain("base64");
    expect(JSON.stringify(model.requests)).not.toContain("data:image");

    // The next message starts over, with no old picture.
    model.replyWith("Just words");
    await chrome.evaluate((id) => window.chromeAPI.chat.send(id, "Thanks", { seePage: false }), chatId);
    await expect(chrome.getByText("Just words")).toBeVisible();
    await expect(view()).toHaveCount(0);
  });

  test("a tab the user takes over shows no picture, and nothing more is captured", async () => {
    const { finish } = await startJob(chrome, model, `${site.origin}/job`);
    await expect(picture()).toBeVisible();

    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    const jobTab = tabs.find(({ url }) => url === `${site.origin}/job`)!;
    const chatTab = tabs.find(({ page }) => page === "chat")!;
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), jobTab.id);
    const page = await findView(app, `${site.origin}/job`);
    await page.mouse.click(300, 300);
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), chatTab.id);

    await expect(view().getByText("You have this tab")).toBeVisible();
    await expect(picture()).toHaveCount(0);
    const before = await framesSeen(chrome);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await framesSeen(chrome)).toBe(before);
    finish();
  });

  test("a tab handed to the user shows no picture, and nothing more is captured", async () => {
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/job` } });
    model.thinkFor(700);
    model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Sign me in", { seePage: false }));
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
    await countFrames(chrome);
    await expect(view().getByText("You have this tab")).toBeVisible({ timeout: 10_000 });
    await expect(picture()).toHaveCount(0);
    await expect(view().getByText("Waiting for you")).toBeVisible();
    const before = await framesSeen(chrome);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await framesSeen(chrome)).toBe(before);
    await chrome.evaluate((id) => window.chromeAPI.chat.stop(id), sent!.id);
  });

  test("a page off the mascot's sites shows no picture, and nothing more is captured", async () => {
    const saved = await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Stay here.", sites: ["127.0.0.1"], tools: ["visit"] })
    );
    if (!saved.ok) throw new Error("The mascot wasn't saved");
    const { finish } = await startJob(chrome, model, `${site.origin}/job`, saved.id);
    await expect(picture()).toBeVisible();

    // The page sends itself somewhere the mascot may not go, between the job's calls, when no limit is on the tab.
    const page = await findView(app, `${site.origin}/job`);
    const away = site.origin.replace("127.0.0.1", "localhost");
    await page.evaluate((url) => void (location.href = url), `${away}/away`);

    await expect(view().getByText("Scout isn’t allowed on this site")).toBeVisible();
    await expect(picture()).toHaveCount(0);
    const before = await framesSeen(chrome);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await framesSeen(chrome)).toBe(before);
    finish();
  });

  test("turning page access off mid-job takes the picture away, and nothing more is captured", async () => {
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${site.origin}/shared`);
    const page = await findView(app, `${site.origin}/shared`);
    await expect(page).toHaveTitle(/shared/);
    // A job on the page sent with the message, which depends on the "Can see" toggle.
    model.callTools({ name: "read_page", args: {} });
    model.replyWith("All done");
    const finish = model.holdBeforeFirstToken();
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "What does this say?", { seePage: true }));
    await expect.poll(() => chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).some(({ berryWorking }) => berryWorking))).toBe(true);
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
    await countFrames(chrome);
    await expect(picture()).toBeVisible();

    await chrome.evaluate(() => window.chromeAPI.chat.setPageAccess(false));

    await expect(view().getByText("Berry can’t see this page")).toBeVisible();
    await expect(picture()).toHaveCount(0);
    const before = await framesSeen(chrome);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await framesSeen(chrome)).toBe(before);
    finish();
  });

  test("a job with no tab shows nothing, and a narrow window gets words with nothing captured", async () => {
    model.replyWith("Just words");
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Say something", { seePage: false }));
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
    await expect(chrome.getByText("Just words")).toBeVisible();
    await expect(view()).toHaveCount(0);

    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(900, 700));
    const { finish } = await startJob(chrome, model, `${site.origin}/job`);
    await expect(chrome.getByRole("button", { name: /Go to the tab on/ })).toBeVisible();
    await expect(view()).toHaveCount(0);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(await framesSeen(chrome)).toBe(0);
    finish();
  });
});
