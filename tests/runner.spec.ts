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
import { mascotSnapshot } from "../src/main/cloudJobs";
import { BERRY } from "../src/shared/mascots";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";

// A job sent to the cloud runner: the real runner, built and started as its own Node process, takes it from the real
// migration in Postgres, works in a headless Chrome standing in for Browserbase, and waits on an approval the user
// answers in Blueberry's Needs you. Only the model and Supabase's HTTP layer are stand-ins.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.BLUEBERRY_SHOTS ?? join(homedir(), "blueberry-audit", "shots-runner");
const EMAIL = "ana@example.com";
const RUNNER_EMAIL = "runner@example.com";
const RUNNER_PASSWORD = "a long random runner password";
const PROMPT = "Order the thing from my shop";
const PHONE_PROMPT = "What's on my shop's front page?";

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

    // The runner's own account, made in the dashboard, and linked from Settings > Cloud.
    await supabase.addAccount(RUNNER_EMAIL, RUNNER_PASSWORD);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    const runnerField = chrome.getByLabel("Runner's email");
    await runnerField.scrollIntoViewIfNeeded();
    await runnerField.fill(RUNNER_EMAIL);
    await chrome.getByRole("button", { name: "Link", exact: true }).click();
    await expect(chrome.getByText(`Linked to ${RUNNER_EMAIL}. Waiting for the runner`)).toBeVisible();
    await shoot(chrome, "settings-runner-waiting");

    runner = spawn(process.execPath, ["runner/dist/index.cjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        ...model.env,
        LLM_PROVIDER: "openai",
        SUPABASE_URL: supabase.env.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: supabase.env.SUPABASE_PUBLISHABLE_KEY,
        BLUEBERRY_RUNNER_EMAIL: RUNNER_EMAIL,
        BLUEBERRY_RUNNER_PASSWORD: RUNNER_PASSWORD,
        BLUEBERRY_RUNNER_OWNER: EMAIL,
        BLUEBERRY_RUNNER_CHROME: CHROME,
        BLUEBERRY_RUNNER_POLL_MS: "300",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    runner.stdout?.on("data", (part: Buffer) => (runnerLog += part));
    runner.stderr?.on("data", (part: Buffer) => (runnerLog += part));

    // The runner accepts on start, and Settings says so.
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.cloud.runnerState())).status, { timeout: 20_000 }).toBe("linked");
    await expect(chrome.getByText(`${RUNNER_EMAIL} is your runner.`)).toBeVisible();
    await shoot(chrome, "settings-runner-linked");
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));

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

    // A job sent from the phone, as the same account, shows here as a runner chat once the runner has done it, and a
    // follow-up from here goes to the runner in the same conversation, carrying that exchange.
    const base = supabase.env.SUPABASE_URL;
    const asOwner = async (name: string, body: object) => {
      const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: supabase.env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "correct horse battery" }) });
      const { access_token: token } = (await signIn.json()) as { access_token: string };
      const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: supabase.env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      expect(response.status, name).toBe(200);
      return response.json();
    };
    model.replyWith("Found it from the phone");
    const phoneJob = await asOwner("start_cloud_job", { p_prompt: PHONE_PROMPT, p_history: [], p_mascot: mascotSnapshot(BERRY), p_action_approval: "risky", p_context_id: null });
    const phoneChat = async () =>
      chrome.evaluate(async (prompt) => {
        for (const { id } of (await window.chromeAPI.library.getLibrary()).chats) {
          const chat = await window.chromeAPI.library.getChat(id);
          if (chat?.messages[0]?.content === prompt) return { id, runner: chat.runner === true, messages: chat.messages.map(({ role, content }) => ({ role, content })) };
        }
        return null;
      }, PHONE_PROMPT);
    await expect.poll(async () => (await phoneChat())?.messages.at(-1)?.content, { timeout: 40_000 }).toBe("Found it from the phone");
    const adopted = (await phoneChat())!;
    expect(adopted.runner).toBe(true);
    expect(adopted.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), adopted.id);
    await expect(chrome.getByText("Sent to the runner")).toBeVisible();
    await expect(chrome.getByText("Found it from the phone")).toBeVisible();
    await shoot(chrome, "chat-from-phone");

    model.replyWith("Followed up from the Mac");
    await chrome.evaluate((id) => window.chromeAPI.chat.send(id, "And from here?", { seePage: false }), adopted.id);
    await expect.poll(async () => (await supabase.cloudRows("select status from public.cloud_jobs where prompt = 'And from here?'"))[0]?.status, { timeout: 30_000 }).toBe("done");
    const [followUp] = await supabase.cloudRows("select conversation_id, history from public.cloud_jobs where prompt = 'And from here?'");
    expect(followUp.conversation_id).toBe(phoneJob);
    expect(followUp.history).toEqual([{ role: "user", content: PHONE_PROMPT }, { role: "assistant", content: expect.stringContaining("Found it from the phone") }]);
    await expect.poll(async () => (await phoneChat())?.messages.at(-1)?.content, { timeout: 15_000 }).toBe("Followed up from the Mac");

    // The runner says only which job and how it went.
    expect(runnerLog).toContain(`Job ${job.id}: done.`);
    expect(runnerLog).not.toContain(PROMPT);
    expect(runnerLog).not.toContain("Order placed");
    expect(runnerLog).not.toContain("Place order");
    expect(runnerLog).not.toContain(RUNNER_PASSWORD);
    expect(runnerLog).toContain("Linked to its owner.");
  } finally {
    runner?.kill("SIGTERM");
    await app.close();
    supabase.close();
    model.close();
    shopServer.close();
  }
});
