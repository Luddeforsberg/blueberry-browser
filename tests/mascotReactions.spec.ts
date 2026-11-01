// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { findView, launchApp } from "./app";

test("a bird reacts to clicks, in turn, and turns its back when clicked too much", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    const bird = chrome.locator("[data-berry-perched] svg");
    await expect(bird).toBeVisible();
    await expect(bird).not.toHaveAttribute("data-reaction");

    for (const reaction of ["hop", "look", "toss", "ruffle"]) {
      await bird.click({ position: { x: 60, y: 70 } });
      await expect(bird).toHaveAttribute("data-reaction", reaction);
      // What it's called is its real mood, whatever it's doing for the moment.
      await expect(bird).toHaveAttribute("aria-label", "Berry, at rest");
      await expect(bird).not.toHaveAttribute("data-reaction", { timeout: 3000 });
    }

    // Past the window above, so these five are the only ones counted.
    await chrome.waitForTimeout(2600);
    for (let click = 0; click < 5; click++) await bird.click({ position: { x: 60, y: 70 } });
    await expect(bird).toHaveAttribute("data-reaction", "turn");
    await bird.click({ position: { x: 60, y: 70 } });
    await expect(bird).toHaveAttribute("data-reaction", "turn");

    await expect(bird).not.toHaveAttribute("data-reaction", { timeout: 3000 });
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
    await bird.click({ position: { x: 60, y: 70 } });
    await expect(bird).not.toHaveAttribute("data-reaction");
  } finally {
    await app.close();
  }
});

test("a bird sitting on the tab can be clicked, and keeps sitting", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
    const bird = chrome.locator("[data-berry-companion]").getByRole("img", { name: "Berry, sitting" });
    await expect(bird).toBeVisible();
    await bird.click({ position: { x: 15, y: 16 } });
    await expect(bird).toHaveAttribute("data-reaction", "hop");
    await bird.click({ position: { x: 15, y: 16 } });
    await expect(bird).toHaveAttribute("data-reaction", "ruffle");
  } finally {
    await app.close();
  }
});
