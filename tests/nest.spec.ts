import { expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

const FIRST_ANSWER = "Lindqvist Data and Fjällbo both sell to sales teams.";

let model: FakeModel;
let app: ElectronApplication;

test.beforeAll(async () => {
  model = await startFakeModel();
});

test.afterAll(() => model.close());

test.afterEach(async () => {
  await app?.close();
});

const newestUserMessage = (request: FakeModel["requests"][number]) =>
  String(request.messages.findLast(({ role }) => role === "user")?.content ?? "");

test("a card pulled out of another gets its latest answer, and the Nest keeps both", async () => {
  model.reset();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-nest-"));
  app = await launchApp(profile, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");

  await chrome.getByRole("button", { name: "New nest" }).click();
  await expect(chrome.getByRole("textbox", { name: "Nest name" })).toHaveValue("Untitled nest");

  // The composer at the bottom starts a card of its own.
  model.replyWith(FIRST_ANSWER);
  const composer = chrome.getByRole("textbox", { name: "New card" });
  await composer.fill("Find two Swedish SaaS companies");
  await composer.press("Enter");
  const first = chrome.locator(".react-flow__node").first();
  await expect(first.getByRole("status")).toHaveText("Done");
  await expect(first).toContainText(FIRST_ANSWER);
  await expect(first).toContainText("Find two Swedish SaaS companies");

  // Its handle's click puts a draft beside it, on a line, saying what it will get.
  await first.hover();
  await first.getByLabel("Pull a new card out of Berry’s").click();
  const draft = chrome.locator(".react-flow__node").nth(1);
  await expect(draft).toContainText("gets Berry’s latest answer");
  await expect(chrome.locator(".react-flow__edge")).toHaveCount(1);
  const [firstBox, draftBox] = [await first.boundingBox(), await draft.boundingBox()];
  expect(draftBox!.x).toBeGreaterThan(firstBox!.x + firstBox!.width);

  // Nothing ran on its own: one request so far, the first card's.
  expect(model.requests).toHaveLength(1);

  model.replyWith("Two drafts written.");
  const prompt = draft.getByRole("textbox", { name: "What should Berry do?" });
  await prompt.fill("Write a first email to each");
  await prompt.press("Enter");
  await expect(draft.getByRole("status")).toHaveText("Done");
  await expect(draft).toContainText("Two drafts written.");

  // The model got the first card's answer as tagged, untrusted data, and the user's words after it.
  expect(model.requests).toHaveLength(2);
  const sent = newestUserMessage(model.requests[1]);
  expect(sent).toContain(`<card_answer from="Berry">\n${FIRST_ANSWER}\n</card_answer>`);
  expect(sent).toContain("untrusted");
  expect(sent.endsWith("Write a first email to each")).toBe(true);

  // Card chats belong to the Nest, so the sidebar has no chats to list.
  await expect(chrome.getByRole("heading", { name: "Chats" })).toHaveCount(0);

  // Both cards and their line are still there after a restart.
  await app.close();
  app = await launchApp(profile, { modelEnv: model.env });
  const again = await findView(app, "view=chrome");
  await again.getByRole("button", { name: "Untitled nest", exact: true }).click();
  await expect(again.locator(".react-flow__node")).toHaveCount(2);
  await expect(again.locator(".react-flow__edge")).toHaveCount(1);
  await expect(again.locator(".react-flow__node").nth(1)).toContainText("Two drafts written.");
});

const COMPANIES = [
  "Here are six.",
  "",
  "| Company | People | Leads sales |",
  "|---|---|---|",
  "| Lindqvist Data | 84 | Sara Holm |",
  "| Fjällbo | 41 | Omar Nilsson |",
  "| Kvarnsten | 130 | Lina Berg |",
  "| Sjöström Labs | 62 | Elias Ek |",
  "| Brygga | 23 | Maja Lund |",
  "| Vinga | 55 | Ida Ström |",
].join("\n");

test("rows picked in a card's table go to a new card, which runs once for each of them", async () => {
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");
  await chrome.getByRole("button", { name: "New nest" }).click();

  model.replyWith(COMPANIES);
  const composer = chrome.getByRole("textbox", { name: "New card" });
  await composer.fill("Find six Swedish SaaS companies");
  await composer.press("Enter");
  const first = chrome.locator(".react-flow__node").first();
  await expect(first.getByRole("status")).toHaveText("Done");

  // The answer's table is the card's result: five rows, then the rest a press away.
  const rows = first.locator("tbody tr");
  await expect(rows).toHaveCount(5);
  await expect(first.getByRole("button", { name: "1 more" })).toBeVisible();

  // A click picks one, Shift picks a range, Cmd takes one away and adds it back, and Esc lets them all go.
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ["Shift"] });
  await expect(first.getByText("3 selected")).toBeVisible();
  await rows.nth(1).click({ modifiers: ["ControlOrMeta"] });
  await expect(first.getByText("2 selected")).toBeVisible();
  await chrome.keyboard.press("Escape");
  await expect(first.getByText("selected")).toHaveCount(0);
  await rows.nth(1).click();
  await rows.nth(3).click({ modifiers: ["ControlOrMeta"] });
  await rows.nth(4).click({ modifiers: ["ControlOrMeta"] });
  await expect(first.getByText("3 selected")).toBeVisible();
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(rows.nth(0)).toHaveAttribute("aria-selected", "false");

  // The line's round end touches the card's edge, rather than floating beside it.
  await first.hover();
  const handle = first.getByLabel("Pull a new card out of the 3 selected rows");
  await handle.click();
  const draft = chrome.locator(".react-flow__node").nth(1);
  await expect(draft).toContainText("gets 3 rows from Berry");
  // Read in one frame, since the board may still be moving to show the new card.
  const gap = await chrome.evaluate(
    () => document.querySelector(".react-flow__edge circle")!.getBoundingClientRect().left - document.querySelector(".react-flow__node")!.getBoundingClientRect().right
  );
  expect(Math.abs(gap)).toBeLessThanOrEqual(1);

  // For each row is on, since rows were picked, and says how many runs it will make.
  await expect(draft.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(draft).toContainText("3 runs");
  expect(model.requests).toHaveLength(1);

  model.replyWith("Hej, a short note.");
  const prompt = draft.getByRole("textbox", { name: "What should Berry do?" });
  await prompt.fill("Find a recent post by the sales lead");
  await prompt.press("Enter");
  await expect(draft.getByRole("status").first()).toHaveText("Done");
  // Sent, its line is solid.
  await expect(chrome.locator(".react-flow__edge path").first()).not.toHaveAttribute("style", /dasharray/);
  await expect(draft.getByRole("button", { name: /^(Fjällbo|Sjöström Labs|Brygga)/ })).toHaveCount(3);

  // One run for each picked row, each with that row and no other.
  expect(model.requests).toHaveLength(4);
  const sent = model.requests.slice(1).map(newestUserMessage);
  for (const [index, company] of ["Fjällbo", "Sjöström Labs", "Brygga"].entries()) {
    const run = sent.find((message) => message.includes(`| ${company} |`));
    expect(run, `a run for ${company}`).toBeDefined();
    expect(run!.match(/\| \d+ \|/g)).toHaveLength(1);
    expect(run).toContain("work on this row only");
    expect(run!.endsWith("Find a recent post by the sales lead")).toBe(true);
    expect(sent.filter((message) => message.includes(`| ${company} |`)), `${index}`).toHaveLength(1);
  }
  for (const left of ["Lindqvist Data", "Kvarnsten", "Vinga"]) expect(sent.join("\n")).not.toContain(left);
});
