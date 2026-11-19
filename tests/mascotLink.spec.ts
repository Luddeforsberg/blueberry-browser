import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeSupabase } from "./fakeSupabase";
import { inTempDir } from "./publishingSetup";

test("a blueberry://mascot link opens that Gallery entry, fetched again, and adds nothing", async () => {
  const server = await startFakeSupabase();
  const scout = server.seed({
    name: "Scout",
    palette: "robin",
    accessory: "cap",
    description: "Sums up SVT.",
    category: "News and research",
    instructions: "Read svt.se.",
    sites: ["svt.se"],
    tools: ["visit"],
    author_name: "Ana",
  });
  const profile = inTempDir("linked");
  const app = await launchApp(profile, { modelEnv: server.env });
  // The way the system hands a link over: `open-url` on a Mac, a second launch's arguments on Windows and Linux.
  const openUrl = (link: string) =>
    app.evaluate(({ app: electronApp }, url) => electronApp.emit("open-url", { preventDefault: () => {} }, url), link);
  const secondLaunch = (link: string) =>
    app.evaluate(
      ({ app: electronApp }, url) => electronApp.emit("second-instance", {}, ["blueberry-browser", "--some-switch", url], process.cwd()),
      link,
    );
  const activePage = () =>
    chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)?.page ?? null);
  let chrome = await findView(app, "view=chrome");
  try {
    // It registers for the scheme, which a test only writes down.
    expect(await app.evaluate(() => (globalThis as { fakeProtocols?: unknown[][] }).fakeProtocols?.map(([scheme]) => scheme))).toEqual([
      "blueberry",
    ]);

    // Anything but the one form does nothing at all.
    expect(await activePage()).toBe("new-tab");
    for (const link of [
      `blueberry://mascot/${scout.id}?add=1`,
      `blueberry://mascot/${scout.id}/`,
      `blueberry://routine/${scout.id}`,
      "blueberry://mascot/javascript:alert(1)",
      `blueberry://mascot/${"a".repeat(5000)}`,
    ]) {
      await openUrl(link);
      await secondLaunch(link);
    }
    await chrome.waitForTimeout(300);
    expect(await activePage()).toBe("new-tab");

    await openUrl(`blueberry://mascot/${scout.id}`);
    const page = chrome.getByRole("article", { name: "Scout" });
    await expect(page.getByText("from a link you opened")).toBeVisible();
    expect(await activePage()).toBe("mascot-gallery");
    await expect(page.getByText("Sums up SVT.")).toBeVisible();
    await expect(page.getByLabel("About it")).toContainText("Only visits svt.se");
    // The crumb says where it is, and nothing was added.
    await expect(chrome.getByRole("navigation", { name: "Where you are" })).toContainText("Scout");
    await expect(page.getByRole("button", { name: "Add Scout to your mascots" })).toBeVisible();

    // The same link again, from a second launch while another tab is in front, opens it again from the server as it is now.
    await chrome.getByRole("navigation", { name: "Where you are" }).getByRole("button", { name: "Gallery" }).click();
    await expect(chrome.getByRole("region", { name: "From people" })).toBeVisible();
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    expect(await activePage()).toBe("new-tab");
    scout.description = "Sums up SVT, now without sport.";
    // As if it were pressed again a while later, since the same link straight away is dropped.
    await app.evaluate(() => {
      const real = Date.now;
      Date.now = () => real() + 10_000;
    });
    await secondLaunch(`blueberry://mascot/${scout.id.toUpperCase()}`);
    await expect(page.getByText("Sums up SVT, now without sport.")).toBeVisible();
    await expect(page.getByText("from a link you opened")).toBeVisible();

    // One that's gone says so.
    await openUrl("blueberry://mascot/00000000-0000-4000-8000-000000000000");
    await expect(chrome.getByText("That mascot isn’t in the Gallery any more, so nothing was added.")).toBeVisible();

    // Nothing was added, counted or run.
    expect(existsSync(join(profile, "mascots.json")) ? JSON.parse(readFileSync(join(profile, "mascots.json"), "utf8")) : []).toEqual([]);
    expect(scout.add_count).toBe(0);
    expect(server.received.filter(({ path }) => path.includes("record_add"))).toEqual([]);
  } finally {
    await app.close();
  }

  // A Gallery tab opened on a link's param, as a link that comes before the page has loaded leaves it, opens the same page.
  const again = await launchApp(profile, { modelEnv: server.env });
  try {
    chrome = await findView(again, "view=chrome");
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("mascot-gallery", { param: `link/${id}` }), scout.id);
    await expect(chrome.getByRole("article", { name: "Scout" }).getByText("from a link you opened")).toBeVisible();
  } finally {
    await again.close();
    server.close();
  }
});
