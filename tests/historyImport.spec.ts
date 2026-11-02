// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoVisits } from "../evals/seedHistory";
import { findView, launchApp } from "./app";
import { chromeHistoryFile, writeChromiumHistory } from "./chromiumHistory";
import { startFakeModel } from "./fakeModel";
import { DEMO_LINES, demoProposals } from "./suggestionReplies";

test("onboarding brings in another browser's history, and the birds speak about it on the new tab", async () => {
  test.setTimeout(60_000);
  const browsers = mkdtempSync(join(tmpdir(), "blueberry-browsers-"));
  writeChromiumHistory(chromeHistoryFile(browsers), demoVisits()).close();
  const model = await startFakeModel();
  model.suggestFrom(demoProposals);

  const app = await launchApp(undefined, { firstLaunch: true, modelEnv: { ...model.env, BLUEBERRY_BROWSER_DATA: browsers } });
  try {
    const chrome = await findView(app, "view=chrome");
    await expect(chrome.getByLabel("Step 1 of 4")).toBeVisible();
    await chrome.getByRole("button", { name: "Nice to meet you" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();

    await expect(chrome.getByRole("heading", { name: "Bring your history along?" })).toBeVisible();
    await expect(chrome.getByLabel("Step 3 of 4")).toBeVisible();
    await expect(chrome.getByText("I can read your history from Chrome")).toBeVisible();
    expect(model.suggestionRequests).toHaveLength(0);

    await chrome.getByRole("button", { name: "Bring it in" }).click();
    await expect(chrome.getByRole("status")).toHaveText(/^Brought in [\d,  ]+ visits from Chrome\.$/);
    await chrome.getByRole("button", { name: "Continue" }).click();
    await chrome.getByRole("button", { name: "Start browsing" }).click();

    const cards = chrome.getByRole("region", { name: "Things you repeat" }).getByRole("listitem");
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await expect(chrome.getByText(DEMO_LINES.routine)).toBeVisible();

    // What the step says goes out is what went out.
    expect(model.suggestionRequests).toHaveLength(1);
    const sent = JSON.stringify(model.suggestionRequests[0].messages);
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
