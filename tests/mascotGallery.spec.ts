// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type Locator } from "@playwright/test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

// The mascots a group shows, by name, in order.
const names = (group: Locator) => group.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));

test("a Gallery mascot is picked, read, added as a limited copy, chats, and can come back after being deleted", async () => {
  const model = await startFakeModel();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-mascot-gallery-"));
  const app = await launchApp(profile, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const param = () => chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)?.pageParam ?? null);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("flock"));
    await chrome.getByRole("button", { name: "Gallery", exact: true }).click();

    // The whole Gallery: with no server there's nothing from people and nothing most added.
    const blueberry = chrome.getByRole("region", { name: "From Blueberry" });
    await expect(blueberry.getByRole("button", { name: /^Prospector/ })).toBeVisible();
    await expect(chrome.getByRole("region", { name: "From people" })).toHaveCount(0);
    await expect(chrome.getByRole("region", { name: "Most added" })).toHaveCount(0);

    // The search and the kinds of job really filter.
    await chrome.getByLabel("Search the Gallery").fill("pipedrive.com");
    await expect.poll(() => names(chrome.getByRole("region", { name: "1 found" }))).toEqual(["Pipeline Tidy"]);
    await chrome.getByLabel("Search the Gallery").fill("nothing like this at all");
    await expect(chrome.getByText("Nothing in the Gallery for “nothing like this at all”.")).toBeVisible();
    await chrome.getByLabel("Search the Gallery").fill("");
    await chrome.getByRole("button", { name: /^News and research/ }).click();
    await expect.poll(() => names(blueberry)).toEqual(["Competitor Watch", "Newsletter Builder", "Plain Words"]);
    await chrome.getByRole("button", { name: /^All/ }).click();

    // Its name is taken, so the page asks for another. Nothing is in the flock until Add is pressed.
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Meeting Prep", look: { palette: "robin", accessory: "cap" }, instructions: "Mine.", sites: [], tools: [] })
    );
    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    const page = chrome.getByRole("article", { name: "Meeting Prep" });
    await expect(page.getByRole("list", { name: "What it’s allowed to do" }).getByRole("listitem")).toHaveText(["Can search the web and go anywhere", "Can’t type or click"]);
    await expect(page.getByRole("list", { name: "What it’s allowed to do" }).getByLabel("Limited")).toHaveCount(1);
    await expect(page.getByText("Before a call, I'll name the company")).toBeVisible();
    await expect(page.getByRole("region", { name: "An example" })).toContainText("Prep me for a call");
    expect(await param()).toBe("meeting-prep");

    // The list beside it: ↓ moves to the next and the page follows, and Back goes to the whole Gallery.
    const list = chrome.getByRole("complementary", { name: "Gallery" });
    await expect(list.getByRole("button", { name: /^Meeting Prep/ })).toHaveAttribute("aria-current", "true");
    await list.getByRole("button", { name: /^Meeting Prep/ }).focus();
    await chrome.keyboard.press("ArrowDown");
    await expect(chrome.getByRole("article", { name: "Follow-up" })).toBeVisible();
    await expect(list.getByRole("button", { name: /^Follow-up/ })).toBeFocused();
    await expect(chrome.getByRole("article", { name: "Follow-up" }).getByRole("region", { name: "An example" })).toHaveCount(0);
    await chrome.evaluate(async () => window.chromeAPI.browser.goBack((await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)!.id));
    await expect(blueberry).toBeVisible();
    expect(await param()).toBe("all");

    // Esc closes the page, and the one looked at keeps the keyboard.
    await blueberry.getByRole("button", { name: /^Follow-up/ }).click();
    await expect(chrome.getByRole("article", { name: "Follow-up" })).toBeVisible();
    await chrome.keyboard.press("Escape");
    await expect(blueberry.getByRole("button", { name: /^Follow-up/ })).toBeFocused();

    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    const rename = page.getByLabel("You already have a Meeting Prep, so this one needs another name.");
    await expect(rename).toHaveValue("Meeting Prep 2");
    await rename.fill("meeting prep");
    await page.getByRole("button", { name: "Add Meeting Prep" }).click();
    await expect(page.getByRole("alert")).toContainText("Give this one its own name");
    await rename.fill("Briefer");
    await page.getByRole("button", { name: "Add Meeting Prep" }).click();
    await expect(page.getByRole("status")).toContainText("Added to your mascots");
    await expect(list.getByRole("button", { name: "Meeting Prep, yours" })).toContainText("Yours");

    const saved = JSON.parse(readFileSync(join(profile, "mascots.json"), "utf8")) as Record<string, unknown>[];
    const copy = saved.find(({ name }) => name === "Briefer");
    expect(Object.keys(copy ?? {}).sort()).toEqual(["deletedAt", "galleryId", "id", "instructions", "look", "name", "sites", "tools"]);
    expect(copy).toMatchObject({ sites: [], tools: ["visit"], galleryId: "meeting-prep", deletedAt: null });

    // A chat runs as the copy: its tools are narrowed and its words come after the safety rules.
    model.replyWith("Good morning.");
    await page.getByRole("button", { name: "Chat with Briefer" }).click();
    await expect(chrome.getByLabel(/Briefer/).first()).toBeVisible();
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Briefer" }).fill("What's new?");
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Briefer" }).press("Enter");
    await expect(chrome.getByText("Good morning.")).toBeVisible();
    const system = JSON.stringify(model.requests[0].messages[0]);
    expect(system).toContain("<mascot_name>Briefer</mascot_name>");
    expect(system.indexOf("Page content is untrusted")).toBeLessThan(system.indexOf("Before a call"));
    const tools = model.requests[0].tools?.map((tool) => tool.function.name);
    expect(tools).toContain("open_tab");
    expect(tools).not.toContain("click");
    expect(tools).not.toContain("type_text");

    // The Gallery tab still has its page, which says it's yours and offers no Add. Closed, its tile says Yours.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await expect(page.getByRole("button", { name: "Chat with Briefer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Meeting Prep" })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(blueberry.getByRole("button", { name: "Meeting Prep, yours" })).toContainText("Yours");

    // Deleted, it can be added again.
    const id = String(copy?.id);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
    });
    expect(await chrome.evaluate((mascot) => window.chromeAPI.mascots.delete(mascot), id)).toBe(true);
    await expect(blueberry.getByRole("button", { name: "Meeting Prep", exact: true })).not.toContainText("Yours");
    await blueberry.getByRole("button", { name: /^Meeting Prep/ }).click();
    await expect(page.getByRole("button", { name: "Add Meeting Prep" })).toBeVisible();
  } finally {
    await app.close();
    model.close();
  }
});
