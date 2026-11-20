import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";

const TITLES: Record<string, string> = { "/one": "Lisbon fares", "/two": "Porto by train", "/three": "Weather" };

let server: Server;
let origin: string;
let app: ElectronApplication;
let chrome: Page;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>${TITLES[request.url ?? ""] ?? "Elsewhere"}</title><p>${request.url}</p>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test.beforeEach(async () => {
  app = await launchApp();
  chrome = await findView(app, "view=chrome");
  for (const path of ["/one", "/two", "/three"]) {
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}${path}`);
  }
  await expect.poll(async () => (await tabs()).filter((tab) => Object.values(TITLES).includes(tab.title)).length).toBe(3);
});

test.afterEach(async () => {
  await app.close();
});

const tabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());
const activeTab = async () => (await tabs()).find((tab) => tab.isActive);

const listVisible = () =>
  app.evaluate(({ BaseWindow }) => {
    const [main] = BaseWindow.getAllWindows();
    if (!main) throw new Error("No window");
    return main.contentView.children.some(
      (view) =>
        "webContents" in view && (view as Electron.WebContentsView).webContents.getURL().includes("view=suggestions") && view.getVisible(),
    );
  });

const editAddress = async () => {
  await chrome.getByRole("button", { name: "Address" }).click();
  const field = chrome.getByRole("textbox", { name: "Address" });
  await expect(field).toBeFocused();
  return field;
};

test("typing offers an open tab, and Down then Enter switches to it without opening another", async () => {
  const count = (await tabs()).length;
  expect((await activeTab())?.url).toBe(`${origin}/three`);

  const field = await editAddress();
  await field.pressSequentially("lisbon");
  const list = await findView(app, "view=suggestions");
  const offered = list.getByRole("option", { name: /Lisbon fares/ });
  await expect(offered).toContainText("Switch to tab");
  await expect.poll(listVisible).toBe(true);
  // The search and asking come last, after anything open, saved or visited.
  await expect(list.getByRole("option").last()).toContainText("Ask Berry about “lisbon”");

  // Down puts the tab's address in the field, and Enter goes to that tab.
  await field.press("ArrowDown");
  await expect(field).toHaveValue(`${origin}/one`);
  await expect(offered).toHaveAttribute("aria-selected", "true");
  await field.press("Enter");

  await expect.poll(async () => (await activeTab())?.url).toBe(`${origin}/one`);
  expect((await tabs()).length).toBe(count);
  await expect.poll(listVisible).toBe(false);

  // Pressing a row does the same.
  const again = await editAddress();
  await again.pressSequentially("porto");
  await list.getByRole("option", { name: /Porto by train/ }).click();
  await expect.poll(async () => (await activeTab())?.url).toBe(`${origin}/two`);
  expect((await tabs()).length).toBe(count);
  await expect.poll(listVisible).toBe(false);
});

test("Enter with nothing selected does what it always did, and Escape closes the list first", async () => {
  const count = (await tabs()).length;
  const field = await editAddress();

  // Escape closes the list and keeps the text, and a second one puts the page's address back.
  await field.pressSequentially("lisbon");
  await expect.poll(listVisible).toBe(true);
  await field.press("Escape");
  await expect.poll(listVisible).toBe(false);
  await expect(field).toHaveValue("lisbon");
  await field.press("Escape");
  await expect(chrome.getByRole("button", { name: "Address" })).toContainText("/three");

  // An address typed in full goes there in this tab, with the list open and nothing in it chosen.
  const again = await editAddress();
  await again.pressSequentially(`${origin}/four`);
  await expect.poll(listVisible).toBe(true);
  await again.press("Enter");
  await expect.poll(async () => (await activeTab())?.url).toBe(`${origin}/four`);
  expect((await tabs()).length).toBe(count);
  await expect.poll(listVisible).toBe(false);
});
