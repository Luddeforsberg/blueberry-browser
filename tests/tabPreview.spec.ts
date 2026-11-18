// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";

// Each page is one colour, so the picture on its card can be checked by its middle.
const COLOURS: Record<string, string> = { red: "rgb(220, 30, 30)", green: "rgb(30, 160, 60)", blue: "rgb(30, 60, 220)" };

const previewView = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) => {
    const view = BaseWindow.getAllWindows()[0].contentView.children.find(
      (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes("view=preview"),
    );
    return view ? { visible: view.getVisible(), bounds: view.getBounds() } : null;
  });

// The middle of the card's picture, as red, green and blue, or null without one.
const pictureMiddle = (preview: Page) =>
  preview.evaluate(async () => {
    const image = document.querySelector("img");
    if (!image) return null;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return { r, g, b, width: image.naturalWidth, height: image.naturalHeight };
  });

test("resting on a tab behind shows a card of it, in both layouts, and it gets out of the page's way", async () => {
  const server = createServer((request, response) => {
    const name = request.url!.slice(1);
    response.setHeader("content-type", "text/html");
    response.end(
      `<!doctype html><title>${name[0].toUpperCase()}${name.slice(1)} page</title>` +
        `<body style="margin:0;height:100vh;background:${COLOURS[name] ?? "white"}" onclick="document.title='Clicked'"></body>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    const tabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    const open = async (name: string) => {
      await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}/${name}`);
      await expect
        .poll(async () => (await tabs()).find((tab) => tab.isActive)?.title)
        .toBe(`${name[0].toUpperCase()}${name.slice(1)} page`);
    };
    // Red and green have been in front and left, blue is in front, and the new tab page is one of Blueberry's own.
    const [start] = await tabs();
    await open("red");
    await open("green");
    await open("blue");
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), start.id);
    await chrome.evaluate(async () => {
      const blue = (await window.chromeAPI.browser.getTabs()).find((tab) => tab.title === "Blue page")!;
      await window.chromeAPI.browser.switchTab(blue.id);
    });
    const preview = await findView(app, "view=preview");
    const card = preview.locator("[data-tab-preview]");

    for (const layoutMode of ["vertical", "horizontal"] as const) {
      await chrome.evaluate((mode) => window.chromeAPI.settings.updateSettings({ layoutMode: mode }), layoutMode);
      const list = chrome.getByRole("list", { name: "Tabs", exact: true });
      const tab = (name: string) => list.getByRole("button", { name, exact: true });
      await expect(tab("Red page")).toBeVisible();
      await chrome.mouse.move(600, 600);

      // Resting on red shows its card, after a wait, with its title, its site and its picture.
      await tab("Red page").hover();
      expect((await previewView(app))?.visible).toBe(false);
      await expect.poll(async () => (await previewView(app))?.visible).toBe(true);
      await expect(card).toContainText("Red page");
      await expect(card).toContainText("127.0.0.1");
      const red = await pictureMiddle(preview);
      expect(red).toMatchObject({ width: 560, height: 350 });
      expect(red!.r).toBeGreaterThan(180);
      expect(red!.g).toBeLessThan(80);

      // Where it is: beside the sidebar, level with the row, or under the tab row, at the tab.
      const row = await list.getByRole("listitem").filter({ hasText: "Red page" }).boundingBox();
      const { bounds } = (await previewView(app))!;
      const box = await card.boundingBox();
      if (layoutMode === "vertical") {
        const { sidebarWidth } = await chrome.evaluate(() => window.chromeAPI.layout.getLayout());
        expect(bounds.x).toBe(sidebarWidth);
        expect(box!.x).toBe(8);
        expect(Math.round(box!.y)).toBe(Math.round(row!.y));
      } else {
        expect(bounds.y).toBe(42);
        expect(box!.y).toBe(6);
        expect(Math.round(box!.x)).toBe(Math.round(row!.x));
      }

      // Along the tabs it follows with no wait.
      await tab("Green page").hover();
      await expect(card).toContainText("Green page", { timeout: 300 });
      await expect.poll(async () => (await pictureMiddle(preview))?.g).toBeGreaterThan(120);

      // The tab in front and Blueberry's own pages get none.
      await tab("Blue page").hover();
      await expect.poll(async () => (await previewView(app))?.visible).toBe(false);
      await tab("New tab").hover();
      await chrome.waitForTimeout(700);
      expect((await previewView(app))?.visible).toBe(false);

      // A press takes it away.
      await tab("Green page").hover();
      await expect.poll(async () => (await previewView(app))?.visible).toBe(true);
      await chrome.mouse.down();
      await expect.poll(async () => (await previewView(app))?.visible).toBe(false);
      await chrome.mouse.up();
      await expect.poll(async () => (await tabs()).find((tab) => tab.isActive)?.title).toBe("Green page");

      // Leaving the tabs takes it away, and a click where it was reaches the page.
      await tab("Red page").hover();
      await expect.poll(async () => (await previewView(app))?.visible).toBe(true);
      const where = await card.boundingBox();
      const { bounds: over } = (await previewView(app))!;
      await chrome.mouse.move(over.x + where!.x + 40, over.y + where!.y + 40);
      await expect.poll(async () => (await previewView(app))?.visible).toBe(false);
      const page = await findView(app, `${origin}/green`);
      const { page: pageBox } = await chrome.evaluate(() => window.chromeAPI.layout.getLayout());
      await page.mouse.click(over.x + where!.x + 40 - pageBox.x, over.y + where!.y + 40 - pageBox.y);
      await expect(page).toHaveTitle("Clicked");

      // Back to blue in front for the next layout.
      await chrome.evaluate(async () => {
        const blue = (await window.chromeAPI.browser.getTabs()).find((tab) => tab.title === "Blue page")!;
        await window.chromeAPI.browser.switchTab(blue.id);
      });
      // The click changed green's title, which the next round looks for.
      await page.evaluate(() => (document.title = "Green page"));
    }
  } finally {
    await app.close();
    server.close();
  }
});
