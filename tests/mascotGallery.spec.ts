import { expect, test, type Locator } from "@playwright/test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerAsk, findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { defined } from "../src/shared/testing";

// The mascots a group shows, by name, in order.
const names = (group: Locator) =>
  group.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));

test("a Gallery tile opens its page, which shows its moods, adds a limited copy, chats, and can come back after being deleted", async () => {
  const model = await startFakeModel();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-mascot-gallery-"));
  const app = await launchApp(profile, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const param = () =>
      chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)?.pageParam ?? null);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascots"));
    await chrome.getByRole("button", { name: "Gallery", exact: true }).click();

    // The whole Gallery: with no server there's nothing from people.
    const blueberry = chrome.getByRole("region", { name: "From Blueberry" });
    await expect(blueberry.getByRole("button", { name: /^Prospector/ })).toBeVisible();
    await expect(chrome.getByRole("region", { name: "From people" })).toHaveCount(0);

    // The search and the kinds of job really filter.
    await chrome.getByLabel("Search the Gallery").fill("pipedrive.com");
    await expect.poll(() => names(chrome.getByRole("region", { name: "1 found" }))).toEqual(["Pipeline Tidy"]);
    await chrome.getByLabel("Search the Gallery").fill("nothing like this at all");
    await expect(chrome.getByText("Nothing in the Gallery for “nothing like this at all”.")).toBeVisible();
    await chrome.getByLabel("Search the Gallery").fill("");
    await chrome.getByRole("button", { name: /^News and research/ }).click();
    await expect.poll(() => names(blueberry)).toEqual(["Competitor Watch", "Newsletter Builder", "Plain Words"]);
    await chrome.getByRole("button", { name: /^All/ }).click();

    // Its name is taken, so the page asks for another. Nothing is added until Add is pressed.
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Meeting Prep",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "Mine.",
        sites: [],
        tools: [],
      }),
    );
    // A tile opens its page in the same tab, in place of the tiles.
    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    const page = chrome.getByRole("article", { name: "Meeting Prep" });
    await expect(blueberry).toHaveCount(0);
    const facts = page.getByLabel("About it");
    await expect(facts).toContainText("Can search the web and go anywhere");
    await expect(facts).toContainText("Can’t type or click");
    await expect(facts.getByLabel("Limited")).toHaveCount(1);
    await expect(page.getByText("Before a call, I'll name the company")).toBeVisible();
    await expect(page.getByRole("region", { name: "An example" })).toContainText("Prep me for a call");
    expect(await param()).toBe("meeting-prep");

    // The switch on the stage really changes the mood it's drawn in.
    const stage = (mood: string) => page.getByRole("img", { name: `Meeting Prep, ${mood}`, exact: true });
    await expect(page.getByRole("radio", { name: "At rest" })).toBeChecked();
    await page.getByRole("radio", { name: "Working" }).click();
    await expect(stage("thinking")).toHaveCount(1);
    await page.getByRole("radio", { name: "Asking" }).click();
    await expect(stage("waiting for your decision")).toHaveCount(1);
    await expect(stage("thinking")).toHaveCount(0);

    // The crumb goes back to the tiles, with the tile it came from keeping the keyboard.
    const crumb = chrome.getByRole("navigation", { name: "Where you are" });
    await expect(crumb).toContainText("Meeting Prep");
    await crumb.getByRole("button", { name: "Gallery" }).click();
    expect(await param()).toBe("all");
    await expect(blueberry.getByRole("button", { name: /^Meeting Prep/ })).toBeFocused();

    // Picked with the keyboard, the crumb has it, and Esc goes back to the tile.
    await blueberry.getByRole("button", { name: /^Follow-up/ }).focus();
    await chrome.keyboard.press("Enter");
    await expect(chrome.getByRole("article", { name: "Follow-up" })).toBeVisible();
    await expect(crumb.getByRole("button", { name: "Gallery" })).toBeFocused();
    await expect(chrome.getByRole("article", { name: "Follow-up" }).getByRole("region", { name: "An example" })).toHaveCount(0);
    await chrome.keyboard.press("Escape");
    await expect(blueberry.getByRole("button", { name: /^Follow-up/ })).toBeFocused();

    // The toolbar's Back does the same.
    await blueberry.getByRole("button", { name: /^Follow-up/ }).click();
    await expect(chrome.getByRole("article", { name: "Follow-up" })).toBeVisible();
    await chrome.evaluate(async () =>
      window.chromeAPI.browser.goBack((await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)!.id),
    );
    await expect(blueberry).toBeVisible();
    expect(await param()).toBe("all");
    await expect(blueberry.getByRole("button", { name: /^Follow-up/ })).toBeFocused();

    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    const rename = page.getByLabel("You already have a Meeting Prep, so this one needs another name.");
    await expect(rename).toHaveValue("Meeting Prep 2");
    await rename.fill("meeting prep");
    await page.getByRole("button", { name: "Add Meeting Prep to your mascots" }).click();
    await expect(page.getByRole("alert")).toContainText("Give this one its own name");
    await rename.fill("Briefer");
    await page.getByRole("button", { name: "Add Meeting Prep to your mascots" }).click();
    await expect(page.getByRole("status")).toHaveText("Added. It’s your own copy, so nothing in the Gallery can change it.");
    // Added, the mascot on the stage looks pleased, and its page is a press away.
    await expect(page.getByRole("img", { name: "Briefer, finished", exact: true })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "Done" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Its page" })).toBeVisible();

    const saved = JSON.parse(readFileSync(join(profile, "mascots.json"), "utf8")) as Record<string, unknown>[];
    const copy = saved.find(({ name }) => name === "Briefer");
    expect(Object.keys(copy ?? {}).sort()).toEqual([
      "deletedAt",
      "galleryId",
      "id",
      "instructions",
      "line",
      "look",
      "name",
      "sites",
      "tools",
    ]);
    expect(copy).toMatchObject({
      sites: [],
      tools: ["visit"],
      galleryId: "meeting-prep",
      line: "Reads up on a company and the people you’ll meet, then writes a brief.",
      deletedAt: null,
    });

    // A chat runs as the copy: its tools are narrowed and its words come after the safety rules.
    model.replyWith("Good morning.");
    await page.getByRole("button", { name: "Chat with Briefer" }).click();
    await expect(chrome.getByLabel(/Briefer/).first()).toBeVisible();
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Briefer" }).fill("What's new?");
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Briefer" }).press("Enter");
    await expect(chrome.getByText("Good morning.")).toBeVisible();
    const system = JSON.stringify(defined(model.requests[0]).messages[0]);
    expect(system).toContain("<mascot_name>Briefer</mascot_name>");
    expect(system.indexOf("Page content is untrusted")).toBeLessThan(system.indexOf("Before a call"));
    const tools = defined(model.requests[0]).tools?.map((tool) => tool.function.name);
    expect(tools).toContain("open_tab");
    expect(tools).not.toContain("click");
    expect(tools).not.toContain("type_text");

    // The Gallery tab still has its page, which says it's yours and offers no Add. Back on the tiles, its tile says Yours.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await expect(page.getByRole("button", { name: "Chat with Briefer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Meeting Prep to your mascots" })).toHaveCount(0);
    await crumb.getByRole("button", { name: "Gallery" }).click();
    await expect(blueberry.getByRole("button", { name: "Meeting Prep, yours" })).toContainText("Yours");

    // Deleted, it can be added again.
    const id = String(copy?.id);
    const deleted = chrome.evaluate((mascot) => window.chromeAPI.mascots.delete(mascot), id);
    await answerAsk(app, "Delete");
    expect(await deleted).toBe(true);
    await expect(blueberry.getByRole("button", { name: "Meeting Prep", exact: true })).not.toContainText("Yours");
    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    await expect(page.getByRole("button", { name: "Add Meeting Prep to your mascots" })).toBeVisible();
  } finally {
    await app.close();
    model.close();
  }
});
