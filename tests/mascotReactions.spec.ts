import { expect, test } from "@playwright/test";
import { findView, launchApp } from "./app";

test("a mascot reacts to clicks, in turn, and turns its back when clicked too much", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    const berry = chrome.locator("[data-berry-perched] svg");
    await expect(berry).toBeVisible();
    await expect(berry).not.toHaveAttribute("data-reaction");

    for (const reaction of ["hop", "look", "toss", "ruffle"]) {
      await berry.click();
      await expect(berry).toHaveAttribute("data-reaction", reaction);
      // What it's called is its real mood, whatever it's doing for the moment.
      await expect(berry).toHaveAttribute("aria-label", "Berry, at rest");
      await expect(berry).not.toHaveAttribute("data-reaction", { timeout: 3000 });
    }

    // Past the window above, so these five are the only ones counted.
    await chrome.waitForTimeout(2600);
    for (let click = 0; click < 5; click++) await berry.click();
    await expect(berry).toHaveAttribute("data-reaction", "turn");
    await berry.click();
    await expect(berry).toHaveAttribute("data-reaction", "turn");

    await expect(berry).not.toHaveAttribute("data-reaction", { timeout: 3000 });
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
    await berry.click();
    await expect(berry).not.toHaveAttribute("data-reaction");
  } finally {
    await app.close();
  }
});

test("Keep Berry still ends a reaction that's already showing", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    const berry = chrome.locator("[data-berry-perched] svg");
    await expect(berry).toBeVisible();
    for (const reaction of ["hop", "look", "toss"]) {
      await berry.click();
      await expect(berry).toHaveAttribute("data-reaction", reaction);
    }
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
    // Well inside the 1400ms a toss lasts on its own.
    await expect(berry).not.toHaveAttribute("data-reaction", { timeout: 500 });
  } finally {
    await app.close();
  }
});
