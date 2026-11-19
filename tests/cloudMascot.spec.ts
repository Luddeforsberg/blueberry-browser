import { expect, test } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = join(homedir(), "blueberry-audit", "shots-composer");

test("a mascot that works in the cloud starts the box on Cloud, and it can still be switched back for one message", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: { ...model.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME } });
  try {
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1400, 860));
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "Find things.",
        sites: [],
        tools: ["visit"],
        worksInCloud: true,
      }),
    );
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));

    const here = chrome.getByRole("radio", { name: /^This (Mac|PC)$/ });
    const cloud = chrome.getByRole("radio", { name: "Cloud" });
    const send = (name: string) => chrome.getByRole("button", { name, exact: true });
    const choose = async (name: string) => {
      await chrome.getByRole("button", { name: /Choose who to ask/ }).click();
      await chrome.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
    };

    // Berry doesn't work in the cloud, so the box starts on this computer.
    await chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ }).fill("Find me a cable");
    await expect(send("Send")).toBeVisible();
    await expect(here).toHaveAttribute("aria-checked", "true");
    await chrome.screenshot({ path: join(SHOTS, "1-switch.png") });

    // Scout does, so choosing it moves the switch to Cloud.
    await choose("Scout");
    await expect(cloud).toHaveAttribute("aria-checked", "true");
    await expect(send("Send to the cloud")).toBeVisible();
    await chrome.screenshot({ path: join(SHOTS, "2-on-normal-width.png") });

    // Back on this computer for this message, and choosing Scout again goes back to its own default.
    await here.click();
    await expect(here).toHaveAttribute("aria-checked", "true");
    await expect(send("Send")).toBeVisible();
    // Any change of mascot goes back to following it, wherever it was chosen, as the chat panel shares the choice.
    await choose("Berry");
    await expect(send("Send")).toBeVisible();
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
    await chrome.getByRole("tab", { name: /^Chats/ }).click();
    const row = chrome.getByRole("tabpanel", { name: "Chats" }).getByRole("button", { name: /^Find me a cable/ });
    await expect(row.getByRole("img", { name: "In the cloud" })).toBeVisible();
    await chrome.screenshot({ path: join(SHOTS, "4-cloud-chat.png") });
  } finally {
    await app.close();
    model.close();
  }
});
