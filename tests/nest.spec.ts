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
