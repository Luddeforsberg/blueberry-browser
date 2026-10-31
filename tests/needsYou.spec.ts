// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const startSite = async () => {
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(readFileSync(join(__dirname, "../evals/fixtures/login.html")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

test("an approval answered from Needs you lets the job carry on", async () => {
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Needs you" }).click();
    await expect(chrome.getByText("Nothing needs you right now.")).toBeVisible();

    const address = `${site.origin}/orders?from=inbox`;
    model.callTools({ name: "open_tab", args: { url: address } });
    model.replyWith("All done");
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Open my orders", { seePage: false }));

    const row = chrome.getByRole("listitem", { name: "Berry is asking" });
    await expect(row.getByRole("heading")).toHaveText(`Open ${address} in a new tab`);
    await expect(chrome.getByRole("button", { name: /Needs you.*1 waiting/ })).toBeVisible();
    await row.getByRole("button", { name: "Allow", exact: true }).click();

    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content).toBe("All done");
    await expect(chrome.getByText("Nothing needs you right now.")).toBeVisible();
    expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).some((tab) => tab.url === address)).toBe(true);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("a sign-in goes to the user, nothing typed reaches the model, and I'm done gives the tab back", async () => {
  const SECRET = "correct-horse-battery-staple";
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const address = `${site.origin}/account`;
    model.callTools({ name: "open_tab", args: { url: address } });
    model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Check my orders", { seePage: false }));
    await chrome.getByRole("button", { name: "Needs you" }).click();

    const row = chrome.getByRole("listitem", { name: "Berry is asking" });
    await expect(row.getByRole("heading")).toHaveText("Berry needs you to sign in on 127.0.0.1");
    const asked = model.requests.length;

    // The user goes there, signs in by themselves, and Berry can't reach the tab meanwhile, even from another chat.
    await row.getByRole("button", { name: "Go to the tab" }).click();
    const page = await findView(app, address);
    await page.locator("#email").fill("ada@example.com");
    await page.locator("#password").fill(SECRET);
    await page.locator("#password").press("Enter");
    await expect(page.getByText("Order 4471")).toBeVisible();

    const tab = (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find(({ url }) => url === address)!;
    expect(tab.isActive).toBe(true);
    await expect(chrome.getByText("Berry can’t see this tab")).toBeVisible();
    model.callTools({ name: "read_page", args: { tabId: tab.id } });
    model.replyWith("Tried");
    const other = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "What's on this page?", { seePage: true }));
    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), other!.id))?.messages.at(-1)?.content).toBe("Tried");
    const seenFromOtherChat = JSON.stringify(model.requests.slice(asked));
    expect(seenFromOtherChat).not.toContain("Order 4471");
    expect(seenFromOtherChat).toContain("something private");
    expect(seenFromOtherChat).not.toContain("<page url");
    const before = model.requests.length;

    // "I'm done", from the toolbar on that tab, and Berry reads the page again.
    model.callTools({ name: "read_page", args: {} });
    model.replyWith("Order 4471 arrives on Tuesday");
    await chrome.getByRole("button", { name: "I’m done" }).click();
    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content).toBe("Order 4471 arrives on Tuesday");
    const resumed = JSON.stringify(model.requests.slice(before));
    expect(resumed).toContain("yours again");
    expect(resumed).toContain("Order 4471");
    expect(JSON.stringify(model.requests)).not.toContain(SECRET);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});
