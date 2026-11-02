// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

// A job in the cloud, with a headless Chrome on this computer standing in for Browserbase.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Set to a folder to keep pictures of the cloud tab and Settings > Cloud.
const SHOTS = process.env.BLUEBERRY_SHOTS;

const SHOP = `<!doctype html><title>Shop</title>
<button id="order">Place order</button><p id="said">Nothing ordered</p>
<script>
  document.getElementById("order").addEventListener("click", (event) => {
    if (event.isTrusted) document.getElementById("said").textContent = "Order placed";
  });
</script>`;

const shoot = async (chrome: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await chrome.screenshot({ path: join(SHOTS, `${name}.png`) });
};

test.skip(process.platform !== "darwin" || !existsSync(CHROME), "Needs Google Chrome");

test("a bird does a job in a cloud tab, asking before it clicks, and the user can take over", async () => {
  test.setTimeout(60_000);
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(SHOP);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const shop = `http://127.0.0.1:${(server.address() as AddressInfo).port}/shop`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: { ...model.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME } });
  try {
    const chrome = await findView(app, "view=chrome");
    model.callTools({ name: "open_tab", args: { url: shop } });
    model.callTools({ name: "list_elements", args: {} });
    model.callTools({ name: "click", args: { ref: "e1" } });
    model.callTools({ name: "read_page", args: {} });
    // Naming the site keeps its cloud tab open once the job is done.
    model.replyWith("Ordered it on 127.0.0.1");
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Order the thing", { seePage: false, cloud: true }));
    expect(sent).not.toBeNull();

    // The same approval as anywhere, in Needs you and on the chat.
    await expect(chrome.getByRole("button", { name: /Needs you.*1 waiting/ })).toBeVisible({ timeout: 20_000 });
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
    const card = chrome.getByRole("region", { name: "Approval needed" });
    await expect(card.locator("p").getByText(`Click the button “Place order” on ${shop}`)).toBeVisible();
    await card.getByRole("button", { name: "Allow" }).click();

    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content, { timeout: 15_000 }).toBe("Ordered it on 127.0.0.1");
    // Real input reached the page in the cloud browser, and nothing opened in this window.
    expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Order placed");
    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    expect(tabs.some((tab) => tab.url === shop)).toBe(false);
    const cloudTab = tabs.find((tab) => tab.page === "cloud");
    expect(cloudTab?.title).toBe("Shop");

    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), cloudTab!.id);
    await expect(chrome.getByText("In the cloud")).toBeVisible();
    await expect(chrome.getByRole("img", { name: "Picture of Shop" })).toBeVisible({ timeout: 10_000 });
    await shoot(chrome, "cloud-tab");
    if (SHOTS) {
      await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light", layoutMode: "horizontal" }));
      await chrome.waitForTimeout(500);
      await shoot(chrome, "cloud-tab-light-horizontal");
      await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "system", layoutMode: "vertical" }));
    }
    await chrome.getByRole("button", { name: "Take over" }).click();
    await expect(chrome.getByText(/Yours now/)).toBeVisible();
    await shoot(chrome, "cloud-tab-taken-over");

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    await expect(chrome.getByText("The local test browser is running, with nothing in it right now.")).toBeVisible();
    await shoot(chrome, "settings-cloud");
    await chrome.getByRole("button", { name: "End cloud session" }).click();
    await expect(chrome.getByText("The local test browser has ended. The next job starts it again.")).toBeVisible();
    expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).some((tab) => tab.page === "cloud")).toBe(false);
  } finally {
    await app.close();
    model.close();
    server.close();
  }
});

test("a cloud job shows in the working view beside its chat, and pressing the picture opens its cloud tab", async () => {
  test.setTimeout(60_000);
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(SHOP);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const shop = `http://127.0.0.1:${(server.address() as AddressInfo).port}/shop`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: { ...model.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME } });
  try {
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1500, 900));
    const chrome = await findView(app, "view=chrome");
    model.callTools({ name: "open_tab", args: { url: shop } });
    model.replyWith("Had a look");
    const finish = model.holdBeforeFirstToken();
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Have a look at the shop", { seePage: false, cloud: true }));
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);

    const view = chrome.getByRole("complementary", { name: /working on/ });
    const goThere = view.getByRole("button", { name: "Go to the tab on 127.0.0.1" });
    await expect(goThere).toBeVisible({ timeout: 20_000 });
    // The local test browser's own pictures, and the bird on the window's edge, as there's none in a cloud page.
    await expect(view.locator("img[src^='data:image/jpeg']")).toBeVisible({ timeout: 10_000 });
    await expect(view.getByRole("status")).toHaveText("Thinking");
    await expect(chrome.getByText(/Opened/).first()).toBeVisible();
    await shoot(chrome, "cloud-working-view");

    await goThere.click();
    const active = await chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive));
    expect(active?.page).toBe("cloud");
    await expect(chrome.getByText("In the cloud")).toBeVisible();
    // Looking isn't taking over.
    await expect(chrome.getByRole("button", { name: "Take over" })).toBeVisible();

    finish();
    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content, { timeout: 15_000 }).toBe("Had a look");
    const saved = JSON.stringify(await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id));
    expect(saved).not.toContain("data:image");
    expect(JSON.stringify(model.requests)).not.toContain("data:image");
  } finally {
    await app.close();
    model.close();
    server.close();
  }
});

test("with no key the cloud is off, and a saved key never comes back to the page", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await expect(chrome.getByRole("button", { name: "More options" })).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    await expect(chrome.getByText("Off. Add a Browserbase key to turn it on.")).toBeVisible();
    await expect(chrome.getByRole("button", { name: "End cloud session" })).toBeDisabled();
    await shoot(chrome, "settings-cloud-no-key");

    await chrome.getByRole("textbox", { name: "API key" }).fill("bb_live_not_a_real_key");
    await chrome.getByRole("textbox", { name: "Project id" }).fill("project-not-real");
    await chrome.getByRole("button", { name: "Save" }).click();
    await expect(chrome.getByText("Browserbase key saved")).toBeVisible();
    const state = JSON.stringify(await chrome.evaluate(() => window.chromeAPI.cloud.state()));
    expect(state).not.toContain("bb_live_not_a_real_key");
    expect(state).not.toContain("project-not-real");
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
    await chrome.getByRole("button", { name: "More options" }).click();
    await expect(chrome.getByRole("menuitemcheckbox", { name: "Do this in the cloud" })).toBeVisible();

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    await chrome.getByRole("button", { name: "Forget key" }).click();
    await expect(chrome.getByText("Off. Add a Browserbase key to turn it on.")).toBeVisible();
  } finally {
    await app.close();
  }
});
