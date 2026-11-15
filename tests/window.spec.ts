// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const startSite = async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Flights</title><p>Flights</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

test("the address field is the status of a job in the tab in front: working, taken over, and waiting with Answer", async () => {
  test.setTimeout(90_000);
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const job = async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => !!tab.jobChatId);
    const field = chrome.getByRole("status").filter({ hasText: /Thinking|Waiting for you/ });

    // A job opens a page and then thinks for a while there.
    model.thinkFor(6000);
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/flights` } });
    model.replyWith("Done.");
    await chrome.evaluate((text) => window.chromeAPI.chat.send(null, text, { seePage: false }), `Look at ${site.origin}/flights`);
    await expect.poll(job, { timeout: 20_000 }).toBeTruthy();
    await chrome.evaluate(async (id) => window.chromeAPI.browser.switchTab(id), (await job())!.id);

    // Going there to watch doesn't take it over: the field says it's working, with Take over and Stop.
    await expect(field).toContainText("Thinking..");
    await expect(field.getByRole("button", { name: "Take over" })).toBeVisible();
    await expect(field.getByRole("button", { name: "Stop Berry" })).toBeVisible();

    // Take over does what clicking in the page does: the job can't reach the tab, and the field is the address again.
    const taken = (await job())!.id;
    await field.getByRole("button", { name: "Take over" }).click();
    await expect(chrome.getByRole("button", { name: "Address" })).toBeVisible();
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.id === taken)?.berryWorking).toBe(false);
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.some((chat) => chat.running), { timeout: 20_000 }).toBe(false);

    // Next, a job that waits to go to an address with data in it: the field says so, and Answer opens its chat.
    model.thinkFor(0);
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/flights` } });
    model.callTools({ name: "go_to", args: { url: `${site.origin}/flights?from=ARN&to=LIS` } });
    model.replyWith("Done.");
    const sent = await chrome.evaluate((text) => window.chromeAPI.chat.send(null, text, { seePage: false }), `Find flights on ${site.origin}/flights`);
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).needsYou.length, { timeout: 20_000 }).toBe(1);
    await chrome.evaluate(async (id) => window.chromeAPI.browser.switchTab(id), (await job())!.id);
    await expect(field).toContainText("Waiting for you");
    await field.getByRole("button", { name: "Answer" }).click();
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.isActive)?.pageParam).toBe(sent!.id);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("choosing a mascot on the new tab changes the pill, the greeting and the limits line, and not the chats begun", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "News.", sites: ["svt.se"], tools: ["visit"] })
    );
    const pill = chrome.getByRole("button", { name: /Choose who to ask/ });
    const limits = chrome.getByText("Only visits svt.se.");
    await expect(pill).toHaveAccessibleName("Asking Berry. Choose who to ask");
    // Berry has no limits, so there's no line.
    await expect(limits).toBeHidden();

    // From the keyboard: the menu opens on the current one, and Escape gives the pill its focus back.
    await pill.focus();
    await chrome.keyboard.press("ArrowDown");
    await expect(chrome.getByRole("menuitemradio", { name: /^Berry/ })).toBeFocused();
    await chrome.keyboard.press("Escape");
    await expect(pill).toBeFocused();

    await pill.click();
    await chrome.getByRole("menuitemradio", { name: /^Scout/ }).click();
    await expect(pill).toHaveAccessibleName("Asking Scout. Choose who to ask");
    await expect(chrome.getByRole("heading", { name: "Where to?" }).getByRole("img", { name: /^Scout/ })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" })).toHaveAttribute("placeholder", "Ask Scout, or type an address");
    await expect(limits).toBeVisible();
    expect((await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).chosenMascotId).not.toBeNull();

    await pill.click();
    await chrome.getByRole("menuitemradio", { name: /^Berry/ }).click();
    await expect(pill).toHaveAccessibleName("Asking Berry. Choose who to ask");
    await expect(limits).toBeHidden();
  } finally {
    await app.close();
  }
});
