// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";

// A job from ChatGPT or Claude, started through the relay's own database function, runs in Blueberry on this Mac once
// Settings allows it: it shows as a chat from them, runs with the fake model, and its reply lands in the job's row. With
// the switch off, nothing is taken. The real migrations run in Postgres; only the model and Supabase's HTTP are stand-ins.
const EMAIL = "ana@example.com";
const PASSWORD = "correct horse battery";
const RUNNER_EMAIL = "runner@example.com";
const RUNNER_PASSWORD = "a long random runner password";
const PROMPT = "What's the price of tea?";
const REPLY = "Tea is £4 at the shop.";

test("a relay job runs as a chat on this Mac only while the switch is on, and its reply goes back to the row", async () => {
  test.setTimeout(90_000);
  const model = await startFakeModel();
  const supabase = await startFakeSupabase({ cloudJobs: true });
  const app = await launchApp(undefined, { modelEnv: { ...model.env, ...supabase.env } });
  const rpcAs = async (email: string, password: string, name: string, body: object) => {
    const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = supabase.env;
    const session = await (await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  };
  try {
    const chrome = await findView(app, "view=chrome");
    expect((await chrome.evaluate(({ email, password }) => window.chromeAPI.account.signUp(email, password), { email: EMAIL, password: PASSWORD })).status).toBe("signed-in");
    await supabase.addAccount(RUNNER_EMAIL, RUNNER_PASSWORD);
    await chrome.evaluate((email) => window.chromeAPI.cloud.linkRunner(email), RUNNER_EMAIL);
    expect(await rpcAs(RUNNER_EMAIL, RUNNER_PASSWORD, "accept_cloud_runner_link", { p_owner_email: EMAIL })).toBe(true);
    await supabase.cloudRows("update public.cloud_runner_links set relay_url = 'https://runner.example/mcp'");
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.cloud.runnerState())).status).toBe("linked");
    // The grant the relay's sign-in page makes, as the owner, once.
    const secret = await rpcAs(EMAIL, PASSWORD, "create_relay_grant", {});
    const startJob = (where: string) => rpcAs(RUNNER_EMAIL, RUNNER_PASSWORD, "relay_start_job", { p_secret: secret, p_prompt: PROMPT, p_mascot: { id: "berry", name: "Berry", sites: [], tools: [] }, p_where: where });

    // Off by default: the Mac isn't there, so a job for it is refused.
    expect(await startJob("mac")).toBeNull();

    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Cloud" }));
    const toggle = chrome.getByRole("switch", { name: "Run their jobs on this Mac when it’s on" });
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await supabase.cloudRows("select enabled from public.cloud_mac_presence"))[0]?.enabled).toBe(true);

    model.replyWith(REPLY);
    const jobId = await startJob("auto");
    expect((await supabase.cloudRows(`select target from public.cloud_jobs where id = '${jobId}'`))[0].target).toBe("mac");

    // It's a chat here, from them, with no page, and its reply lands in the row.
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.find(({ from }) => from === "ChatGPT or Claude")?.title ?? null, { timeout: 15_000 }).not.toBeNull();
    await expect.poll(async () => (await supabase.cloudRows(`select status, reply from public.cloud_jobs where id = '${jobId}'`))[0], { timeout: 20_000 }).toEqual({ status: "done", reply: REPLY });
    const chat = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.find(({ from }) => from === "ChatGPT or Claude")!;
    expect(chat.cloud).toBe(false);
    expect(await rpcAs(RUNNER_EMAIL, RUNNER_PASSWORD, "relay_jobs", { p_secret: secret, p_ids: [jobId] })).toMatchObject([{ status: "done", reply: REPLY, target: "mac" }]);

    // Off again: the server is told, and a job for the Mac waits untaken.
    await toggle.click();
    await expect.poll(async () => (await supabase.cloudRows("select enabled from public.cloud_mac_presence"))[0]?.enabled).toBe(false);
    expect(await startJob("mac")).toBeNull();
    const [{ id: waiting }] = await supabase.cloudRows(
      `insert into public.cloud_jobs (owner, prompt, mascot, target, conversation_id) select id, 'Not now', '{"id":"berry"}'::jsonb, 'mac', gen_random_uuid() from auth.users where email = '${EMAIL}' returning id`
    );
    await new Promise((resolve) => setTimeout(resolve, 7_000));
    expect((await supabase.cloudRows(`select status from public.cloud_jobs where id = '${waiting}'`))[0].status).toBe("queued");
    expect((await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).chats.filter(({ from }) => from === "ChatGPT or Claude")).toHaveLength(1);
    // Nothing here answered anything.
    expect(supabase.received.some(({ path }) => path.includes("decide_cloud_approval"))).toBe(false);
  } finally {
    await app.close();
    model.close();
    supabase.close();
  }
});
