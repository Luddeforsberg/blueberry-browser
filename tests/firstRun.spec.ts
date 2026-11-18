import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";

const GOOD_KEY = "sk-test-a-key-that-works-0000-4f2A";
const BAD_KEY = "sk-test-a-key-it-turns-down-0000";

test("the first run makes an account, keeps a key the service answered, and ends on the new tab with First jobs", async () => {
  test.setTimeout(60_000);
  const profile = mkdtempSync(join(tmpdir(), "blueberry-first-"));
  const server = await startFakeSupabase();
  const model = await startFakeModel();
  model.refuseKey(BAD_KEY);
  // The service is there, but no key comes from the .env file: the only one is what the first run saves.
  const env = { ...server.env, ...model.env, OPENAI_API_KEY: "" };

  let app = await launchApp(profile, { firstLaunch: true, modelEnv: env });
  try {
    let chrome = await findView(app, "view=chrome");
    await expect(chrome.getByRole("heading", { name: "Hi, I’m Berry." })).toBeVisible();
    await chrome.getByRole("button", { name: "Get started" }).click();

    // An account, with the problem said under the field it's about.
    await expect(chrome.getByRole("heading", { name: "First, who are you?" })).toBeVisible();
    await expect(chrome.getByText("1 / 4")).toBeVisible();
    await chrome.getByLabel("Your name").fill("Sam");
    await chrome.getByLabel("Email").fill("sam@example.com");
    await chrome.getByLabel("Password", { exact: true }).fill("short");
    await chrome.getByRole("button", { name: "Create account" }).click();
    await expect(chrome.getByRole("alert")).toHaveText("Use at least 8 characters.");
    await chrome.getByLabel("Password", { exact: true }).fill("a-long-password");
    await chrome.getByLabel("Password", { exact: true }).press("Enter");

    await expect(chrome.getByRole("heading", { name: "Make it yours." })).toBeVisible();
    await chrome.getByRole("radio", { name: "On top" }).click();
    await chrome.getByRole("button", { name: "Continue" }).click();

    // A key the service turns down isn't kept, and one it answers is.
    await expect(chrome.getByRole("heading", { name: "Give me a brain." })).toBeVisible();
    await chrome.getByLabel("OpenAI key").fill(BAD_KEY);
    // The services are a choice of one by keyboard too, and the other one never gets this one's key.
    await chrome.getByRole("radio", { name: /^OpenAI/ }).press("ArrowRight");
    await expect(chrome.getByRole("radio", { name: /^Anthropic/ })).toBeChecked();
    await expect(chrome.getByLabel("Anthropic key")).toHaveValue("");
    await chrome.getByRole("radio", { name: /^Anthropic/ }).press("ArrowLeft");
    await chrome.getByLabel("OpenAI key").fill(BAD_KEY);
    await chrome.getByRole("button", { name: "Try the key" }).click();
    await expect(chrome.getByRole("alert")).toContainText("OpenAI turned that key down.");
    await expect(chrome.getByLabel("OpenAI key")).toHaveValue(BAD_KEY);
    await chrome.getByLabel("OpenAI key").fill(GOOD_KEY);
    await chrome.getByLabel("OpenAI key").press("Enter");
    await expect(chrome.getByRole("status")).toContainText("Hello, Sam. That works. I can think now.");
    await expect(chrome.getByLabel("OpenAI key ending in 4f2A")).toBeVisible();
    expect(model.keys).toEqual([BAD_KEY, GOOD_KEY]);
    await chrome.getByRole("button", { name: "Continue" }).click();

    // No other browser here, so no history step.
    await expect(chrome.getByRole("heading", { name: "What I can see." })).toBeVisible();
    // Never is only in Settings, where what it risks is said.
    const asking = chrome.getByRole("radiogroup", { name: "Ask before I act" });
    await expect(asking.getByRole("radio")).toHaveText(["When risky", "Always"]);
    await asking.getByRole("radio", { name: "Always" }).click();
    await chrome.getByRole("switch", { name: "Offers to remember what you tell me" }).click();
    await chrome.getByRole("button", { name: "Start browsing" }).click();

    await expect(chrome.getByRole("heading", { name: "Where to, Sam?" })).toBeVisible();
    const firstJobs = chrome.getByRole("region", { name: "First jobs" });
    await expect(firstJobs).toContainText("0 of 2");
    expect(await chrome.evaluate(() => window.chromeAPI.settings.getSettings())).toMatchObject({
      onboarded: true,
      accountName: "Sam",
      layoutMode: "horizontal",
      actionApproval: "always",
      memoryOffers: false,
      firstJobs: ["try", "meet"],
    });
    // The key is on disk only encrypted, and nothing a renderer can ask for has it.
    for (const file of readdirSync(profile).filter((name) => name.endsWith(".json"))) {
      expect(readFileSync(join(profile, file), "utf8")).not.toContain(GOOD_KEY);
    }
    expect(JSON.stringify(await chrome.evaluate(() => window.chromeAPI.aiKey.state()))).toBe('{"service":"openai","last4":"4f2A"}');
    expect(JSON.stringify(await chrome.evaluate(() => window.chromeAPI.library.getLibrary()))).not.toContain("a-key-that-works");

    // A first job puts its words in the box and sends nothing, and sending it uses the saved key.
    await firstJobs.getByRole("button", { name: /^Find the cheapest USB-C cable/ }).click();
    const box = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Berry" });
    await expect(box).toHaveValue("Find the cheapest USB-C cable, and ask me before buying");
    expect(model.requests).toHaveLength(0);
    await box.press("Enter");
    await expect(chrome.getByText("A reply from the model")).toBeVisible();
    expect(model.keys.at(-1)).toBe(GOOD_KEY);

    // The next launch goes straight to browsing, with the row done.
    await app.close();
    app = await launchApp(profile, { firstLaunch: true, modelEnv: env });
    chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    await expect(chrome.getByRole("region", { name: "First jobs" })).toContainText("1 of 2");
    await chrome.getByRole("button", { name: "Hide" }).click();
    await expect(chrome.getByRole("region", { name: "First jobs" })).toHaveCount(0);
  } finally {
    await app.close();
    server.close();
    model.close();
  }
});
