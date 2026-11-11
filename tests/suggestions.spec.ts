// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoVisits, seedChats } from "../evals/seedHistory";
import { HistoryStore } from "../src/main/HistoryStore";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { DEMO_LINES, REFUSED_LINES, demoProposals } from "./suggestionReplies";

test("only cards whose evidence checks out show, a card fills things in, and one dismissed stays gone", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  model.suggestFrom(demoProposals);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-suggestions-"));
  new HistoryStore(join(profile, "history.db")).importVisits(demoVisits());
  seedChats(profile);

  let app = await launchApp(profile, { modelEnv: model.env });
  try {
    let chrome = await findView(app, "view=chrome");
    const composer = chrome.getByRole("textbox", { name: /^Ask (.+ )?or search$/ });
    const cards = chrome.getByRole("list", { name: "Ideas" }).getByRole("listitem");
    // The tray's line is the top idea, and More ideas opens the tray onto every one of them.
    const moreIdeas = () => chrome.getByRole("button", { name: /more ideas?$/ }).click({ timeout: 20_000 });

    // The page doesn't wait for the model, and only what checks out comes from it.
    await moreIdeas();
    await expect(cards.getByText(DEMO_LINES.routine)).toBeVisible({ timeout: 20_000 });
    await expect(cards).toHaveCount(3);
    for (const line of Object.values(DEMO_LINES)) await expect(cards.getByText(line)).toBeVisible();
    for (const line of REFUSED_LINES) await expect(chrome.getByText(line)).toHaveCount(0);
    // Not just left off the page: only these got past the checks.
    const saved = JSON.parse(readFileSync(join(profile, "suggestions.json"), "utf8")) as { proposals: Array<{ card: { title: string } }> };
    expect(saved.proposals.map(({ card }) => card.title).sort()).toEqual(Object.values(DEMO_LINES).sort());

    const sent = JSON.stringify(model.suggestionRequests[0].messages);
    expect(sent).toContain("news.ycombinator.com");
    expect(sent).toContain("Cheap flights to Lisbon");
    expect(sent).not.toContain("sore throat");
    expect(sent).not.toContain("Swedbank");
    expect(sent).not.toContain("Inbox");
    expect(sent).not.toContain("/pull/412");

    // A prompt waits in the composer with the cursor ready, and nothing has gone to the main model.
    const prompt = cards.first();
    const words = await prompt.locator("p").first().textContent();
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
    await expect(chrome.getByRole("textbox", { name: "Time", exact: true })).toHaveValue("08:15");
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.routines).toHaveLength(0);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await moreIdeas();
    await chrome.getByRole("button", { name: "Meet Linus", exact: true }).click();
    await expect(chrome.getByRole("heading", { name: "New mascot" })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Linus");
    await expect(chrome.getByLabel("Sites it may use")).toHaveValue("github.com, linear.app");

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await moreIdeas();
    await chrome.getByRole("button", { name: `Not now: ${words}` }).click();
    await expect(chrome.getByRole("button", { name: `Not now: ${words}` })).toHaveCount(0);

    await app.close();
    const asked = model.suggestionRequests.length;
    app = await launchApp(profile, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());

    await chrome.getByRole("button", { name: /more ideas?$/ }).click();
    await expect(chrome.getByRole("button", { name: "Meet Linus", exact: true })).toBeVisible();
    await expect(chrome.getByRole("button", { name: `Not now: ${words}` })).toHaveCount(0);
    expect(model.suggestionRequests).toHaveLength(asked);
  } finally {
    await app.close();
    model.close();
  }
});
