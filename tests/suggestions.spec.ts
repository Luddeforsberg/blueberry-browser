// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoVisits, seedChats } from "../evals/seedHistory";
import { HistoryStore } from "../src/main/HistoryStore";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const CARDS = JSON.stringify({
  cards: [
    { id: "p1", title: "Meet Linus", name: "Linus", instructions: "Keep an eye on my checkout pull requests.", palette: "kingfisher", accessory: "glasses" },
    { id: "p2", title: "Top stories at 8:15", name: "Morning stories", instructions: "Read the front page and list five stories." },
    { id: "p3", title: "Newest flats on Södermalm", prompt: "What's newly listed on Södermalm?" },
    { id: "p4", title: "Lisbon flights this week", prompt: "Find the cheapest flights to Lisbon this week." },
  ],
});

test("a card fills things in, and one dismissed stays gone", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  model.titleWith(CARDS);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-suggestions-"));
  new HistoryStore(join(profile, "history.db")).importVisits(demoVisits());
  seedChats(profile);

  let app = await launchApp(profile, { modelEnv: model.env });
  try {
    let chrome = await findView(app, "view=chrome");
    const composer = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
    const cards = chrome.getByRole("region", { name: "Things you repeat" }).getByRole("listitem");

    // The page doesn't wait for the model, and the reason comes from the history, not from it.
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await expect(chrome.getByText(/You’ve opened Hacker News around 8:\d\d/)).toBeVisible();

    const sent = JSON.stringify(model.titleRequests[0].messages);
    expect(sent).not.toContain("sore throat");
    expect(sent).not.toContain("Swedbank");
    expect(sent).not.toContain("Inbox");
    expect(sent).not.toContain("/pull/412");

    // A prompt waits in the composer with the cursor ready, and nothing has gone to the main model.
    const prompt = cards.first();
    const words = await prompt.locator("p span").nth(1).textContent();
    await prompt.getByRole("button").first().click();
    await expect(composer).not.toHaveValue("");
    await expect(composer).toBeFocused();
    const { caret, length } = await composer.evaluate((box: HTMLTextAreaElement) => ({ caret: box.selectionStart, length: box.value.length }));
    expect(caret).toBe(length);
    expect(model.requests).toHaveLength(0);

    // Filled in and left for the user to save.
    await chrome.getByRole("button", { name: "Set it up" }).click();
    await expect(chrome.getByRole("heading", { name: "New routine" })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Morning stories");
    await expect(chrome.getByLabel("Time")).toHaveValue(/^0[78]:\d\d$/);
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.routines).toHaveLength(0);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.getByRole("button", { name: "Meet Linus", exact: true }).click();
    await expect(chrome.getByRole("heading", { name: "New mascot" })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Linus");
    await expect(chrome.getByLabel("Sites it may use")).toHaveValue("github.com, linear.app");

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.getByRole("button", { name: `Dismiss: ${words}` }).click();
    await expect(chrome.getByRole("button", { name: `Dismiss: ${words}` })).toHaveCount(0);

    await app.close();
    const asked = model.titleRequests.length;
    app = await launchApp(profile, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());

    await expect(chrome.getByRole("button", { name: "Meet Linus", exact: true })).toBeVisible();
    await expect(chrome.getByRole("button", { name: `Dismiss: ${words}` })).toHaveCount(0);
    expect(model.titleRequests).toHaveLength(asked);
  } finally {
    await app.close();
    model.close();
  }
});
