// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

let server: Server;
let origin: string;
let model: FakeModel;
let app: ElectronApplication;
let requested: string[] = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    // Only what the action would load. Other tools on a developer's machine may probe an open port.
    if (request.url?.startsWith("/prices")) requested.push(request.url);
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Prices</title><body>Three flights</body>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  model = await startFakeModel();
});

test.afterAll(() => {
  server.close();
  model.close();
});

test.afterEach(async () => {
  await app?.close();
});

const createRoutine = async (chrome: Page) => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("routines"));
  await expect(chrome.getByText(/A routine is a job I do again by myself/)).toBeVisible();
  await chrome.getByRole("button", { name: "New routine" }).click();

  // Four questions, one at a time, and the name is never one of them.
  await expect(chrome.getByRole("button", { name: "Continue" })).toBeDisabled();
  await chrome.getByRole("textbox", { name: "What should I do?" }).fill("Check the prices");
  await chrome.getByRole("button", { name: "Continue" }).click();

  await chrome.getByRole("radio", { name: "Weekly" }).click();
  const days = chrome.getByRole("group", { name: "Days" });
  await days
    .getByRole("button", { name: "Saturday", pressed: false })
    .click()
    .catch(() => undefined);
  for (const label of await days
    .getByRole("button", { pressed: true })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))) {
    if (label !== "Saturday") await days.getByRole("button", { name: label! }).click();
  }
  await chrome.getByRole("radio", { name: "Other…" }).click();
  await chrome.getByLabel("Other time").fill("07:30");
  await expect(chrome.getByText("Every Saturday at 07:30", { exact: true })).toBeVisible();
  await chrome.getByRole("button", { name: "Continue" }).click();
  await chrome.getByRole("button", { name: "Continue" }).click();
  await expect(chrome.getByRole("radiogroup", { name: "Where it may go" })).toBeVisible();

  // Named the way a chat is, from what it does and nothing else.
  model.titleWith("Flight watch");
  await chrome.getByRole("button", { name: "Save routine" }).click();
  const saved = chrome.getByRole("region", { name: "Saved as a routine" });
  await expect(saved).toContainText("Every Saturday at 07:30, Berry will check the prices");
  await expect.poll(() => model.titleRequests.length).toBe(1);
  expect(JSON.stringify(model.titleRequests[0].messages)).toContain("Check the prices");
  await saved.getByRole("button", { name: "Done" }).click();
  await expect(chrome.getByRole("heading", { name: "Flight watch" })).toBeVisible();
  await expect(chrome.getByText("Every Saturday at 07:30").first()).toBeVisible();
};

