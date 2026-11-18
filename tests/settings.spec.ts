import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeSupabase } from "./fakeSupabase";

const EMAIL = "alex@example.com";
const PASSWORD = "correct horse battery";

test("the account menu changes the theme and opens Settings, whose sections and pages one step in keep what's saved", async () => {
  test.setTimeout(90_000);
  const server = await startFakeSupabase();
  await server.addAccount(EMAIL, PASSWORD);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-settings-"));
  const app = await launchApp(profile, { modelEnv: server.env });
  try {
    const chrome = await findView(app, "view=chrome");
    const settings = () => chrome.evaluate(() => window.chromeAPI.settings.getSettings());
    const param = () =>
      chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.page === "settings")?.pageParam);
    const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
    const mac = process.platform === "darwin";

    // Signed out, the button is a person, and Sign in opens Settings at Account.
    await sidebar.getByRole("button", { name: "Account, not signed in" }).click();
    let menu = sidebar.getByRole("dialog", { name: "Account" });
    await expect(menu).toContainText("Not signed in");
    await expect(menu.getByRole("button", { name: /^Sign out/ })).toHaveCount(0);
    await menu.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(param).toBe("account");
    await expect(menu).toHaveCount(0);
    await expect(chrome.getByRole("form", { name: "Sign in" })).toBeVisible();

    await chrome.evaluate(([email, password]) => window.chromeAPI.account.signIn(email, password), [EMAIL, PASSWORD]);
    const button = sidebar.getByRole("button", { name: `Account, ${EMAIL}` });
    await expect(button).toHaveText("A");

    // The theme changes at once, from the menu, and it's the setting Settings has.
    await button.click();
    menu = sidebar.getByRole("dialog", { name: "Account" });
    await expect(menu).toContainText(EMAIL);
    await menu.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(async () => (await settings()).appearance).toBe("dark");
    await expect(chrome.locator("html")).toHaveClass(/dark/);
    await expect(menu).toBeVisible();

    // The real shortcuts, for this platform. A page with none shows none.
    await expect(menu.getByRole("button", { name: /^Settings/ })).toContainText(mac ? "⌘," : "Ctrl+,");
    await expect(menu.getByRole("button", { name: /^Downloads/ })).toContainText(mac ? "⇧⌘J" : "Ctrl+Shift+J");
    await expect(menu.getByRole("button", { name: "Routines", exact: true })).toBeVisible();

    // The arrows move through the rows, Escape closes it, and the keyboard goes back to the button.
    await expect(menu.getByRole("radio", { name: "Dark" })).toBeFocused();
    await chrome.keyboard.press("ArrowDown");
    await expect(menu.getByRole("button", { name: /^Settings/ })).toBeFocused();
    await chrome.keyboard.press("ArrowUp");
    await chrome.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await settings()).appearance).toBe("light");
    await chrome.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();

    // Settings from the menu opens General, whose Theme says the same.
    await button.click();
    await menu.getByRole("button", { name: /^Settings/ }).click();
    await expect.poll(param).toBe("general");
    await expect(chrome.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Still in Mascots is the two saved settings, Show Berry on and Keep Berry still on, kept on disk.
    await chrome.getByRole("tab", { name: "Mascots" }).click();
    await chrome.getByRole("radiogroup", { name: "Mascots" }).getByRole("radio", { name: "Still" }).click();
    await expect
      .poll(async () => JSON.parse(readFileSync(join(profile, "settings.json"), "utf8")))
      .toMatchObject({ showBerry: true, keepBerryStill: true });
    await chrome.getByRole("radiogroup", { name: "Mascots" }).getByRole("radio", { name: "Hidden" }).click();
    await expect.poll(async () => (await settings()).showBerry).toBe(false);

    // A page one step in, and back by its own button and by the toolbar's.
    await chrome.getByRole("tab", { name: "Connections" }).click();
    await chrome.getByRole("button", { name: /^Cloud/ }).click();
    await expect(chrome.getByRole("heading", { name: "Cloud", level: 2 })).toBeVisible();
    await chrome.getByRole("button", { name: "Back to Connections" }).click();
    await expect(chrome.getByRole("tab", { name: "Connections" })).toHaveAttribute("aria-selected", "true");
    await chrome.getByRole("button", { name: /^Phone/ }).click();
    await expect.poll(param).toBe("phone");
    await chrome.getByRole("button", { name: "Back", exact: true }).click();
    await expect.poll(param).toBe("connections");

    // A name, kept here, shows on the button and leads the menu.
    await chrome.getByRole("tab", { name: "Account" }).click();
    await chrome.getByRole("button", { name: "Change your name" }).click();
    await chrome.getByRole("textbox", { name: "Name" }).fill("  Robin Lind ");
    await chrome.keyboard.press("Enter");
    await expect.poll(async () => (await settings()).accountName).toBe("Robin Lind");
    await expect(sidebar.getByRole("button", { name: "Account, Robin Lind" })).toHaveText("R");

    // With tabs on top it's after the dock in the toolbar, and opens over the page.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
    await chrome.getByRole("button", { name: "Account, Robin Lind" }).click();
    const overlay = await findView(app, "view=overlay");
    const over = overlay.getByRole("dialog", { name: "Account" });
    await expect(over).toContainText("Robin Lind");
    await expect(over).toContainText(EMAIL);
    await over.getByRole("radio", { name: "System" }).click();
    await expect.poll(async () => (await settings()).appearance).toBe("system");
    // The theme is all the view over the page may change.
    await expect(overlay.evaluate(() => window.chromeAPI.settings.updateSettings({ actionApproval: "never" }))).rejects.toThrow(/Rejected/);
    await over.getByRole("button", { name: /^History/ }).click();
    await expect
      .poll(async () => (await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).find((tab) => tab.isActive)?.page)
      .toBe("history");
    await expect(over).toHaveCount(0);

    // Sign out is in the menu while signed in, and the button goes back to the person.
    await chrome.getByRole("button", { name: "Account, Robin Lind" }).click();
    await overlay
      .getByRole("dialog", { name: "Account" })
      .getByRole("button", { name: /^Sign out/ })
      .click();
    await expect(chrome.getByRole("button", { name: "Account, not signed in" })).toBeVisible();
  } finally {
    await app.close();
    server.close();
  }
});

test("with no server there's no account in the menu, and Account says why", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    const sidebar = chrome.getByRole("navigation", { name: "Sidebar" });
    await sidebar.getByRole("button", { name: "Settings and more" }).click();
    const menu = sidebar.getByRole("dialog", { name: "Account" });
    await expect(menu.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    await expect(menu).not.toContainText("Not signed in");
    await expect(menu.getByRole("button", { name: /Sign (in|out)/ })).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Account" }));
    await expect(chrome.getByRole("heading", { name: "No account" })).toBeVisible();
  } finally {
    await app.close();
  }
});
