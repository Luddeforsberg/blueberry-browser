import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoVisits } from "../evals/seedHistory";
import { findView, launchApp } from "./app";
import { chromeHistoryFile, writeChromiumHistory } from "./chromiumHistory";
import { startFakeModel } from "./fakeModel";
import { DEMO_LINES, demoProposals } from "./suggestionReplies";
import { defined } from "../src/shared/testing";

test("the first run brings in another browser's history, and the mascots speak about it on the new tab", async () => {
  test.setTimeout(60_000);
  const browsers = mkdtempSync(join(tmpdir(), "blueberry-browsers-"));
  writeChromiumHistory(chromeHistoryFile(browsers), demoVisits()).close();
  const model = await startFakeModel();
  model.suggestFrom(demoProposals);

  const app = await launchApp(undefined, { firstLaunch: true, modelEnv: { ...model.env, BLUEBERRY_BROWSER_DATA: browsers } });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Get started" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();
    // The .env key works, so the key can wait.
    await chrome.getByRole("button", { name: "I’ll do this later" }).click();

    await expect(chrome.getByRole("heading", { name: "Shall I bring your history over?" })).toBeVisible();
    await expect(chrome.getByText("3 / 4")).toBeVisible();
    await expect(chrome.getByRole("radio", { name: /^Chrome/ })).toBeChecked();
    expect(model.suggestionRequests).toHaveLength(0);

    await chrome.getByRole("button", { name: "Bring it in" }).click();
    await expect(chrome.getByRole("status")).toHaveText(/^[\d,  ]+ visits came across from Chrome\.$/);
    await expect(chrome.getByRole("radio", { name: /^Chrome [\d,  ]+ visits came across Done$/ })).toBeChecked();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await chrome.getByRole("button", { name: "Start browsing" }).click();

    // First jobs stands where suggestions go, with history already done, until it's hidden.
    const firstJobs = chrome.getByRole("region", { name: "First jobs" });
    await expect(firstJobs).toContainText("1 of 4");
    await firstJobs.getByRole("button", { name: "Hide" }).click();
    const cards = chrome.getByRole("region", { name: "Suggestions" }).getByRole("listitem");
    // The three that checked out, then a mascot to try fills the last of the four rows.
    await expect(cards).toHaveCount(4, { timeout: 20_000 });
    await expect(cards.last()).toContainText(/Try$/);
    await expect(chrome.getByText(DEMO_LINES.routine)).toBeVisible();

    // What the step says goes out is what went out.
    expect(model.suggestionRequests).toHaveLength(1);
    const sent = JSON.stringify(defined(model.suggestionRequests[0]).messages);
    expect(sent).toContain("news.ycombinator.com");
    expect(sent).not.toContain("/pull/412");
    expect(sent).not.toContain("Swedbank");

    // Bringing it in again adds nothing and asks nothing.
    expect(await chrome.evaluate(() => window.chromeAPI.browser.importHistory("chrome"))).toEqual({ ok: true, added: 0 });
    expect(model.suggestionRequests).toHaveLength(1);
    expect(await chrome.evaluate(() => window.chromeAPI.browser.importHistory("safari"))).toEqual({ ok: false });
  } finally {
    await app.close();
    model.close();
  }
});
