// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { FAKE_BOT_TOKEN, startFakeTelegram } from "./fakeTelegram";

const startSite = async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    const page = /code|boxes/.test(request.url ?? "") ? "code.html" : "login.html";
    response.end(readFileSync(join(__dirname, "../evals/fixtures", page)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

test("an approval answered from Needs you lets the job carry on", async () => {
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Needs you" }).click();
    await expect(chrome.getByText("Nothing needs you right now.")).toBeVisible();

    const address = `${site.origin}/orders?from=inbox`;
    model.callTools({ name: "open_tab", args: { url: address } });
    model.replyWith("All done");
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Open my orders", { seePage: false }));

    const row = chrome.getByRole("listitem", { name: "Berry is asking" });
    // The row names the site, and the exact address is right there before Allow.
    await expect(row.getByRole("heading")).toHaveText("Open 127.0.0.1 in a new tab");
    await expect(row.getByText(`Open ${address} in a new tab`)).toBeAttached();
    await expect(chrome.getByRole("button", { name: /Needs you.*1 waiting/ })).toBeVisible();
    await row.getByRole("button", { name: "Allow", exact: true }).click();

    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content).toBe("All done");
    await expect(chrome.getByText("Nothing needs you right now.")).toBeVisible();
    // Its tab closed once it was done.
    expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).some((tab) => tab.url === address)).toBe(false);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("a sign-in goes to the user, nothing typed reaches the model, and I'm done gives the tab back", async () => {
  const SECRET = "correct-horse-battery-staple";
  const site = await startSite();
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const address = `${site.origin}/account`;
    model.callTools({ name: "open_tab", args: { url: address } });
    model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Check my orders", { seePage: false }));
    await chrome.getByRole("button", { name: "Needs you" }).click();

    const row = chrome.getByRole("listitem", { name: "Berry is asking" });
    await expect(row.getByRole("heading")).toHaveText("Berry needs you to sign in on 127.0.0.1");
    const asked = model.requests.length;

    // The user goes there, signs in by themselves, and Berry can't reach the tab meanwhile, even from another chat.
    await row.getByRole("button", { name: "Go to the tab" }).click();
    const page = await findView(app, address);
    await page.locator("#email").fill("ada@example.com");
    await page.locator("#password").fill(SECRET);
    await page.locator("#password").press("Enter");
    await expect(page.getByText("Order 4471")).toBeVisible();

    const tab = (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find(({ url }) => url === address)!;
    expect(tab.isActive).toBe(true);
    await expect(chrome.getByText("Berry can’t see this tab")).toBeVisible();
    model.callTools({ name: "read_page", args: { tabId: tab.id } });
    model.replyWith("Tried");
    const other = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "What's on this page?", { seePage: true }));
    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), other!.id))?.messages.at(-1)?.content).toBe("Tried");
    const seenFromOtherChat = JSON.stringify(model.requests.slice(asked));
    expect(seenFromOtherChat).not.toContain("Order 4471");
    expect(seenFromOtherChat).toContain("something private");
    expect(seenFromOtherChat).not.toContain("<page url");
    const before = model.requests.length;

    // "I'm done", from the toolbar on that tab, and Berry reads the page again.
    model.callTools({ name: "read_page", args: {} });
    model.replyWith("Order 4471 arrives on Tuesday");
    await chrome.getByRole("button", { name: "I’m done" }).click();
    await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.messages.at(-1)?.content).toBe("Order 4471 arrives on Tuesday");
    const resumed = JSON.stringify(model.requests.slice(before));
    expect(resumed).toContain("yours again");
    expect(resumed).toContain("Order 4471");
    expect(JSON.stringify(model.requests)).not.toContain(SECRET);
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});

