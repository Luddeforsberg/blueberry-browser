// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

declare global {
  // eslint-disable-next-line no-var
  var fakeShortcuts: Map<string, () => void>;
}

const pressShortcut = (app: ElectronApplication) => app.evaluate(() => globalThis.fakeShortcuts.get("Alt+Space")?.());
const registered = (app: ElectronApplication) => app.evaluate(() => [...globalThis.fakeShortcuts.keys()]);
const windowCount = (app: ElectronApplication) => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);

test("a job from the composer runs with no page, asks as a chat does, and the bird says how it went", async () => {
  const site = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<title>Shop</title><h1>Cheap cables</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    expect(await windowCount(app)).toBe(1);
    expect(await registered(app)).toEqual([]);

    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true, actionApproval: "always" }));
    const desktop = await findView(app, "view=desktop");
    expect(await registered(app)).toEqual(["Alt+Space"]);
    const bird = desktop.locator("[data-desktop-bird] svg");
    await expect(bird).toHaveAttribute("aria-label", "Berry, at rest");
    // Moved aside for it in the window, rather than two of them.
    await expect.poll(() => chrome.locator("[data-berry-perched] svg").evaluate((svg) => getComputedStyle(svg.parentElement!.parentElement!).opacity)).toBe("0");

    // Only its own view can use it, and a click gets the same reaction as anywhere.
    await expect(chrome.evaluate(() => window.chromeAPI.desktop.send("From the wrong view"))).rejects.toThrow(/Rejected/);
    await expect(desktop.evaluate(() => window.chromeAPI.chat.send(null, "Around the composer", { seePage: true }))).rejects.toThrow(/Rejected/);

    const box = desktop.getByRole("textbox");
    await expect(box).toHaveCount(0);
    await pressShortcut(app);
    await expect(box).toBeVisible();
    await box.fill("Half a thought");
    await box.press("Escape");
    await expect(box).toHaveCount(0);

    // It goes to whoever is chosen, opens no tab of its own, and sends nothing about any page.
    const before = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    model.callTools({ name: "open_tab", args: { url: address } });
    const release = model.holdBeforeFirstToken();
    model.replyWith("Found three cables under €5. The cheapest is **red**.");
    await pressShortcut(app);
    await expect(box).toHaveValue("Half a thought");
    await box.fill("Find me a cable");
    await box.press("Enter");
    await expect(box).toHaveCount(0);

    // It waits, like any chat, and nothing happens until the user allows it in Blueberry.
    await expect(bird).toHaveAttribute("aria-label", "Berry, waiting for your decision");
    await expect(desktop.getByRole("button", { name: "Berry needs your OK." }).first()).toBeVisible();
    expect(await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).toHaveLength(before.length);
    expect(JSON.stringify(model.requests)).not.toContain("<page url");
    expect(JSON.stringify(model.requests)).toContain("Find me a cable");

    await desktop.locator("[data-desktop-bird]").click();
    await expect(chrome.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await chrome.getByRole("button", { name: "Allow", exact: true }).click();

    await expect(bird).toHaveAttribute("aria-label", "Berry, fetching");
    release();
    await expect(bird).toHaveAttribute("aria-label", "Berry, finished");
    const said = desktop.locator("button", { hasText: "Found three cables under €5." });
    await expect(said).toHaveText("Found three cables under €5.");

    // Pressing the words opens that chat and that's the end of them.
    await said.click();
    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    const active = tabs.find(({ isActive }) => isActive)!;
    expect(active.page).toBe("chat");
    await expect(bird).toHaveAttribute("aria-label", "Berry, at rest");

    // Show Berry and Keep Berry still both reach it.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
    await expect(desktop.locator("[data-desktop-bird] .motion-safe\\:animate-berry-blink")).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: false }));
    await expect(desktop.locator("[data-desktop-bird]").getByRole("img", { name: "Assistant" })).toBeVisible();

    // Off takes all of it away.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: false }));
    await expect.poll(() => windowCount(app)).toBe(1);
    expect(await registered(app)).toEqual([]);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("closing Blueberry's window takes the bird and the shortcut with it", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    await findView(app, "view=desktop");
    expect(await windowCount(app)).toBe(2);
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find((window) => window.contentView.children.length > 1)?.close());
    await expect.poll(() => windowCount(app)).toBe(0);
    expect(await registered(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test("clicks go through the window everywhere but on the bird", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true, keepBerryStill: true }));
    await findView(app, "view=desktop");

    // The real pointer stays where it is, so this tells the app it's somewhere else, and the window what it was told.
    const pointAt = (x: number, y: number) =>
      app.evaluate(({ BaseWindow, screen }, spot) => {
        const bird = BaseWindow.getAllWindows().find((window) => window.contentView.children.length === 1)!;
        const seen = globalThis as unknown as { passing?: boolean };
        if (seen.passing === undefined) {
          const set = bird.setIgnoreMouseEvents.bind(bird);
          bird.setIgnoreMouseEvents = (ignore, options) => {
            seen.passing = ignore;
            set(ignore, options);
          };
          seen.passing = true;
        }
        screen.getCursorScreenPoint = () => {
          const bounds = bird.getBounds();
          // tests/background.cjs moves it off-screen by this much, and the app doesn't know.
          const offset = bounds.x < -10000 ? 20000 : 0;
          return { x: bounds.x + offset + spot.x, y: bounds.y + offset + spot.y };
        };
      }, { x, y });
    const passing = () => app.evaluate(() => (globalThis as unknown as { passing: boolean }).passing);

    await pointAt(2, 2);
    expect(await passing()).toBe(true);
    await pointAt(48, 60);
    await expect.poll(passing).toBe(false);
    await pointAt(2, 2);
    await expect.poll(passing).toBe(true);
  } finally {
    await app.close();
  }
});

test("pressing the bird gets its reaction and opens the composer, and dragging it only moves it", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    const desktop = await findView(app, "view=desktop");
    const body = desktop.locator("[data-desktop-bird]");
    // Landed, as it can't be dragged in flight.
    await expect(body.locator("svg")).toHaveAttribute("aria-label", "Berry, at rest");

    const box = await body.boundingBox();
    const middle = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await desktop.mouse.move(middle.x, middle.y);
    await desktop.mouse.down();
    await desktop.mouse.move(middle.x - 30, middle.y);
    await desktop.mouse.up();
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).desktopBerrySpot).not.toBeNull();
    await expect(desktop.getByRole("textbox")).toHaveCount(0);
    await expect(body.locator("svg")).not.toHaveAttribute("data-reaction");

    // Opening the composer resizes the window, which can take longer than the hop, so this watches for it.
    await desktop.evaluate(() => {
      const seen = window as unknown as { reactions: string[] };
      seen.reactions = [];
      new MutationObserver(() => {
        const reaction = document.querySelector("[data-desktop-bird] svg")?.getAttribute("data-reaction");
        if (reaction) seen.reactions.push(reaction);
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-reaction"] });
    });
    await body.click();
    await expect(desktop.getByRole("textbox")).toBeVisible();
    expect(await desktop.evaluate(() => (window as unknown as { reactions: string[] }).reactions)).toContain("hop");
  } finally {
    await app.close();
  }
});
