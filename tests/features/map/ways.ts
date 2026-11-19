import type { Page } from "@playwright/test";
import type { InternalPage } from "../../../src/shared/ipc";
import { findView } from "../../app";
import type { Drive } from "../driver";
import { defined } from "../../../src/shared/testing";

// The ways in that every feature shares, the same calls the end-to-end tests make.

export const openPage = (drive: Drive, page: InternalPage, param?: string) =>
  drive.chrome.evaluate(([page, param]) => window.chromeAPI.browser.openPage(page, param ? { param } : undefined), [page, param] as const);

export const seen = (where: Page, text: string | RegExp) => where.getByText(text).first().waitFor();
export const heading = (where: Page, name: string | RegExp) => where.getByRole("heading", { name }).first().waitFor();

export const createTab = async (drive: Drive, url: string) => {
  await drive.chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), url);
  const page = await findView(drive.app, url);
  await page.waitForLoadState("load");
  return page;
};

export const tabs = (drive: Drive) => drive.chrome.evaluate(() => window.chromeAPI.browser.getTabs());

// Three pages open, ending on the news, so the tabs and the history have something in them.
export const threeTabs = async (drive: Drive) => {
  for (const [host, path] of [
    ["shop.example", "/"],
    ["travel.example", "/flights"],
    ["news.example", "/news"],
  ])
    await createTab(drive, drive.site.url(defined(host), path));
  await seen(drive.chrome, "Morning News");
};

// A chat sent and opened, as the new tab's box does. The box opens the chat's tab only once the send returns, so a job
// that opens a tab at once can put it above or below the chat's. The model thinks first, as a real one does, so the
// chat's tab is always there first.
const THINK_MS = 1000;
export const startChat = async (
  drive: Drive,
  text: string,
  { title = "NONE", cloud = false }: { title?: string; cloud?: boolean } = {},
) => {
  drive.model.titleWith(title);
  drive.model.thinkFor(THINK_MS);
  const sent = await drive.chrome.evaluate(([text, cloud]) => window.chromeAPI.chat.send(null, text, { seePage: false, cloud }), [
    text,
    cloud,
  ] as const);
  if (!sent) throw new Error("The chat wasn't sent");
  await openPage(drive, "chat", sent.id);
  return sent.id;
};

export const approvalCard = (where: Page) => where.getByRole("region", { name: "Approval needed" }).first().waitFor();

// A few chats with names, so the sidebar's Chats and Needs you have rows.
export const someChats = async (drive: Drive) => {
  drive.model.replyWith("The cheapest is the 1 m cable, for 49 kr.");
  await startChat(drive, "Find the cheapest USB-C cable", { title: "Cheapest cable" });
  await seen(drive.chrome, "The cheapest is the 1 m cable");
  drive.model.replyWith("Three flights under €200 this weekend.");
  await startChat(drive, "Flights to Lisbon this weekend", { title: "Lisbon weekend" });
  await seen(drive.chrome, "Three flights under");
};

// Asks the chrome until the answer is true.
export const until = async (drive: Drive, check: () => Promise<boolean>, timeout = 10_000) => {
  const started = Date.now();
  while (!(await drive.chrome.evaluate(check))) {
    if (Date.now() - started > timeout) throw new Error(`Still not true after ${timeout}ms: ${check.toString()}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
