import { expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerAsk, findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const startSite = async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Flights</title><p>Flights</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

test("the address field is the status of a job in the tab in front: working, taken over, and waiting with Answer", async () => {
  test.setTimeout(90_000);
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const job = async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => !!tab.jobChatId);
    const field = chrome.getByRole("status").filter({ hasText: /Thinking|Waiting for you/ });

    // A job opens a page and then thinks for a while there.
    model.thinkFor(6000);
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/flights` } });
    model.replyWith("Done.");
    await chrome.evaluate((text) => window.chromeAPI.chat.send(null, text, { seePage: false }), `Look at ${site.origin}/flights`);
    await expect.poll(job, { timeout: 20_000 }).toBeTruthy();
    await chrome.evaluate(async (id) => window.chromeAPI.browser.switchTab(id), (await job())!.id);

    // Going there to watch doesn't take it over: the field says it's working, with Take over and Stop.
    await expect(field).toContainText("Thinking..");
    await expect(field.getByRole("button", { name: "Take over" })).toBeVisible();
    await expect(field.getByRole("button", { name: "Stop Berry" })).toBeVisible();

    // Take over does what clicking in the page does: the job can't reach the tab, and the field is the address again.
    const taken = (await job())!.id;
    await field.getByRole("button", { name: "Take over" }).click();
    await expect(chrome.getByRole("button", { name: "Address" })).toBeVisible();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.id === taken)?.berryWorking)
      .toBe(false);
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.some((chat) => chat.running), {
        timeout: 20_000,
      })
      .toBe(false);

    // Next, a job that waits to go to an address with data in it: the field says so, and Answer opens its chat.
    model.thinkFor(0);
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/flights` } });
    model.callTools({ name: "go_to", args: { url: `${site.origin}/flights?from=ARN&to=LIS` } });
    model.replyWith("Done.");
    const sent = await chrome.evaluate(
      (text) => window.chromeAPI.chat.send(null, text, { seePage: false }),
      `Find flights on ${site.origin}/flights`,
    );
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).needsYou.length, { timeout: 20_000 })
      .toBe(1);
    await chrome.evaluate(async (id) => window.chromeAPI.browser.switchTab(id), (await job())!.id);
    await expect(field).toContainText("Waiting for you");
    await field.getByRole("button", { name: "Answer" }).click();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.isActive)?.pageParam)
      .toBe(sent!.id);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("choosing a mascot on the new tab changes the pill, the greeting and the limits line, and not the chats begun", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "News.",
        sites: ["svt.se"],
        tools: ["visit"],
      }),
    );
    const pill = chrome.getByRole("button", { name: /Choose who to ask/ });
    const limits = chrome.getByText("Only visits svt.se.");
    await expect(pill).toHaveAccessibleName("Asking Berry. Choose who to ask");
    // Berry has no limits, so there's no line.
    await expect(limits).toBeHidden();

    // From the keyboard: the menu opens on the current one, and Escape gives the pill its focus back.
    await pill.focus();
    await chrome.keyboard.press("ArrowDown");
    await expect(chrome.getByRole("menuitemradio", { name: /^Berry/ })).toBeFocused();
    await chrome.keyboard.press("Escape");
    await expect(pill).toBeFocused();

    await pill.click();
    await chrome.getByRole("menuitemradio", { name: /^Scout/ }).click();
    await expect(pill).toHaveAccessibleName("Asking Scout. Choose who to ask");
    await expect(chrome.getByRole("heading", { name: "Where to?" }).getByRole("img", { name: /^Scout/ })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" })).toHaveAttribute(
      "placeholder",
      "Ask Scout, or type an address",
    );
    await expect(limits).toBeVisible();
    expect((await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).chosenMascotId).not.toBeNull();

    await pill.click();
    await chrome.getByRole("menuitemradio", { name: /^Berry/ }).click();
    await expect(pill).toHaveAccessibleName("Asking Berry. Choose who to ask");
    await expect(limits).toBeHidden();
  } finally {
    await app.close();
  }
});

