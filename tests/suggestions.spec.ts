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

test("only suggestions whose evidence checks out show, a row fills things in, and one dismissed stays gone", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  model.suggestFrom(demoProposals);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-suggestions-"));
  new HistoryStore(join(profile, "history.db")).importVisits(demoVisits());
  seedChats(profile);

  let app = await launchApp(profile, { modelEnv: model.env });
  try {
    let chrome = await findView(app, "view=chrome");
    const composer = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
    const list = () => chrome.getByRole("region", { name: "suggestions" });
    const row = (title: string) => list().getByRole("button").filter({ hasText: title });

    // The page doesn't wait for the model, and only what checks out comes from it.
    await expect(chrome.getByText(DEMO_LINES.routine)).toBeVisible({ timeout: 20_000 });
    // The newest chat to pick up comes first, then the three that checked out.
    await expect(list().getByRole("listitem")).toHaveCount(4);
    await expect(list().getByRole("listitem").first()).toContainText("Pick up");
    for (const line of Object.values(DEMO_LINES)) await expect(chrome.getByText(line)).toBeVisible();
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
    const words = DEMO_LINES.prompt;
    await row(words).click();
    await expect(composer).not.toHaveValue("");
    await expect(composer).toBeFocused();
    const { caret, length } = await composer.evaluate((box: HTMLTextAreaElement) => ({ caret: box.selectionStart, length: box.value.length }));
    expect(caret).toBe(length);
    expect(model.requests).toHaveLength(0);

    // Filled in and left for the user to save.
    await row(DEMO_LINES.routine).click();
    // The same steps as making one, with its answers filled in.
    await expect(chrome.getByRole("heading", { name: "What should I do?" })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "What should I do?" })).not.toHaveValue("");
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByLabel("Other time")).toHaveValue("08:15");
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.routines).toHaveLength(0);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await row(DEMO_LINES.mascot).click();
    // The same steps as making one, with its answers filled in.
    await expect(chrome.getByRole("heading", { name: "What do I look like?" })).toBeVisible();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Linus");
    await chrome.getByRole("button", { name: "Continue" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByRole("list", { name: "Sites it may use" }).getByRole("listitem")).toHaveText(["github.com", "linear.app"]);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.getByRole("button", { name: `Dismiss: ${words}` }).click();
    await expect(chrome.getByRole("button", { name: `Dismiss: ${words}` })).toHaveCount(0);

    await app.close();
    const asked = model.suggestionRequests.length;
    app = await launchApp(profile, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());

    await expect(row(DEMO_LINES.mascot)).toBeVisible();
    await expect(chrome.getByRole("button", { name: `Dismiss: ${words}` })).toHaveCount(0);
    expect(model.suggestionRequests).toHaveLength(asked);
  } finally {
    await app.close();
    model.close();
  }
});
