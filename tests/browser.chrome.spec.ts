import { expect, test } from "@playwright/test";
import { chooseFromMenu, openMenuRows } from "./app";
import { setUpBrowserApp, origin, app, chrome } from "./browserSetup";

setUpBrowserApp();

test("the chrome renderer gets no raw IPC or code execution in tabs", async () => {
  expect(await chrome.evaluate(() => "electron" in window)).toBe(false);
  expect(await chrome.evaluate(() => "tabRunJs" in window.chromeAPI.browser)).toBe(false);
});

test("the chrome renderers run sandboxed", async () => {
  const sandboxed = await app.evaluate(({ app, webContents }) => {
    const metrics = app.getAppMetrics();
    return webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().includes("/chrome/"))
      .map((contents) => metrics.find((metric) => metric.pid === contents.getOSProcessId())?.sandboxed);
  });

  // The chrome view, the overlay view for the floating sidebar, the find bar, the address field's suggestions, the tooltip
  // over the page, a tab's preview card, the site permission prompt, and our menus and Asking first.
  expect(sandboxed).toEqual([true, true, true, true, true, true, true, true]);
});

test("the chrome renderer can't be navigated away from its own page", async () => {
  const own = chrome.url();
  await chrome.evaluate((url) => {
    window.location.href = url;
  }, `${origin}/elsewhere`);
  await chrome.waitForTimeout(300);

  expect(await chrome.evaluate(() => window.location.href)).toBe(own);
});

test("the appearance setting switches the chrome between light and dark", async () => {
  const html = chrome.locator("html");

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "dark" }));
  await expect(html).toHaveClass(/dark/);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light" }));
  await expect(html).not.toHaveClass(/dark/);
});

test("Hide Berry swaps the character for a plain icon and neutral words", async () => {
  await expect(chrome.getByRole("img", { name: /^Berry, / }).first()).toBeVisible();

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: false }));

  await expect(chrome.getByRole("img", { name: /^Berry, / })).toHaveCount(0);
  await expect(chrome.getByRole("textbox", { name: "Search, enter a URL, or ask a question" })).toBeVisible();
});

test("right-clicking Berry beside the greeting opens its menu", async () => {
  const berry = chrome.locator("[data-berry-perched]").getByRole("img", { name: "Berry, at rest" });
  await expect(berry).toBeVisible();
  await berry.click({ button: "right", timeout: 2000 });
  await expect.poll(() => openMenuRows(app)).toEqual(["Keep Berry Still", "Hide Berry"]);
  await chooseFromMenu(app, "Keep Berry Still");
  await expect
    .poll(() => chrome.evaluate(() => window.chromeAPI.settings.getSettings().then(({ keepBerryStill }) => keepBerryStill)))
    .toBe(true);
});

test("the component gallery shows Berry in every mood", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("gallery"));

  for (const mood of ["at rest", "fetching", "something went wrong", "asleep"]) {
    await expect(chrome.getByRole("img", { name: `Berry, ${mood}` }).first()).toBeVisible();
  }
  await expect(chrome.getByRole("region", { name: "Approval needed" }).last()).toBeVisible();
});
