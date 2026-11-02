// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";

// A job sent to the cloud runner: the real runner, built and started as its own Node process, takes it from the real
// migration in Postgres, works in a headless Chrome standing in for Browserbase, and waits on an approval the user
// answers in Blueberry's Needs you. Only the model and Supabase's HTTP layer are stand-ins.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.BLUEBERRY_SHOTS ?? join(homedir(), "blueberry-audit", "shots-runner");
const EMAIL = "ana@example.com";
const PROMPT = "Order the thing from my shop";

const SHOP = `<!doctype html><title>Shop</title>
<button id="order">Place order</button><p id="said">Nothing ordered</p>
<script>
  document.getElementById("order").addEventListener("click", (event) => {
    if (event.isTrusted) document.getElementById("said").textContent = "Order placed";
  });
</script>`;

const shoot = async (chrome: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await chrome.screenshot({ path: join(SHOTS, `${name}.png`) });
};

test.skip(process.platform !== "darwin" || !existsSync(CHROME), "Needs Google Chrome");

test("a job on the runner keeps going without the app's agent, waits on Needs you, and finishes once the user allows it", async () => {
  test.setTimeout(120_000);
  const root = join(__dirname, "..");
  execFileSync("pnpm", ["run", "--silent", "runner:build"], { cwd: root, stdio: "pipe" });
  const shopServer = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(SHOP);
  });
  await new Promise<void>((resolve) => shopServer.listen(0, "127.0.0.1", resolve));
  const shop = `http://127.0.0.1:${(shopServer.address() as AddressInfo).port}/shop`;
  const model = await startFakeModel();
  const supabase = await startFakeSupabase({ cloudJobs: true });
  const app = await launchApp(undefined, { modelEnv: { ...model.env, ...supabase.env, BLUEBERRY_CLOUD_LOCAL: "1", BLUEBERRY_CLOUD_CHROME: CHROME } });
  let runnerLog = "";
  let runner: ReturnType<typeof spawn> | null = null;
  try {
    const chrome = await findView(app, "view=chrome");
    const signedIn = await chrome.evaluate((email) => window.chromeAPI.account.signUp(email, "correct horse battery"), EMAIL);
    expect(signedIn.status).toBe("signed-in");

    runner = spawn(process.execPath, ["runner/dist/index.cjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        ...model.env,
        LLM_PROVIDER: "openai",
        SUPABASE_URL: supabase.env.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: supabase.env.SUPABASE_PUBLISHABLE_KEY,
        BLUEBERRY_RUNNER_TOKEN: supabase.runnerToken(EMAIL),
        BLUEBERRY_RUNNER_CHROME: CHROME,
        BLUEBERRY_RUNNER_POLL_MS: "300",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    runner.stdout?.on("data", (part: Buffer) => (runnerLog += part));
    runner.stderr?.on("data", (part: Buffer) => (runnerLog += part));

    model.callTools({ name: "open_tab", args: { url: shop } });
    model.callTools({ name: "list_elements", args: {} });
    model.callTools({ name: "click", args: { ref: "e1" } });
    model.callTools({ name: "read_page", args: {} });
    model.replyWith("Ordered it");

    // Cloud, then Keeps going, from the new tab page.
    const composer = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
    await composer.fill(PROMPT);
    await chrome.getByRole("button", { name: "Run in the cloud" }).click();
    const keepGoing = chrome.getByRole("button", { name: "Keep going with this computer off" });
    await keepGoing.click();
    await expect(keepGoing).toHaveAttribute("aria-pressed", "true");
    await shoot(chrome, "new-tab-keeps-going");
    await composer.press("Meta+Enter");

    await expect(chrome.getByText("Sent to the runner")).toBeVisible();
    await expect(chrome.getByRole("region", { name: "On the runner" })).toBeVisible();

    // The runner asks, and the app shows it in Needs you like any other.
    await expect(chrome.getByRole("button", { name: /Needs you.*1 waiting/ })).toBeVisible({ timeout: 30_000 });
    const card = chrome.getByRole("region", { name: "Approval needed" });
    await expect(card.locator("p").getByText(`Click the button “Place order” on ${shop}`)).toBeVisible();
    await shoot(chrome, "chat-waiting");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light", layoutMode: "horizontal" }));
    await chrome.waitForTimeout(500);
    await shoot(chrome, "chat-waiting-light-horizontal");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "system", layoutMode: "vertical" }));
    const [job] = await supabase.cloudRows("select id, status from public.cloud_jobs");
    expect(job.status).toBe("waiting");
    const steps = await chrome.evaluate(async () => {
      const [chat] = (await window.chromeAPI.library.getLibrary()).chats;
      return (await window.chromeAPI.library.getChat(chat.id))?.steps.map((step) => step.text);
    });
    expect(steps?.length).toBeGreaterThan(0);

    await chrome.getByRole("button", { name: /Needs you.*1 waiting/ }).click();
    await shoot(chrome, "needs-you");
    await chrome.getByRole("button", { name: "Allow", exact: true }).click();

    // Only the user's session wrote that, and the runner carried on to the end.
    await expect.poll(async () => (await supabase.cloudRows("select status from public.cloud_jobs"))[0].status, { timeout: 30_000 }).toBe("done");
    expect(await supabase.cloudRows("select kind, decision from public.cloud_approvals")).toEqual([{ kind: "approval", decision: "allow" }]);
    await expect
      .poll(async () => chrome.evaluate(async () => {
        const [chat] = (await window.chromeAPI.library.getLibrary()).chats;
        return (await window.chromeAPI.library.getChat(chat.id))?.messages.at(-1)?.content;
      }), { timeout: 15_000 })
      .toBe("Ordered it");
    // Real input reached the page in the runner's browser, and nothing opened in this window.
    expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Order placed");
    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    expect(tabs.some((tab) => tab.url === shop || tab.page === "cloud")).toBe(false);

    const chatId = await chrome.evaluate(async () => (await window.chromeAPI.library.getLibrary()).chats[0].id);
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), chatId);
    await expect(chrome.getByText("Ordered it")).toBeVisible();
    await shoot(chrome, "chat-done");

    // The runner says only which job and how it went.
    expect(runnerLog).toContain(`Job ${job.id}: done.`);
    expect(runnerLog).not.toContain(PROMPT);
    expect(runnerLog).not.toContain("Order placed");
    expect(runnerLog).not.toContain("Place order");
  } finally {
    runner?.kill("SIGTERM");
    await app.close();
    supabase.close();
    model.close();
    shopServer.close();
  }
});
