import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type { WebContentsView } from "electron";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { defined } from "../src/shared/testing";

declare global {
  var fakeShortcuts: Map<string, () => void>;
}

// What these can't see: whether the panel really takes the keyboard without bringing Blueberry forward, and whether
// the drop's window really lets clicks through to the app beneath, since tests/background.cjs makes `focus` do nothing
// and keeps every window off-screen. They see what main decides and what the views draw.

const pressShortcut = (app: ElectronApplication) => app.evaluate(() => globalThis.fakeShortcuts.get("Alt+Space")?.());
const registered = (app: ElectronApplication) => app.evaluate(() => [...globalThis.fakeShortcuts.keys()]);
const windowCount = (app: ElectronApplication) => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);
const showing = (app: ElectronApplication, view: "desktop" | "composer") =>
  app.evaluate(
    ({ BaseWindow }, view) =>
      !!BaseWindow.getAllWindows()
        .find((window) => (window.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes(`view=${view}`))
        ?.isVisible(),
    view,
  );
// The real pointer stays where it is. This tells the app it's somewhere in the drop's window, as the window sees it.
const pointAt = (app: ElectronApplication, spot: { x: number; y: number }) =>
  app.evaluate(({ BaseWindow, screen }, { x, y }) => {
    const drop = BaseWindow.getAllWindows().find((window) =>
      (window.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"),
    )!;
    screen.getCursorScreenPoint = () => {
      const bounds = drop.getBounds();
      // tests/background.cjs moves it off-screen by this much, and the app doesn't know.
      const offset = bounds.x < -10000 ? 20000 : 0;
      return { x: bounds.x + offset + x, y: bounds.y + offset + y };
    };
  }, spot);
const dropIn = (desktop: Page) => desktop.locator("[data-desktop-drop]");

test("the drop takes a job from any app, comes out when it asks without saying what, and answers here once, as Needs you does", async () => {
  const site = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<title>Shop</title><h1>Cheap cables</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(site.address() as AddressInfo).port}/cart`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    expect(await windowCount(app)).toBe(1);
    expect(await registered(app)).toEqual([]);

    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true, actionApproval: "always" }));
    const desktop = await findView(app, "view=desktop");
    const panel = await findView(app, "view=composer");
    expect(await registered(app)).toEqual(["Alt+Space"]);
    // Blueberry isn't in front, so the drop is out, at rest, on the right edge.
    const drop = dropIn(desktop);
    await expect(drop).toHaveAttribute("data-says", "rest");
    await expect(drop).toHaveAttribute("data-mood", "rest");
    await expect(drop).toHaveAttribute("data-edge", "right");
    await expect.poll(() => showing(app, "desktop")).toBe(true);

    // Only each view can use its own channels, and nothing else can answer from here.
    await expect(chrome.evaluate(() => window.chromeAPI.desktop.send("From the wrong view", false))).rejects.toThrow(/Rejected/);
    await expect(chrome.evaluate(() => window.chromeAPI.desktop.decide({ key: "a1", allow: true }))).rejects.toThrow(/Rejected/);
    await expect(desktop.evaluate(() => window.chromeAPI.desktop.send("From the drop", false))).rejects.toThrow(/Rejected/);
    await expect(desktop.evaluate(() => window.chromeAPI.desktop.decide({ key: "a1", allow: true }))).rejects.toThrow(/Rejected/);
    await expect(panel.evaluate(() => window.chromeAPI.desktop.press("drop"))).rejects.toThrow(/Rejected/);
    await expect(panel.evaluate(() => window.chromeAPI.chat.send(null, "Around the box", { seePage: true }))).rejects.toThrow(/Rejected/);
    await expect(panel.evaluate(() => window.chromeAPI.chat.decide("chat", "approval", true))).rejects.toThrow(/Rejected/);

    // Nothing that happens to a job moves or resizes the drop's window, which is what makes a window judder.
    await app.evaluate(({ BaseWindow }) => {
      const window = BaseWindow.getAllWindows().find((candidate) =>
        (candidate.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"),
      )!;
      const set = window.setBounds.bind(window);
      const seen = globalThis as unknown as { dropWindowMoves: number };
      seen.dropWindowMoves = 0;
      window.setBounds = (bounds, animate) => {
        seen.dropWindowMoves++;
        set(bounds, animate);
      };
    });

    // The shortcut grows the drop into the box, and Esc keeps what was typed.
    const box = panel.getByRole("textbox", { name: "Give Berry a job" });
    expect(await showing(app, "composer")).toBe(false);
    await pressShortcut(app);
    await expect.poll(() => showing(app, "composer")).toBe(true);
    await expect(panel.locator("[data-desktop-box]")).toBeVisible();
    await box.fill("Half a thought");
    await box.press("Escape");
    await expect.poll(() => showing(app, "composer")).toBe(false);

    // Enter starts a chat with no page, as whoever is chosen, and opens no tab of its own.
    const before = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    model.callTools({ name: "open_tab", args: { url: address } });
    const release = model.holdBeforeFirstToken();
    model.replyWith("Found three cables under €5. The cheapest is **red**.");
    await pressShortcut(app);
    await expect.poll(() => showing(app, "composer")).toBe(true);
    await expect(box).toHaveValue("Half a thought");
    await box.fill("Find me a cable");
    await box.press("Enter");
    await expect.poll(() => showing(app, "composer")).toBe(false);
    expect(JSON.stringify(model.requests)).toContain("Find me a cable");
    expect(JSON.stringify(model.requests)).not.toContain("<page url");

    // It asks, like any chat. Out by itself, the drop says who and what kind of thing, and nothing of what or where.
    await expect(drop).toHaveAttribute("data-says", "asking");
    await expect(drop).toContainText("Berry needs your OK");
    const said = await desktop.evaluate(() => document.body.innerText);
    expect(said).not.toContain("127.0.0.1");
    expect(said).not.toContain("cart");
    expect(await panel.evaluate(() => document.body.innerText)).not.toContain("127.0.0.1");
    expect(await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).toHaveLength(before.length);

    // Answer shows the exact words, beside the drop.
    await desktop.locator('[data-desktop-part="answer"]').click();
    await expect.poll(() => showing(app, "composer")).toBe(true);
    const ask = panel.locator('[data-desktop-ask="approval"]');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText(address);
    await expect(drop).toHaveAttribute("data-says", "rest");

    // A press on an earlier showing answers nothing and leaves this one be, and nothing is answered once it's going away.
    const showingKey = async () => (await panel.evaluate(() => window.chromeAPI.desktop.panelState())).ask!.key;
    expect(await panel.evaluate(() => window.chromeAPI.desktop.decide({ key: "a0", allow: true }))).toBe("gone");
    await expect(ask).toBeVisible();
    const goingAway = await panel.evaluate(
      (key) => {
        void window.chromeAPI.desktop.closePanel();
        return window.chromeAPI.desktop.decide({ key, allow: true });
      },
      await showingKey(),
    );
    expect(goingAway).toBe("gone");
    await expect.poll(() => showing(app, "composer")).toBe(false);
    await expect(drop).toHaveAttribute("data-says", "asking");
    expect(await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).toHaveLength(before.length);
    await desktop.locator('[data-desktop-part="answer"]').click();
    await expect.poll(() => showing(app, "composer")).toBe(true);
    await expect(ask).toBeVisible();

    // Allow goes once, to that approval, through the same path as Needs you, and a second press sends nothing.
    const key = await showingKey();
    await ask.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(ask.getByRole("status")).toHaveText("Allowed. Berry carries on.");
    expect(await panel.evaluate((key) => window.chromeAPI.desktop.decide({ key, allow: true }), key)).toBe("gone");
    expect(await panel.evaluate((key) => window.chromeAPI.desktop.decide({ key, allow: false }), key)).toBe("gone");
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).length).toBe(before.length + 1);
    await expect.poll(() => showing(app, "composer"), { timeout: 4000 }).toBe(false);

    // It ended while Blueberry was elsewhere, so the drop comes out with the reply's first sentence.
    release();
    await expect(drop).toHaveAttribute("data-says", "finished");
    await expect(drop).toContainText("Found three cables under €5.");
    await expect(drop).toHaveAttribute("data-mood", "delivered");
    expect(await app.evaluate(() => (globalThis as unknown as { dropWindowMoves: number }).dropWindowMoves)).toBe(0);

    // Open opens that chat in Blueberry, and that's the end of it.
    await desktop.locator('[data-desktop-part="open"]').click();
    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    expect(tabs.find(({ isActive }) => isActive)!.page).toBe("chat");
    await expect(drop).toHaveAttribute("data-says", "rest");

    // With mascots hidden, the pips stand in, and it's called the Assistant.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: false }));
    await expect(drop.getByRole("img", { name: /^Assistant/ })).toBeVisible();
    await expect(drop.locator("[data-pips]")).toHaveCount(1);

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

test("closing Blueberry's window takes the drop, the panel, its menu and the shortcut with it", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    await findView(app, "view=desktop");
    // Blueberry's, the drop's, the panel's and the menu's.
    expect(await windowCount(app)).toBe(4);
    // Off a Mac the app quits once its last window has gone, so what's left is read as that happens, not after.
    const left = await app.evaluate(
      ({ app, BaseWindow }) =>
        new Promise<{ windows: number; shortcuts: string[] }>((resolve) => {
          app.once("window-all-closed", () =>
            resolve({ windows: BaseWindow.getAllWindows().length, shortcuts: [...globalThis.fakeShortcuts.keys()] }),
          );
          BaseWindow.getAllWindows()
            .find((window) => window.contentView.children.length > 1)
            ?.close();
        }),
    );
    expect(left).toEqual({ windows: 0, shortcuts: [] });
  } finally {
    await app.close();
  }
});

test("only the drop takes the pointer, pointed at it says what a press does, and with nothing going on a press opens the box", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true, keepBerryStill: true }));
    const desktop = await findView(app, "view=desktop");
    const drop = dropIn(desktop);
    await expect(drop).toHaveAttribute("data-says", "rest");

    const passing = () => app.evaluate(() => (globalThis as unknown as { passing?: boolean }).passing ?? true);
    await app.evaluate(({ BaseWindow }) => {
      const window = BaseWindow.getAllWindows().find((candidate) =>
        (candidate.contentView.children[0] as WebContentsView)?.webContents?.getURL().includes("view=desktop"),
      )!;
      const set = window.setIgnoreMouseEvents.bind(window);
      window.setIgnoreMouseEvents = (ignore, options) => {
        (globalThis as unknown as { passing: boolean }).passing = ignore;
        set(ignore, options);
      };
    });

    // Its window is much bigger than the drop, and the rest of it doesn't count, even just beside it.
    const rest = (await drop.boundingBox())!;
    expect([Math.round(rest.width), Math.round(rest.height)]).toEqual([28, 32]);
    await pointAt(app, { x: rest.x - 6, y: rest.y + rest.height / 2 });
    await desktop.waitForTimeout(200);
    expect(await passing()).toBe(true);
    await pointAt(app, { x: 2, y: 2 });
    await desktop.waitForTimeout(200);
    expect(await passing()).toBe(true);
    await expect(drop).toHaveAttribute("data-says", "rest");

    // On it, it takes the pointer and grows to say what a press does, with the shortcut's keys.
    await pointAt(app, { x: rest.x + rest.width - 4, y: rest.y + rest.height / 2 });
    await expect.poll(passing).toBe(false);
    await expect(drop).toHaveAttribute("data-says", "job");
    await expect(drop).toContainText("Give Berry a job");
    await expect(drop.locator("kbd")).toHaveText([process.platform === "darwin" ? "⌥" : "Alt", "Space"]);
    const pointed = (await drop.boundingBox())!;
    expect(Math.round(pointed.height)).toBe(36);
    expect(pointed.width).toBeGreaterThan(150);
    await pointAt(app, { x: 2, y: 2 });
    await expect.poll(passing).toBe(true);
    await expect(drop).toHaveAttribute("data-says", "rest", { timeout: 2000 });

    // Nothing is going on, so a press opens the box.
    await drop.click();
    await expect.poll(() => showing(app, "composer")).toBe(true);
    const panel = await findView(app, "view=composer");
    await expect(panel.getByRole("textbox", { name: "Give Berry a job" })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("dragging the drop takes it to the nearest edge, and it's saved there", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
    const desktop = await findView(app, "view=desktop");
    const drop = dropIn(desktop);
    await expect(drop).toHaveAttribute("data-says", "rest");
    await pointAt(app, { x: -1000, y: -1000 });
    const smallWindow = await desktop.evaluate(() => [innerWidth, innerHeight]);

    const box = (await drop.boundingBox())!;
    const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await desktop.mouse.move(grab.x, grab.y);
    await desktop.mouse.down();
    await desktop.mouse.move(grab.x - 30, grab.y);
    await expect.poll(() => desktop.evaluate(() => innerWidth)).toBeGreaterThan(defined(smallWindow[0]));
    // Let go at the far top, as the app sees the pointer.
    await app.evaluate(({ screen }) => {
      const { workArea } = screen.getPrimaryDisplay();
      screen.getCursorScreenPoint = () => ({ x: workArea.x + workArea.width / 2, y: workArea.y + 5 });
    });
    await desktop.mouse.up();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).desktopBerrySpot?.edge)
      .toBe("top");
    await expect(drop).toHaveAttribute("data-edge", "top");
    // Back in a window of its own size, and a press after a drag opens nothing.
    expect(await showing(app, "composer")).toBe(false);
    await pointAt(app, { x: -1000, y: -1000 });
    await expect
      .poll(async () => {
        const rest = (await drop.boundingBox())!;
        return [Math.round(rest.width), Math.round(rest.height), Math.round(rest.y)];
      })
      .toEqual([32, 28, 0]);
  } finally {
    await app.close();
  }
});