test("a new profile starts with four mascots beside Berry, once, and a deleted one stays gone", async () => {
  // Two launches, and a fresh profile adding its starters.
  test.setTimeout(60_000);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-starters-"));
  let app = await launchApp(profile, { starters: true });
  try {
    let chrome = await findView(app, "view=chrome");
    const starters = ["Berry", "Plain Words", "Competitor Watch", "Meeting Prep", "Newsletter Builder"];
    const dock = () => chrome.getByRole("list", { name: "Your mascots" }).getByRole("button");
    await expect(dock()).toHaveCount(starters.length);
    for (const [index, name] of starters.entries()) await expect(dock().nth(index)).toHaveAccessibleName(new RegExp(`^${name}`));
    await chrome.getByRole("button", { name: /Choose who to ask/ }).click();
    await expect(chrome.getByRole("menuitemradio")).toHaveCount(starters.length);
    await chrome.keyboard.press("Escape");

    // The starters with an example from a real run are there to try. Pressing one chooses it and puts its example in
    // the box, and the rows stay where they were.
    const suggestions = chrome.getByRole("region", { name: "suggestions" }).getByRole("listitem");
    await expect(suggestions).toHaveCount(2);
    await expect(suggestions.nth(0)).toContainText("Competitor Watch");
    await expect(suggestions.nth(1)).toContainText("Meeting Prep");
    await suggestions.nth(1).getByRole("button").click();
    await expect(chrome.getByRole("button", { name: /Choose who to ask/ })).toHaveAccessibleName("Asking Meeting Prep. Choose who to ask");
    const box = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
    await expect(box).toHaveValue("Prep me for a call with Spotify's ads team.");
    await expect(box).toBeFocused();
    await expect(suggestions.nth(0)).toContainText("Competitor Watch");
    // Nothing went anywhere: the box waits for the user.
    expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats).toEqual([]);
    await box.fill("");

    const plainWords = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find(
      (mascot) => mascot.name === "Plain Words",
    )!;
    // Deleting asks first, in our own card, which only the person at the computer can press.
    const deleted = chrome.evaluate((id) => window.chromeAPI.mascots.delete(id), plainWords.id);
    await answerAsk(app, "Delete");
    expect(await deleted).toBe(true);
    await app.close();
    app = await launchApp(profile, { starters: true });
    chrome = await findView(app, "view=chrome");
    await expect(dock()).toHaveCount(starters.length - 1);
    await expect(chrome.getByRole("list", { name: "Your mascots" }).getByRole("button", { name: /^Plain Words/ })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("in the horizontal layout, Chats and a mascot's card open over a web page, give the keyboard back, and open a chat or a new one", async () => {
  test.setTimeout(60_000);
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "News.",
        sites: ["svt.se"],
        tools: ["visit"],
      }),
    );
    model.titleWith("Flights to Lisbon");
    model.replyWith("Three flights.");
    const chat = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Find flights to Lisbon", { seePage: false }));
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.some((each) => each.running))
      .toBe(false);
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${site.origin}/`);
    await (await findView(app, `${site.origin}/`)).waitForLoadState();

    const pill = chrome.getByRole("button", { name: /^Chats/ });
    await pill.click();
    const overlay = await findView(app, "view=overlay");
    const panel = overlay.getByRole("dialog", { name: "Chats" });
    await expect(panel).toBeVisible();
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    // Over the page: the overlay's view is showing, above the tab's view, and covers where the page is.
    const stack = await app.evaluate(({ BaseWindow, WebContentsView }) =>
      BaseWindow.getAllWindows()[0].contentView.children.map((view) => ({
        url: view instanceof WebContentsView ? view.webContents.getURL() : "",
        visible: view.getVisible(),
        bounds: view.getBounds(),
      })),
    );
    const overlayAt = stack.findIndex(({ url }) => url.includes("view=overlay"));
    const pageAt = stack.findIndex(({ url }) => url.startsWith(site.origin));
    expect(stack[overlayAt].visible).toBe(true);
    expect(overlayAt).toBeGreaterThan(pageAt);
    expect(stack[overlayAt].bounds.y).toBeLessThanOrEqual(stack[pageAt].bounds.y);

    await overlay.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(pill).toBeFocused();

    await pill.click();
    await panel.getByRole("button", { name: /^Flights to Lisbon/ }).click();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.isActive)?.pageParam)
      .toBe(chat!.id);
    await expect(panel).toBeHidden();

    // Back on the web page, a mascot's card opens over it from the dock. Escape gives its face the keyboard back.
    const web = (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.url.startsWith("http"))!;
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), web.id);
    const face = chrome.getByRole("list", { name: "Your mascots" }).getByRole("button", { name: "Scout" });
    await face.click();
    const card = overlay.getByRole("dialog", { name: "Scout" });
    await expect(card).toBeVisible();
    await expect(face).toHaveAttribute("aria-expanded", "true");
    await overlay.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(face).toBeFocused();
    // New chat with it: a new tab, with Scout chosen there, though the card was in another view.
    await face.click();
    await card.getByRole("button", { name: "New chat with Scout" }).click();
    await expect(card).toBeHidden();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.isActive)?.page)
      .toBe("new-tab");
    await expect(chrome.getByRole("button", { name: /Choose who to ask/ })).toHaveAccessibleName("Asking Scout. Choose who to ask");
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});
