// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type { WebContentsView } from "electron";
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
const composerShowing = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) => !!BaseWindow.getAllWindows().find((window) => (window.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=composer"))?.isVisible());
// The real pointer stays where it is. This tells the app it's somewhere in the bird's window, as the window sees it.
const pointAt = (app: ElectronApplication, spot: { x: number; y: number }) =>
  app.evaluate(({ BaseWindow, screen }, { x, y }) => {
    const bird = BaseWindow.getAllWindows().find((window) => (window.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"))!;
    screen.getCursorScreenPoint = () => {
      const bounds = bird.getBounds();
      // tests/background.cjs moves it off-screen by this much, and the app doesn't know.
      const offset = bounds.x < -10000 ? 20000 : 0;
      return { x: bounds.x + offset + x, y: bounds.y + offset + y };
    };
  }, spot);
const birdIn = (desktop: Page) => desktop.locator("[data-desktop-bird]");

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
    const composer = await findView(app, "view=composer");
    expect(await registered(app)).toEqual(["Alt+Space"]);
    const bird = birdIn(desktop);
    await expect(bird).toHaveAttribute("data-mood", "rest");

    // Only each view can use its own channels.
    await expect(chrome.evaluate(() => window.chromeAPI.desktop.send("From the wrong view"))).rejects.toThrow(/Rejected/);
    await expect(desktop.evaluate(() => window.chromeAPI.desktop.send("From the bird"))).rejects.toThrow(/Rejected/);
    await expect(composer.evaluate(() => window.chromeAPI.desktop.press())).rejects.toThrow(/Rejected/);
    await expect(composer.evaluate(() => window.chromeAPI.chat.send(null, "Around the composer", { seePage: true }))).rejects.toThrow(/Rejected/);

    // Nothing about a job moves or resizes the bird's window, which is what used to make it judder.
    await expect(bird).toHaveAttribute("data-tucked", "true", { timeout: 6000 });
    await app.evaluate(({ BaseWindow }) => {
      const window = BaseWindow.getAllWindows().find((candidate) => (candidate.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"))!;
      const set = window.setBounds.bind(window);
      const seen = globalThis as unknown as { birdWindowMoves: number };
      seen.birdWindowMoves = 0;
      window.setBounds = (bounds, animate) => {
        seen.birdWindowMoves++;
        set(bounds, animate);
      };
    });

    const box = composer.getByRole("textbox");
    expect(await composerShowing(app)).toBe(false);
    await pressShortcut(app);
    await expect.poll(() => composerShowing(app)).toBe(true);
    await expect(bird).toHaveAttribute("data-tucked", "false");
    await box.fill("Half a thought");
    await box.press("Escape");
    await expect.poll(() => composerShowing(app)).toBe(false);

    // It goes to whoever is chosen, opens no tab of its own, and sends nothing about any page.
    const before = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    model.callTools({ name: "open_tab", args: { url: address } });
    const release = model.holdBeforeFirstToken();
    model.replyWith("Found three cables under €5. The cheapest is **red**.");
    await pressShortcut(app);
    await expect.poll(() => composerShowing(app)).toBe(true);
    await expect(box).toHaveValue("Half a thought");
    await box.fill("Find me a cable");
    await box.press("Enter");
    await expect.poll(() => composerShowing(app)).toBe(false);

    // It waits, like any chat, and nothing happens until the user allows it in Blueberry.
    await expect(bird).toHaveAttribute("data-mood", "asking");
    await expect(desktop.locator("[data-desktop-line]")).toHaveText("Berry needs your OK.");
    expect(await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).toHaveLength(before.length);
    expect(JSON.stringify(model.requests)).not.toContain("<page url");
    expect(JSON.stringify(model.requests)).toContain("Find me a cable");

    await bird.click();
    await expect(chrome.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await chrome.getByRole("button", { name: "Allow", exact: true }).click();

    await expect(bird).toHaveAttribute("data-mood", "fetching");
    release();
    await expect(bird).toHaveAttribute("data-mood", "delivered");
    await expect(bird).toHaveAttribute("data-tucked", "false");
    const said = desktop.locator("[data-desktop-line]");
    await expect(said).toHaveText("Found three cables under €5.");
    expect(await app.evaluate(() => (globalThis as unknown as { birdWindowMoves: number }).birdWindowMoves)).toBe(0);

    // Pressing the words opens that chat and that's the end of them.
    await said.click();
    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    expect(tabs.find(({ isActive }) => isActive)!.page).toBe("chat");
    await expect(bird).toHaveAttribute("data-mood", "rest");

    // Show Berry and Keep Berry still both reach it.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: true }));
    await expect(bird.locator(".motion-safe\\:animate-berry-blink")).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: false }));
    await expect(bird.getByRole("img", { name: "Assistant" })).toBeVisible();

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

test("closing Blueberry's window takes the bird, the composer and the shortcut with it", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    await findView(app, "view=desktop");
    expect(await windowCount(app)).toBe(3);
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find((window) => window.contentView.children.length > 1)?.close());
    await expect.poll(() => windowCount(app)).toBe(0);
    expect(await registered(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test("tucked, only its head takes the pointer, which brings it out until the pointer leaves", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true, keepBerryStill: true }));
    const desktop = await findView(app, "view=desktop");
    const bird = birdIn(desktop);
    await expect(bird).toHaveAttribute("data-tucked", "true");

    const passing = () =>
      app.evaluate(() => {
        const seen = globalThis as unknown as { passing?: boolean };
        return seen.passing ?? true;
      });
    await app.evaluate(({ BaseWindow }) => {
      const window = BaseWindow.getAllWindows().find((candidate) => (candidate.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"))!;
      const set = window.setIgnoreMouseEvents.bind(window);
      window.setIgnoreMouseEvents = (ignore, options) => {
        (globalThis as unknown as { passing: boolean }).passing = ignore;
        set(ignore, options);
      };
    });

    // Its window is much bigger than the head showing, and the rest of it doesn't count.
    const { x, height } = await desktop.evaluate(() => {
      const box = document.querySelector("[data-desktop-bird]")!.getBoundingClientRect();
      return { x: box.x, height: innerHeight };
    });
    await pointAt(app, { x: x + 40, y: height - 60 });
    await desktop.waitForTimeout(150);
    expect(await passing()).toBe(true);
    await expect(bird).toHaveAttribute("data-tucked", "true");
    await pointAt(app, { x: 2, y: height - 4 });
    await desktop.waitForTimeout(150);
    expect(await passing()).toBe(true);

    await pointAt(app, { x: x + 40, y: height - 10 });
    await expect.poll(passing).toBe(false);
    await expect(bird).toHaveAttribute("data-tucked", "false");
    await pointAt(app, { x: 2, y: 2 });
    await expect.poll(passing).toBe(true);
    await expect(bird).toHaveAttribute("data-tucked", "true", { timeout: 2000 });
  } finally {
    await app.close();
  }
});

test("pressing the bird gets its reaction and opens the composer, and dragging it snaps to the nearest edge", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    const desktop = await findView(app, "view=desktop");
    const bird = birdIn(desktop);
    // Landed and tucked, as it can't be dragged in flight.
    await expect(bird).toHaveAttribute("data-tucked", "true", { timeout: 5000 });
    await pointAt(app, { x: -1000, y: -1000 });

    const box = await bird.boundingBox();
    const grab = { x: box!.x + 36, y: (await desktop.evaluate(() => innerHeight)) - 8 };
    await desktop.mouse.move(grab.x, grab.y);
    await desktop.mouse.down();
    await desktop.mouse.move(grab.x - 30, grab.y);
    await expect(bird).toHaveAttribute("data-tucked", "false");
    // Let go at the far top, as the app sees the pointer.
    await app.evaluate(({ screen }) => {
      const { workArea } = screen.getPrimaryDisplay();
      screen.getCursorScreenPoint = () => ({ x: workArea.x + workArea.width / 2, y: workArea.y + 5 });
    });
    await desktop.mouse.up();
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).desktopBerrySpot?.edge).toBe("top");
    await expect(bird).toHaveAttribute("data-edge", "top");
    await expect(desktop.locator("[data-desktop-line]")).toHaveCount(0);
    expect(await composerShowing(app)).toBe(false);

    // Tucks, back in its small window, and pressing it there gets a reaction as well as the composer.
    await pointAt(app, { x: -1000, y: -1000 });
    await expect(bird).toHaveAttribute("data-tucked", "true", { timeout: 3000 });
    await expect.poll(() => desktop.evaluate(() => innerWidth)).toBe(430);
    await desktop.evaluate(() => {
      const seen = window as unknown as { reactions: string[] };
      seen.reactions = [];
      new MutationObserver(() => {
        const reaction = document.querySelector("[data-desktop-bird] svg")?.getAttribute("data-reaction");
        if (reaction) seen.reactions.push(reaction);
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-reaction"] });
    });
    const peeking = await bird.boundingBox();
    await desktop.mouse.click(peeking!.x + 40, 10);
    await expect.poll(() => composerShowing(app)).toBe(true);
    expect(await desktop.evaluate(() => (window as unknown as { reactions: string[] }).reactions)).toContain("hop");
  } finally {
    await app.close();
  }
});

test("turned on with Blueberry in front, it flies out, tucks and comes back in, and no part of it stays behind meanwhile", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await app.evaluate(({ BaseWindow }) => {
      const main = BaseWindow.getAllWindows()[0];
      main.isFocused = () => true;
    });
    const perched = chrome.locator("[data-berry-perched]");
    await expect(perched).toBeVisible();
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    // The whole bird goes, with the shadow its feet leave on the composer, as they're both in this.
    await expect(perched).toHaveCSS("opacity", "0");
    // The flight, the moment it stands there, and the tuck.
    await expect(perched).toHaveCSS("opacity", "1", { timeout: 6000 });
    const desktop = await findView(app, "view=desktop");
    await expect(desktop.locator("[data-desktop-bird]")).toHaveAttribute("data-tucked", "true");
    await expect
      .poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find((window) => (window.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"))?.isVisible()))
      .toBe(false);
  } finally {
    await app.close();
  }
});
