// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = join(homedir(), "blueberry-audit", "shots-composer");

test("a bird that works in the cloud turns Do this in the cloud on, and it can still be turned off for one message", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: { ...model.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME } });
  try {
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1400, 860));
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Find things.", sites: [], tools: [], worksInCloud: true })
    );
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));

    const more = chrome.getByRole("button", { name: "More options" });
    const item = chrome.getByRole("menuitemcheckbox", { name: "Do this in the cloud" });
    const send = (name: string) => chrome.getByRole("button", { name, exact: true });
    const choose = async (name: string) => {
      await chrome.getByRole("button", { name: /Choose who to ask/ }).click();
      await chrome.getByRole("list", { name: "Your flock" }).getByRole("button", { name }).click();
    };

    // Berry doesn't work in the cloud, so it's off until chosen.
    await chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ }).fill("Find me a cable");
    await expect(send("Send")).toBeVisible();
    await more.click();
    await expect(item).toHaveAttribute("aria-checked", "false");
    await chrome.screenshot({ path: join(SHOTS, "1-menu.png") });
    await chrome.keyboard.press("Escape");
    await expect(item).toHaveCount(0);

    // Scout does, so choosing it turns it on.
    await choose("Scout");
    await expect(send("Send to the cloud")).toBeVisible();
    await chrome.screenshot({ path: join(SHOTS, "2-on-normal-width.png") });

    // Off for this message, and choosing Scout again goes back to its own default.
    await more.click();
    await expect(item).toHaveAttribute("aria-checked", "true");
    await item.click();
    await expect(send("Send")).toBeVisible();
    await choose("Berry");
    await choose("Scout");
    await expect(send("Send to the cloud")).toBeVisible();

    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(720, 760));
    await chrome.waitForTimeout(400);
    await chrome.screenshot({ path: join(SHOTS, "3-on-narrow-width.png") });
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1400, 860));

    // Sent like that, the chat is a cloud chat, with a cloud mark in the list.
    model.replyWith("Found one");
    await send("Send to the cloud").click();
    await expect(chrome.getByText("Found one")).toBeVisible({ timeout: 20_000 });
    const row = chrome.getByRole("button", { name: /Find me a cable/ }).first();
    await expect(row.getByRole("img", { name: "In the cloud" })).toBeVisible();
    await chrome.screenshot({ path: join(SHOTS, "4-cloud-chat.png") });
  } finally {
    await app.close();
    model.close();
  }
});
