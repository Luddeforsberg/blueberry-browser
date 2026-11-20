// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const KEPT = "You always choose the cheapest one that’s in stock.";

test("a mascot is made in four steps, its limits are changed from its page, and what it remembers is answered there", async () => {
  test.setTimeout(90_000);
  const model = await startFakeModel();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-mascots-page-"));
  let app = await launchApp(profile, { modelEnv: model.env });
  try {
    let chrome = await findView(app, "view=chrome");
    const param = () => chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.page === "flock")?.pageParam);
    const back = () => chrome.getByRole("button", { name: "Back", exact: true }).click();
    const page = () => chrome.getByRole("list", { name: "Your mascots" }).filter({ has: chrome.getByRole("button", { name: /^Chat with/ }) });

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("flock"));
    await expect(page().getByRole("listitem")).toHaveCount(1);
    await expect(page()).toContainText("Does whatever you ask, wherever you let it.");

    // One question at a time, and each step's button stays off until it has an answer.
    await chrome.getByRole("button", { name: "New mascot" }).click();
    await expect.poll(param).toBe("new");
    await expect(chrome.getByText("1 / 4")).toBeVisible();
    await chrome.getByRole("button", { name: "Lingon" }).click();
    await chrome.getByRole("button", { name: "Crown" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByRole("heading", { name: "What’s my name?" })).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Continue" })).toBeDisabled();
    await chrome.getByRole("textbox", { name: "Name" }).fill("Scout");
    await chrome.getByRole("textbox", { name: "Name" }).press("Enter");

    // A starter only fills in the words.
    await expect(chrome.getByRole("heading", { name: "What should I do for you?" })).toBeVisible();
    const starters = chrome.getByRole("button", { description: "Or start from" });
    await expect(starters).toHaveCount(3);
    await starters.first().click();
    await expect(chrome.getByRole("textbox", { name: "What it’s for" })).not.toHaveValue("");
    await chrome.getByRole("textbox", { name: "What it’s for" }).fill("Find the cheapest cable.");
    await chrome.getByRole("button", { name: "Continue" }).click();

    // Only these sites with none, or something that isn't a site, says so, and it can't be added like that.
    await chrome.getByRole("radio", { name: "Only these sites" }).click();
    await expect(chrome.getByRole("alert")).toHaveText("Name at least one site, or choose Any site.");
    await expect(chrome.getByRole("button", { name: "Add Scout" })).toBeDisabled();
    await chrome.getByRole("button", { name: "Add a site" }).click();
    await chrome.getByRole("textbox", { name: "Add a site" }).fill("not a site");
    await chrome.getByRole("textbox", { name: "Add a site" }).press("Enter");
    await expect(chrome.getByRole("alert")).toContainText("“not a site” doesn’t look like a site.");
    await chrome.getByRole("textbox", { name: "Add a site" }).fill("https://www.127.0.0.1.nip.io/x");
    await chrome.getByRole("textbox", { name: "Add a site" }).press("Enter");
    await expect(chrome.getByRole("list", { name: "Sites it may use" })).toContainText("127.0.0.1.nip.io");
    await chrome.getByRole("switch", { name: "Type" }).click();
    await chrome.getByRole("button", { name: "Add Scout" }).click();

    // Read back, then its own page.
    const made = chrome.getByRole("region", { name: "Scout is added" });
    await expect(made).toContainText("Added to your mascots");
    await expect(made).toContainText("Only visits 127.0.0.1.nip.io");
    await made.getByRole("button", { name: "Done" }).click();
    const scout = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find((mascot) => mascot.name === "Scout")!;
    expect(scout).toMatchObject({ look: { palette: "robin", accessory: "crown" }, instructions: "Find the cheapest cable.", sites: ["127.0.0.1.nip.io"], tools: ["visit", "click"] });
    await expect.poll(param).toBe(scout.id);

    // It's in the list, which the toolbar's Back goes to.
    await back();
    await expect.poll(param).toBe("list");
    await expect(page().getByRole("listitem")).toHaveCount(2);
    await expect(page().getByRole("listitem").nth(1)).toContainText("Only 127.0.0.1.nip.io · no typing");

    // Changing its limits changes only them.
    await page().getByRole("button", { name: "Scout", exact: true }).click();
    await chrome.getByRole("button", { name: /^Limits/ }).click();
    await expect.poll(param).toBe(`${scout.id}/limits`);
    await chrome.getByRole("radio", { name: "Any site" }).click();
    await chrome.getByRole("switch", { name: "Click and choose" }).click();
    await chrome.getByRole("button", { name: "Save" }).click();
    await expect.poll(param).toBe(scout.id);
    const changed = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find((mascot) => mascot.id === scout.id)!;
    expect(changed).toMatchObject({ ...scout, sites: [], tools: ["visit"] });

    // A job with a habit in it, whose offer is left unanswered in the chat and waits on the mascot's memory page.
    model.replyWith("Cheapest found.");
    model.proposeMemory({ text: KEPT, site: null });
    await chrome.getByRole("button", { name: "Chat with Scout" }).click();
    const start = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" });
    await start.fill("Find a cable, I always go for the cheapest in stock");
    await start.press("Enter");
    await expect(chrome.getByRole("listitem", { name: "Offer to remember" })).toBeVisible();

    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("flock", { param: id }), scout.id);
    await chrome.getByRole("button", { name: /^What it remembers/ }).click();
    await expect.poll(param).toBe(`${scout.id}/memory`);
    const offer = chrome.getByRole("region", { name: "Offer to remember" });
    await expect(offer).toContainText(KEPT);
    // Nothing is kept yet, but the offer is the news, so the page doesn't also say Nothing yet under it.
    await expect(chrome.getByText(/^Nothing yet\./)).toHaveCount(0);
    await offer.getByRole("button", { name: "Remember" }).click();
    await expect(offer).toHaveCount(0);
    await expect(chrome.getByRole("region", { name: "anywhere" })).toContainText(KEPT);

    // A restored session comes back to the same place.
    await app.close();
    app = await launchApp(profile, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(async () => {
      const tab = (await window.chromeAPI.browser.getTabs()).find((each) => each.page === "flock");
      if (tab) await window.chromeAPI.browser.switchTab(tab.id);
    });
    await expect(chrome.getByRole("heading", { name: "What Scout remembers" })).toBeVisible();
    await chrome.getByRole("button", { name: `Forget: ${KEPT}` }).click();
    await expect(chrome.getByText("Nothing yet.")).toBeVisible();
    await back();
    await expect.poll(param).toBe(scout.id);
  } finally {
    await app.close();
    model.close();
  }
});
