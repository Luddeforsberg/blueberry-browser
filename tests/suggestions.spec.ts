import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoVisits, seedChats } from "../evals/seedHistory";
import { HistoryStore } from "../src/main/library/HistoryStore";
import { ChatStore } from "../src/main/chats/ChatStore";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { DEMO_LINES, REFUSED_LINES, demoProposals } from "./suggestionReplies";
import { defined } from "../src/shared/testing";

test("only suggestions whose evidence checks out show, a row fills things in, and one dismissed stays gone", async () => {
  test.setTimeout(60_000);
  const model = await startFakeModel();
  model.suggestFrom(demoProposals);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-suggestions-"));
  new HistoryStore(join(profile, "history.db")).importVisits(demoVisits());
  seedChats(profile);
  // A chat that finished while the user was somewhere else, and that they haven't opened since.
  const store = new ChatStore(join(profile, "chats.db"));
  const unread = store.createChat("Flats on Södermalm");
  store.addMessage(unread, { role: "user", content: "Find flats on Södermalm" });
  store.addMessage(unread, { role: "assistant", content: "## Five flats\n\nThe newest is a **two-room** flat on Hornsgatan." });
  store.setSeen(unread, false);

  let app = await launchApp(profile, { modelEnv: model.env });
  try {
    let chrome = await findView(app, "view=chrome");
    const composer = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
    const list = () => chrome.getByRole("region", { name: "suggestions" });
    const row = (title: string) => list().getByRole("button").filter({ hasText: title });

    // The page doesn't wait for the model, and only what checks out comes from it.
    await expect(chrome.getByText(DEMO_LINES.routine)).toBeVisible({ timeout: 20_000 });
    // The chat the user hasn't looked at comes first, then the three that checked out. Chats already seen aren't offered.
    await expect(list().getByRole("listitem")).toHaveCount(4);
    await expect(list().getByRole("listitem").first()).toContainText("Flats on Södermalm");
    for (const line of Object.values(DEMO_LINES)) await expect(chrome.getByText(line)).toBeVisible();
    for (const line of REFUSED_LINES) await expect(chrome.getByText(line)).toHaveCount(0);
    // Not just left off the page: only these got past the checks.
    const saved = JSON.parse(readFileSync(join(profile, "suggestions.json"), "utf8")) as { proposals: Array<{ card: { title: string } }> };
    expect(saved.proposals.map(({ card }) => card.title).sort()).toEqual(Object.values(DEMO_LINES).sort());

    const sent = JSON.stringify(defined(model.suggestionRequests[0]).messages);
    expect(sent).toContain("news.ycombinator.com");
    expect(sent).toContain("Cheap flights to Lisbon");
    expect(sent).not.toContain("sore throat");
    expect(sent).not.toContain("Swedbank");
    expect(sent).not.toContain("Inbox");
    expect(sent).not.toContain("/pull/412");

    // Resting on a row shows all of it to read: the words that would go in the box, and for a finished chat the start
    // of its reply, as plain words.
    const words = DEMO_LINES.prompt;
    const peek = list().getByRole("tooltip");
    await row(words).hover();
    await expect(peek).toContainText("list the newest five with price and size");
    await row("Flats on Södermalm").hover();
    await expect(peek).toHaveText("Five flats The newest is a two-room flat on Hornsgatan.");

    // A prompt waits in the composer with the cursor ready, and nothing has gone to the main model.
    await row(words).click();
    await expect(composer).not.toHaveValue("");
    await expect(composer).toBeFocused();
    const { caret, length } = await composer.evaluate((box: HTMLTextAreaElement) => ({
      caret: box.selectionStart,
      length: box.value.length,
    }));
    expect(caret).toBe(length);
    expect(model.requests).toHaveLength(0);

    // Filled in and left for the user to save.
    await row(DEMO_LINES.routine).click();
    // The same steps as making one, with its answers filled in.
    await expect(chrome.getByRole("heading", { name: "What should I do?" })).toBeVisible();
    await expect(chrome.getByRole("textbox", { name: "What should I do?" })).not.toHaveValue("");
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByLabel("Other time")).toHaveValue("08:15");
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.routines).toHaveLength(0);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await row(DEMO_LINES.mascot).click();
    // The same steps as making one, with its answers filled in.
    await expect(chrome.getByRole("heading", { name: "What do I look like?" })).toBeVisible();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByRole("textbox", { name: "Name" })).toHaveValue("Linus");
    await chrome.getByRole("button", { name: "Continue" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();
    await expect(chrome.getByRole("list", { name: "Sites it may use" }).getByRole("listitem")).toHaveText([
      "github.com",
      "linear.app",
      "Add a site",
    ]);

    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await chrome.getByRole("button", { name: `Not now: ${words}` }).click();
    await expect(chrome.getByRole("button", { name: `Not now: ${words}` })).toHaveCount(0);
    // Not now on a finished chat counts as having seen it, so it isn't offered again.
    await chrome.getByRole("button", { name: "Not now: Flats on Södermalm" }).click();
    await expect(row("Flats on Södermalm")).toHaveCount(0);
    await expect
      .poll(() =>
        chrome.evaluate(async (id) => (await window.chromeAPI.library.getLibrary()).chats.find((chat) => chat.id === id)?.unseen, unread),
      )
      .toBe(false);

    await app.close();
    const asked = model.suggestionRequests.length;
    app = await launchApp(profile, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());

    await expect(row(DEMO_LINES.mascot)).toBeVisible();
    await expect(chrome.getByRole("button", { name: `Not now: ${words}` })).toHaveCount(0);
    await expect(row("Flats on Södermalm")).toHaveCount(0);
    expect(model.suggestionRequests).toHaveLength(asked);
  } finally {
    await app.close();
    model.close();
  }
});