test("a routine is created, runs behind the user, asks first, and doesn't act after the app closes", async () => {
  model.reset();
  requested = [];
  const profile = mkdtempSync(join(tmpdir(), "blueberry-routines-"));
  app = await launchApp(profile, { modelEnv: model.env });
  let chrome = await findView(app, "view=chrome");
  await createRoutine(chrome);

  const tabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());
  const routinesTab = (await tabs()).find((tab) => tab.page === "routines");
  const countBefore = (await tabs()).length;

  // It asks first, in the same words on the Routines page and in Needs you, and nothing has loaded yet.
  const address = `${origin}/prices?from=ARN`;
  model.callTools({ name: "open_tab", args: { url: address } });
  model.callTools({ name: "read_page", args: {} });
  model.replyWith("Three flights ", "under €200.");
  const finishReply = model.holdBeforeFirstToken();
  await chrome.getByRole("button", { name: "Run now", exact: true }).click();

  const question = `Open ${address} in a new tab`;
  const cards = chrome.getByRole("region", { name: "Approval needed" });
  await expect(cards.getByText(question)).toBeVisible();
  await expect(chrome.getByText("Needs you", { exact: true }).first()).toBeVisible();
  await chrome.evaluate(
    (id) => window.chromeAPI.browser.switchTab(id),
    (await tabs()).find((tab) => !tab.page || tab.page === "new-tab")!.id,
  );
  await expect(chrome.getByRole("navigation", { name: "Sidebar" }).getByRole("tab", { name: /^Chats.*1 needs you/ })).toBeVisible();
  await expect
    .poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).needsYou.map(({ approval }) => approval.text))
    .toEqual([question]);
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id!), routinesTab?.id);
  expect(requested).toEqual([]);

  // On the list it's under Needs you with what it wants, and Answer opens its card on Needs you.
  await chrome.getByRole("button", { name: "Back to Routines" }).click();
  await expect(chrome.getByRole("region", { name: "Needs you" }).getByRole("listitem")).toContainText("Open 127.0.0.1 in a new tab");
  await chrome.getByRole("button", { name: "Answer: Flight watch" }).click();
  await expect(chrome.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(chrome.getByRole("region", { name: "Approval needed" }).getByText(question)).toBeVisible();
  await chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), (await tabs()).find((tab) => tab.page === "needs-you")!.id);
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id!), routinesTab?.id);
  await chrome.getByRole("button", { name: "Flight watch", exact: true }).click();

  // Allowed, the run opens its tab behind the current view and closes it when it's done.
  await cards.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => requested).toContain("/prices?from=ARN");
  // A page behind the user that opens a popup doesn't come to the front, and the popup closes with the run.
  const page = await findView(app, "/prices?from=ARN");
  await page.evaluate(() => void window.open("/prices-popup"));
  await expect.poll(() => requested).toContain("/prices-popup");
  expect((await tabs()).find((tab) => tab.isActive)?.id).toBe(routinesTab?.id);
  await expect.poll(async () => (await tabs()).length).toBe(countBefore + 2);
  finishReply();
  await expect(chrome.getByText("Three flights under €200.")).toBeVisible();
  await expect(chrome.getByText("Finished")).toBeVisible();
  await chrome.getByRole("button", { name: "2 steps on 127.0.0.1" }).click();
  await expect(chrome.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([/Opened 127.0.0.1/, /Read 127.0.0.1/]);
  const after = await tabs();
  expect(after).toHaveLength(countBefore);
  expect(after.find((tab) => tab.isActive)?.id).toBe(routinesTab?.id);

  // Run again, and close the app while it's waiting.
  requested = [];
  model.callTools({ name: "open_tab", args: { url: address } });
  await chrome.getByRole("button", { name: "Run now", exact: true }).click();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(1);
  // Tabs come back on the next launch, and with Routines in front there would be no news left to show.
  await chrome.evaluate(() => window.chromeAPI.browser.createTab());
  await app.close();
  expect(requested).toEqual([]);

  // Next launch: it wasn't done, and it says what wasn't.
  app = await launchApp(profile, { modelEnv: model.env });
  chrome = await findView(app, "view=chrome");
  // Its row on Chats says there's news, and opens it.
  await chrome.getByRole("tab", { name: /^Chats/ }).click();
  const news = chrome.getByRole("tabpanel", { name: "Chats" }).getByRole("button", { name: /Flight watch.*Has news/ });
  await expect(news).toBeVisible();
  await news.click();
  await expect(chrome.getByText("Interrupted").first()).toBeVisible();
  await expect(chrome.getByText(`so it wasn’t done: “${question}”`)).toBeVisible();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: "Run again" })).toBeVisible();
  expect(requested).toEqual([]);

  // Run again really starts it, and Stop ends it with nothing done.
  model.callTools({ name: "open_tab", args: { url: address } });
  await chrome.getByRole("button", { name: "Run again" }).click();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(1);
  await chrome.getByRole("list", { name: "Runs" }).getByRole("button", { name: "Stop" }).click();
  await expect(chrome.getByText("Stopped", { exact: true })).toBeVisible();
  // Where it was stopped stays on the run's trail.
  await expect(chrome.getByText("Stopped here")).toBeVisible();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(0);
  expect(requested).toEqual([]);
});