test("from the phone: pair, press Allow, and a code goes in the page without ever reaching the model", async () => {
  const CODE = "482913";
  const BOX_CODE = "705162";
  const site = await startSite();
  const model = await startFakeModel();
  const telegram = await startFakeTelegram();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-test-"));
  const app = await launchApp(profile, { modelEnv: { ...model.env, ...telegram.env } });
  let output = "";
  app.process().stdout?.on("data", (data) => (output += data));
  app.process().stderr?.on("data", (data) => (output += data));
  try {
    const chrome = await findView(app, "view=chrome");
    const phone = () => chrome.evaluate(() => window.chromeAPI.phone.state());
    const reply = (id: string) => chrome.evaluate((chat) => window.chromeAPI.library.getChat(chat), id);
    const lastSent = async (words: string) => {
      await expect.poll(() => telegram.sent.at(-1)?.text ?? "").toContain(words);
      return telegram.sent.at(-1)!;
    };

    // Off by default, and a bad token saves nothing.
    expect((await phone()).status).toBe("off");
    expect((await chrome.evaluate(() => window.chromeAPI.phone.connect("nonsense"))).status).toBe("off");

    // Pairing: only the one-time link counts, and only from the chat that first uses it.
    const pairing = await chrome.evaluate((token) => window.chromeAPI.phone.connect(token), FAKE_BOT_TOKEN);
    expect(pairing.status).toBe("pairing");
    expect(JSON.stringify(pairing)).not.toContain(FAKE_BOT_TOKEN);
    const start = new URL(pairing.pairLink!).searchParams.get("start")!;
    telegram.userSends("/start wrong-token");
    await expect.poll(() => telegram.polls).toBeGreaterThan(2);
    expect((await phone()).status).toBe("pairing");
    telegram.userSends(`/start ${start}`);
    await expect.poll(async () => (await phone()).status).toBe("connected");
    await lastSent("Connected.");
    const known = telegram.sent.length;
    telegram.strangerSends("Hello");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ phoneAlways: true }));
    await chrome.getByRole("button", { name: "Needs you" }).click();
    await expect(chrome.getByText("Replies from your phone are on")).toBeVisible();
    expect(telegram.sent.length).toBe(known);

    // An approval, in the same words as the card, answered with a button.
    const address = `${site.origin}/code?from=inbox`;
    model.callTools({ name: "open_tab", args: { url: address } });
    model.callTools({ name: "hand_to_user", args: { need: "code" } });
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Check my orders", { seePage: false }));
    const asked = await lastSent(`Open ${address} in a new tab`);
    expect(asked.buttons.map(({ text }) => text)).toEqual(["Allow", "Don’t allow"]);
    telegram.userPresses(asked.buttons[0], asked.message_id);
    await expect.poll(() => telegram.editsOf.get(asked.message_id) ?? "").toContain("Allowed. Berry carries on.");
    expect(telegram.answeredCallbacks).toContain(`press-${asked.message_id}`);

    // A code: anything that isn't one is refused and nothing is typed.
    const code = await lastSent("Berry needs a code for 127.0.0.1. Reply with it.");
    expect(code.buttons).toEqual([]);
    const row = chrome.getByRole("listitem", { name: "Berry is asking" });
    await expect(row.getByRole("heading")).toHaveText("Berry needs a code for 127.0.0.1");
    const notACode = telegram.userSends("hunter2 is my password");
    await lastSent("doesn’t look like a code");
    await expect.poll(() => telegram.deleted).toContain(notACode);
    const page = await findView(app, address);
    await expect(page.locator("#code")).toHaveValue("");

    // The real one goes in the page, and the job carries on. This page repeats it back, in its words and its title.
    model.callTools({ name: "read_page", args: {} });
    model.callTools({ name: "screenshot", args: {} });
    model.callTools({ name: "open_tab", args: { url: `${site.origin}/boxes` } });
    model.callTools({ name: "hand_to_user", args: { need: "code" } });
    const codeMessage = telegram.userSends(CODE);
    await expect(page.getByText(`Verified with code ${CODE}`)).toBeVisible();
    await expect.poll(() => telegram.deleted).toContain(codeMessage);
    await expect.poll(() => telegram.editsOf.get(code.message_id) ?? "").toContain("Entered the code on 127.0.0.1");

    // One box per digit, with real keys, in a tab behind the user. With "123 456" spacing, too.
    const boxes = await lastSent("Berry needs a code for 127.0.0.1. Reply with it.");
    expect(boxes.message_id).not.toBe(code.message_id);
    model.callTools({ name: "read_page", args: {} });
    model.replyWith("All done");
    // Held, since its tabs close once it's done.
    const finish = model.holdBeforeFirstToken();
    telegram.userSends(`${BOX_CODE.slice(0, 3)} ${BOX_CODE.slice(3)}`, boxes.message_id);
    const boxPage = await findView(app, `${site.origin}/boxes`);
    await expect(boxPage.getByText(`Verified with code ${BOX_CODE}`)).toBeVisible();
    finish();
    await expect.poll(async () => (await reply(sent!.id))?.messages.at(-1)?.content).toBe("All done");

    // The job really read those pages again, and neither code went anywhere it shouldn't.
    const seen = JSON.stringify(model.requests) + JSON.stringify(model.titleRequests);
    expect(seen).toContain("A code was entered");
    expect(seen).toContain("Order 4471");
    expect(seen).toContain("Screenshots of tab");
    expect(seen).not.toContain("data:image/");
    for (const secret of [CODE, BOX_CODE, `${BOX_CODE.slice(0, 3)} ${BOX_CODE.slice(3)}`]) {
      expect(seen).not.toContain(secret);
      expect(JSON.stringify(await reply(sent!.id))).not.toContain(secret);
      expect(telegram.sent.map(({ text }) => text).join()).not.toContain(secret);
      expect(output).not.toContain(secret);
    }
    await app.close();
    for (const file of readdirSync(profile).filter((name) => /^(chats|phone|settings|session)/.test(name))) {
      const saved = readFileSync(join(profile, file)).toString("latin1");
      expect(saved).not.toContain(FAKE_BOT_TOKEN);
      if (file.startsWith("chats")) {
        expect(saved).not.toContain(CODE);
        expect(saved).not.toContain(BOX_CODE);
      }
    }
    expect(output).not.toContain(FAKE_BOT_TOKEN);
  } finally {
    await app.close();
    model.close();
    telegram.close();
    site.close();
  }
});
