import { chromium, expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import webpush from "web-push";
import { mascotFromSnapshot, mascotSnapshot } from "../src/main/cloudJobs";
import type { MascotProfile } from "../src/shared/library";
import { flockRows } from "../src/shared/phone";
import { FAKE_KEY, startFakeSupabase } from "./fakeSupabase";

// The phone page, served from site/ as Netlify would, in Chrome at a phone's size, against the real migrations in
// Postgres under the fake REST layer. The runner's side is played by its own REST calls as its own user, so every rule
// on the way is the real one. Only the live view's page is a stand-in, since it's Browserbase's.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.BLUEBERRY_SHOTS ?? join(homedir(), "blueberry-audit", "shots-phone");
const SITE = join(__dirname, "..", "site");
const OWNER = "ana@example.com";
const OWNER_PASSWORD = "correct horse battery";
const RUNNER = "runner@example.com";
const RUNNER_PASSWORD = "a long random runner password";
const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/abc";
const CODE = "482913";
const ASKED = "Click the button “Place order” on https://shop.example/cart";

const SCOUT: MascotProfile = {
  id: "m-scout",
  name: "Scout",
  look: { palette: "robin", accessory: "cap" },
  instructions: "Find the cheapest one that fits.",
  sites: ["shop.example", "prices.example"],
  tools: ["visit", "click", "type"],
  deletedAt: null,
};
const PENNY: MascotProfile = { ...SCOUT, id: "m-penny", name: "Penny", look: { palette: "canary", accessory: "glasses" }, sites: ["news.example"], tools: ["visit"] };

// Someone else's page, as it would show in the live view.
const SHOP = `<!doctype html><title>Shop</title><style>body{font:16px system-ui;margin:24px;color:#222;background:#fff}input{display:block;margin:8px 0;padding:8px;width:80%}</style>
<h1>shop.example</h1><p>Sign in to go on.</p><label>Email<input id="email"></label><label>Code<input id="code" autocomplete="one-time-code"></label><button>Sign in</button>`;

test.skip(process.platform !== "darwin" || !existsSync(CHROME), "Needs Google Chrome");

test("the phone page signs in, shows a job, allows it, starts one, and never sends a code", async () => {
  test.setTimeout(120_000);
  const supabase = await startFakeSupabase({ cloudJobs: true });
  const base = supabase.env.SUPABASE_URL;
  const { publicKey } = webpush.generateVAPIDKeys();

  // The site as deployed, pointed at the fake server, which is plain http on 127.0.0.1.
  const site = createServer(async (request, response) => {
    let path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://site").pathname));
    if (path.endsWith("/")) path += "index.html";
    if (path.includes("..")) {
      response.writeHead(404).end();
      return;
    }
    if (path === "/config.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(`export const SUPABASE_URL = ${JSON.stringify(base)}; export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(FAKE_KEY)}; export const GET_BLUEBERRY_URL = "/"; export const VAPID_PUBLIC_KEY = ${JSON.stringify(publicKey)};`);
      return;
    }
    try {
      let body: Buffer | string = await readFile(join(SITE, path));
      if (path === "/app/index.html") body = body.toString().replace("connect-src https:", `connect-src https: ${base}`);
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
      response.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const app = `http://127.0.0.1:${(site.address() as AddressInfo).port}/app/`;

  // The REST API as one user, the way the app and the runner call it.
  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: FAKE_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    return ((await response.json()) as { access_token: string }).access_token;
  };
  const rpc = async (token: string, name: string, body: object = {}) => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: FAKE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status, name).toBe(200);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light", reducedMotion: "reduce" });
  await context.route("https://www.browserbase.com/**", (route) => route.fulfill({ contentType: "text/html", body: SHOP }));
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  mkdirSync(SHOTS, { recursive: true });
  const shoot = async (target: Page, name: string) => {
    await target.waitForTimeout(200);
    await target.screenshot({ path: join(SHOTS, `${name}-light.png`), fullPage: true });
    await target.emulateMedia({ colorScheme: "dark" });
    await target.waitForTimeout(200);
    await target.screenshot({ path: join(SHOTS, `${name}-dark.png`), fullPage: true });
    await target.emulateMedia({ colorScheme: "light" });
  };

  try {
    // Set up as the app leaves it: the runner linked and accepted, and the flock shared, with mascot fields only.
    await supabase.addAccount(OWNER, OWNER_PASSWORD);
    await supabase.addAccount(RUNNER, RUNNER_PASSWORD);
    const owner = await signIn(OWNER, OWNER_PASSWORD);
    const runner = await signIn(RUNNER, RUNNER_PASSWORD);
    expect(await rpc(owner, "link_cloud_runner", { p_email: RUNNER })).toBe(true);
    expect(await rpc(runner, "accept_cloud_runner_link", { p_owner_email: OWNER })).toBe(true);
    await rpc(owner, "sync_cloud_flock", { p_birds: flockRows([SCOUT, PENNY]) });

    // A job sent from the Mac, which the runner has started and is now asking about.
    const first = await rpc(owner, "start_cloud_job", { p_prompt: "Find the cheapest USB-C cable on shop.example and put it in my cart", p_history: [], p_mascot: mascotSnapshot(SCOUT), p_action_approval: "risky", p_context_id: "ctx-ana" });
    expect((await rpc(runner, "runner_claim_job"))[0].id).toBe(first);
    const steps = [{ text: "Opened shop.example", done: true }, { text: "Compared 14 cables by price", done: true }];
    await rpc(runner, "runner_update_job", { p_job: first, p_steps: steps, p_live_view: LIVE });
    const approval = await rpc(runner, "runner_ask", { p_job: first, p_kind: "approval", p_text: ASKED });

    // 1. Sign in.
    await page.goto(app);
    await expect(page.getByRole("heading", { name: "Your flock, from your phone" })).toBeVisible();
    await shoot(page, "signin");
    await page.getByLabel("Email").fill(OWNER);
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password don’t match an account.")).toBeVisible();
    // That refusal is the one error the console may show.
    problems.length = 0;
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // 2. See the job, waiting on the user, with the shared bird's name.
    const row = page.getByRole("link", { name: /Scout wants to click the button “Place order” on shop\.example/ });
    await expect(row).toBeVisible();
    await expect(page.getByText("Ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
    await shoot(page, "list");

    // 3. Allow, with the exact words in full, and the decision is written as the user.
    await row.click();
    const card = page.getByRole("region", { name: "Approval needed" });
    await expect(card.getByText(ASKED, { exact: true })).toBeVisible();
    await expect(page.locator(".live iframe")).toHaveAttribute("inert", "");
    await shoot(page, "approval");
    await card.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(page.getByText("Allowed. Scout carries on.")).toBeVisible();
    expect(await supabase.cloudRows(`select decision from public.cloud_approvals where id = '${approval}'`)).toEqual([{ decision: "allow" }]);
    expect(await rpc(runner, "runner_decision", { p_approval: approval })).toEqual([{ decision: "allow", answer: null }]);

    // Running again, its steps as they're written, and the live view locked.
    await rpc(runner, "runner_update_job", { p_job: first, p_status: "running", p_steps: [...steps, { text: "Adding it to the cart", done: false }] });
    await expect(page.getByText("Adding it to the cart")).toBeVisible();
    await expect(page.getByText(/Locked while Scout works/)).toBeVisible();
    await shoot(page, "job");

    // 5. A sign-in handed to the user: taken over in the live view, where the code goes, and nothing here can take it.
    const handoff = await rpc(runner, "runner_ask", { p_job: first, p_kind: "handoff", p_text: "Sign in on shop.example", p_need: "sign-in", p_site: "shop.example" });
    await expect(page.getByText("Scout needs you to sign in on shop.example")).toBeVisible();
    const frameBefore = await page.locator(".live iframe").elementHandle();
    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.locator(".live iframe")).not.toHaveAttribute("inert", "");
    // The same frame, never reloaded, and no field of the page's own anywhere.
    expect(await page.locator(".live iframe").evaluate((node, before) => node === before, frameBefore)).toBe(true);
    await expect(page.locator("main input, main textarea")).toHaveCount(0);
    const live = page.frameLocator(".live iframe");
    await live.getByLabel("Email").fill(OWNER);
    await live.getByLabel("Code").fill(CODE);
    await shoot(page, "handoff");
    await page.getByRole("button", { name: "I’m done" }).click();
    await expect(page.getByText("Scout has the page back.")).toBeVisible();
    expect(await supabase.cloudRows(`select decision from public.cloud_approvals where id = '${handoff}'`)).toEqual([{ decision: "allow" }]);

    // A question can be answered here, but nothing shaped like a code is sent.
    await rpc(runner, "runner_update_job", { p_job: first, p_status: "running" });
    const question = await rpc(runner, "runner_ask", { p_job: first, p_kind: "question", p_text: "Which colour, black or white?" });
    const answer = page.getByLabel("Your answer");
    await answer.fill(CODE);
    await page.getByRole("button", { name: "Answer" }).click();
    await expect(page.getByText("That looks like a code, so it wasn’t sent.")).toBeVisible();
    expect(await supabase.cloudRows(`select decision, answer from public.cloud_approvals where id = '${question}'`)).toEqual([{ decision: null, answer: null }]);
    await answer.fill("Black, please");
    await page.getByRole("button", { name: "Answer" }).click();
    await expect(page.getByText("Answered. Scout carries on.")).toBeVisible();
    expect(await supabase.cloudRows(`select decision, answer from public.cloud_approvals where id = '${question}'`)).toEqual([{ decision: "allow", answer: "Black, please" }]);

    // 4. Start a job as a shared bird, with the snapshot the runner accepts.
    await page.getByRole("link", { name: "Jobs" }).click();
    await page.getByRole("link", { name: "Give a bird a job" }).click();
    await page.getByRole("button", { name: /Penny/ }).click();
    await expect(page.getByText("Only visits news.example")).toBeVisible();
    await page.getByLabel("The job").fill("What changed on news.example today?");
    await shoot(page, "start");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".bubble")).toHaveText("What changed on news.example today?");
    const [sent] = await supabase.cloudRows("select mascot, context_id, status from public.cloud_jobs where prompt = 'What changed on news.example today?'");
    expect(sent).toMatchObject({ context_id: "ctx-ana", status: "queued" });
    expect(mascotFromSnapshot(sent.mascot)).toMatchObject({ id: "m-penny", sites: ["news.example"], tools: ["visit"] });

    // Stop it from here.
    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(async () => (await supabase.cloudRows("select status from public.cloud_jobs where prompt = 'What changed on news.example today?'"))[0].status).toBe("stopped");

    // Nothing the user typed into the live view, or the code-shaped answer, ever reached the server.
    expect(supabase.received.filter(({ body, path }) => body.includes(CODE) || path.includes(CODE))).toEqual([]);
    expect(problems).toEqual([]);
  } finally {
    await browser.close();
    site.close();
    supabase.close();
  }
});
