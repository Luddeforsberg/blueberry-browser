// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

test("a Gallery mascot is reviewed, added as a limited copy, chats, and can come back after being deleted", async () => {
  const model = await startFakeModel();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-mascot-gallery-"));
  const app = await launchApp(profile, { modelEnv: model.env });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.getByRole("button", { name: "Flock", exact: true }).click();
    await chrome.getByRole("button", { name: "Browse the Gallery" }).click();
    const gallery = chrome.getByRole("list", { name: "Gallery", exact: true });
    await expect(gallery.getByRole("listitem", { name: "Prospector" })).toContainText("Can search the web and go anywhere");
    await expect(gallery.getByRole("listitem", { name: "Follow-up" })).toContainText("Only visits mail.google.com");

    // The search and the categories really filter.
    await chrome.getByLabel("Search the Gallery").fill("pipedrive.com");
    await expect(gallery.getByRole("heading")).toHaveText(["Pipeline Tidy"]);
    await chrome.getByLabel("Search the Gallery").fill("");
    await chrome.getByRole("radio", { name: "News and research" }).click();
    await expect(gallery.getByRole("heading")).toHaveText(["Competitor Watch", "Newsletter Builder", "Plain Words"]);
    await chrome.getByRole("radio", { name: "All" }).click();

    // Its name is taken, so the review asks for another. Nothing is in the flock until Add is pressed.
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Meeting Prep", look: { palette: "robin", accessory: "cap" }, instructions: "Mine.", sites: [], tools: [] })
    );
    const card = gallery.getByRole("listitem", { name: "Meeting Prep" });
    await expect(card).toContainText("Can search the web and go anywhere");
    await expect(card).toContainText("Can’t type or click");
    await expect(card).toContainText("with an example");
    await expect(gallery.getByRole("listitem", { name: "Follow-up" })).not.toContainText("with an example");
    await card.getByRole("button", { name: "Add Meeting Prep" }).click();
    await expect(chrome.getByText("Before a call, I'll name the company")).toBeVisible();
    await expect(chrome.getByRole("list", { name: "What it’s allowed to do" })).toContainText("Can search the web and go anywhere");
    await expect(chrome.getByRole("region", { name: "Example" })).toContainText("Prep me for a call");
    const rename = chrome.getByLabel("You already have a Meeting Prep. Name this one");
    await expect(rename).toHaveValue("Meeting Prep 2");
    await rename.fill("meeting prep");
    await chrome.getByRole("button", { name: "Add to flock" }).click();
    await expect(chrome.getByRole("alert")).toContainText("Give this one its own name");
    await rename.fill("Briefer");
    await chrome.getByRole("button", { name: "Add to flock" }).click();
    await expect(chrome.getByRole("heading", { name: "Briefer is in your flock" })).toBeVisible();

    const saved = JSON.parse(readFileSync(join(profile, "mascots.json"), "utf8")) as Record<string, unknown>[];
    const copy = saved.find(({ name }) => name === "Briefer");
    expect(Object.keys(copy ?? {}).sort()).toEqual(["deletedAt", "galleryId", "id", "instructions", "look", "name", "sites", "tools"]);
    expect(copy).toMatchObject({ sites: [], tools: ["visit"], galleryId: "meeting-prep", deletedAt: null });

    // A chat runs as the copy: its tools are narrowed and its words come after the safety rules.
    model.replyWith("Good morning.");
    await chrome.getByRole("button", { name: "Start a chat with Briefer" }).click();
    await expect(chrome.getByLabel(/Briefer/).first()).toBeVisible();
    await chrome.getByRole("textbox", { name: "Ask Briefer or search" }).fill("What's new?");
    await chrome.getByRole("textbox", { name: "Ask Briefer or search" }).press("Enter");
    await expect(chrome.getByText("Good morning.")).toBeVisible();
    const system = JSON.stringify(model.requests[0].messages[0]);
    expect(system).toContain("<mascot_name>Briefer</mascot_name>");
    expect(system.indexOf("Page content is untrusted")).toBeLessThan(system.indexOf("Before a call"));
    const tools = model.requests[0].tools?.map((tool) => tool.function.name);
    expect(tools).toContain("open_tab");
    expect(tools).not.toContain("click");
    expect(tools).not.toContain("type_text");

    // The card says it's added and goes straight to a chat, and adding it again isn't offered.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await expect(card).toContainText("In your flock");
    await expect(card.getByRole("button", { name: "Chat with Briefer" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Add Meeting Prep" })).toHaveCount(0);

    // Deleted, it can be added again.
    const id = String(copy?.id);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
    });
    expect(await chrome.evaluate((mascot) => window.chromeAPI.mascots.delete(mascot), id)).toBe(true);
    await expect(card.getByRole("button", { name: "Add Meeting Prep" })).toBeVisible();
  } finally {
    await app.close();
    model.close();
  }
});
