// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerAsk, findView, launchApp } from "./app";

// What main kept as the icon it set, as the system decodes it: what it was drawn for, its size, and how bright a spot
// on its ground is, left of the face.
const keptIcon = async (app: Awaited<ReturnType<typeof launchApp>>, profile: string) => {
  try {
    const drawnFor = JSON.parse(readFileSync(join(profile, "app-icon.json"), "utf8"));
    const picture = await app.evaluate(({ nativeImage }, file) => {
      const image = nativeImage.createFromPath(file);
      const { width, height } = image.getSize();
      // BGRA, a row at a time. The square starts about a tenth in.
      const at = (128 * width + 40) * 4;
      const pixels = image.toBitmap();
      return { width, height, brightness: Math.round((pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3) };
    }, join(profile, "app-icon.png"));
    return { ...drawnFor, ...picture };
  } catch {
    return null;
  }
};

test("choosing who's on the app icon and what's behind it saves both, and main takes the picture, until that mascot is deleted", async () => {
  test.setTimeout(60_000);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-app-icon-"));
  const app = await launchApp(profile, { starters: true });
  try {
    const chrome = await findView(app, "view=chrome");
    const settings = () => chrome.evaluate(() => window.chromeAPI.settings.getSettings());
    const meetingPrep = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find((mascot) => mascot.name === "Meeting Prep")!;

    // Berry on Paper to start with, drawn and taken as soon as the window opened.
    await expect.poll(() => keptIcon(app, profile)).toMatchObject({ mascotId: null, ground: "paper", width: 256, height: 256 });
    expect((await keptIcon(app, profile))!.brightness).toBeGreaterThan(200);

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings"));
    const who = chrome.getByRole("radiogroup", { name: "Who" });
    const behind = chrome.getByRole("radiogroup", { name: "Behind it" });
    await expect(who.getByRole("radio")).toHaveCount(5);
    await expect(who.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true");

    // By pointer for who, and by the arrow keys for what's behind it.
    await who.getByRole("radio", { name: "Meeting Prep" }).click();
    await behind.getByRole("radio", { name: "Paper" }).focus();
    await chrome.keyboard.press("ArrowRight");
    await expect(behind.getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");
    await expect(behind.getByRole("radio", { name: "Night" })).toBeFocused();
    await expect.poll(settings).toMatchObject({ appIconMascotId: meetingPrep.id, appIconGround: "night" });
    await expect.poll(async () => JSON.parse(readFileSync(join(profile, "settings.json"), "utf8"))).toMatchObject({ appIconMascotId: meetingPrep.id, appIconGround: "night" });
    await expect.poll(() => keptIcon(app, profile)).toMatchObject({ mascotId: meetingPrep.id, ground: "night", width: 256, height: 256 });
    expect((await keptIcon(app, profile))!.brightness).toBeLessThan(60);

    // A picture for anything but what's chosen, or that isn't a PNG of the right size, is refused.
    const drawn = readFileSync(join(profile, "app-icon.png")).toString("base64");
    expect(await chrome.evaluate((png) => window.chromeAPI.settings.setAppIcon(png, null, "night"), `data:image/png;base64,${drawn}`)).toBe(false);
    expect(await chrome.evaluate(() => window.chromeAPI.settings.setAppIcon("data:image/png;base64,AAAA", null, "paper"))).toBe(false);

    // Deleting the mascot hands the icon back to Berry, on the same ground.
    const deleted = chrome.evaluate((id) => window.chromeAPI.mascots.delete(id), meetingPrep.id);
    await answerAsk(app, "Delete");
    expect(await deleted).toBe(true);
    await expect(who.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => keptIcon(app, profile)).toMatchObject({ mascotId: null, ground: "night" });
  } finally {
    await app.close();
  }
});
