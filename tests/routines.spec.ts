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
  await chrome.getByRole("button", { name: "Routines", exact: true }).click();
  await chrome.getByRole("button", { name: "New routine" }).click();
  await chrome.getByRole("button", { name: "Save" }).click();
  await expect(chrome.getByRole("alert")).toHaveText("Give the routine a name.");

  await chrome.getByLabel("Name").fill("Flight watch");
  await chrome.getByLabel("What should it do?").fill("Check the prices");
  await chrome.getByRole("radio", { name: "Weekly" }).click();
  await chrome.getByRole("button", { name: "Saturday" }).click();
  await chrome.getByLabel("Time").fill("07:30");
  await chrome.getByRole("button", { name: "Save" }).click();
  await expect(chrome.getByRole("heading", { name: "Flight watch" })).toBeVisible();
  await expect(chrome.getByText(/at 07:30/)).toBeVisible();
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

  // It asks first, in the same words on the Routines page and in the sidebar, and nothing has loaded yet.
  const address = `${origin}/prices?from=ARN`;
  model.callTools({ name: "open_tab", args: { url: address } });
  model.callTools({ name: "read_page", args: {} });
  model.replyWith("Three flights ", "under €200.");
  const finishReply = model.holdBeforeFirstToken();
  await chrome.getByRole("button", { name: "Run now" }).click();

  const question = `Open ${address} in a new tab`;
  const cards = chrome.getByRole("region", { name: "Approval needed" });
  await expect(cards.getByRole("heading")).toHaveText(question);
  await expect(chrome.getByText("Needs your OK").first()).toBeVisible();
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), (await tabs()).find((tab) => !tab.page || tab.page === "new-tab")!.id);
  await expect(chrome.getByRole("navigation", { name: "Sidebar" }).getByRole("region", { name: "Approval needed" }).getByRole("heading")).toHaveText(question);
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id!), routinesTab?.id);
  expect(requested).toEqual([]);

  // Allowed, the run opens its tab behind the current view and closes it when it's done.
  await cards.getByRole("button", { name: "Allow" }).click();
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
  await expect(chrome.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([
    /Opened 127.0.0.1/,
    /Read 127.0.0.1/,
  ]);
  const after = await tabs();
  expect(after).toHaveLength(countBefore);
  expect(after.find((tab) => tab.isActive)?.id).toBe(routinesTab?.id);

  // Run again, and close the app while it's waiting.
  requested = [];
  model.callTools({ name: "open_tab", args: { url: address } });
  await chrome.getByRole("button", { name: "Run now" }).click();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(1);
  await app.close();
  expect(requested).toEqual([]);

  // Next launch: it wasn't done, and it says what wasn't.
  app = await launchApp(profile, { modelEnv: model.env });
  chrome = await findView(app, "view=chrome");
  await expect(chrome.getByRole("button", { name: /Routines.*Has news/ })).toBeVisible();
  await chrome.getByRole("button", { name: /^Routines/ }).click();
  await chrome.getByRole("button", { name: /Flight watch/ }).click();
  await expect(chrome.getByText("Interrupted").first()).toBeVisible();
  await expect(chrome.getByText(`so it wasn’t done: “${question}”`)).toBeVisible();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(0);
  await expect(chrome.getByRole("button", { name: "Run again" })).toBeVisible();
  expect(requested).toEqual([]);

  // Run again really starts it, and Stop ends it with nothing done.
  model.callTools({ name: "open_tab", args: { url: address } });
  await chrome.getByRole("button", { name: "Run again" }).click();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(1);
  await chrome.getByRole("button", { name: "Stop" }).click();
  await expect(chrome.getByText("Stopped")).toBeVisible();
  await expect(chrome.getByRole("region", { name: "Approval needed" })).toHaveCount(0);
  expect(requested).toEqual([]);
});
