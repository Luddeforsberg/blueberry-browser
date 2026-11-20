import { chromium, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { normalize } from "node:path/posix";
import { FAKE_KEY, startFakeSupabase } from "../fakeSupabase";
import type { Theme } from "./map";

// The phone page in site/app/, served as Netlify would and pointed at the fake Supabase, in Chrome (Edge on Windows)
// at a phone's size, as tests/phone.spec.ts runs it. The runner's side is its own REST calls as its own user.

const SITE = join(__dirname, "..", "..", "site");
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const PHONE_BROWSER = process.platform === "win32" ? { channel: "msedge" } : { executablePath: MAC_CHROME };
export const phoneBrowserMissing = process.platform !== "win32" && !existsSync(MAC_CHROME);

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

// Someone else's page, as it would show in the live view, which is Browserbase's.
const LIVE_PAGE = `<!doctype html><title>Shop</title><style>body{font:16px system-ui;margin:24px;color:#222;background:#fff}</style><h1>shop.example</h1><p>1 m cable, 49 kr</p><button>Place order</button>`;
export const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/abc";

export const OWNER = "ana@example.com";
export const OWNER_PASSWORD = "correct horse battery";
const RUNNER = "runner@example.com";
const RUNNER_PASSWORD = "a long random runner password";

export interface PhoneDrive {
  page: Page;
  // Puts every time on the jobs at the moment drive starts at, so the page's times come out the same.
  settleTimes: () => Promise<void>;
  // A call as the owner or as the runner, the way the app and the runner make them.
  owner: (name: string, body?: object) => Promise<unknown>;
  runner: (name: string, body?: object) => Promise<unknown>;
  signIn: () => Promise<void>;
}

// The page's clock is fixed at `now`, and `settleTimes` puts the server's times just before it, as the app's clock is in
// driveFakes.cjs.
export async function drivePhone(open: (phone: PhoneDrive) => Promise<void>, theme: Theme, now: number): Promise<{ png: Buffer; restless: string | null }> {
  const supabase = await startFakeSupabase({ cloudJobs: true });
  const base = supabase.env.SUPABASE_URL;
  const site = createServer(async (request, response) => {
    let path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://site").pathname));
    if (path.endsWith("/")) path += "index.html";
    if (path.includes("..")) {
      response.writeHead(404).end();
      return;
    }
    if (path === "/config.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(`export const SUPABASE_URL = ${JSON.stringify(base)}; export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(FAKE_KEY)}; export const GET_BLUEBERRY_URL = "/"; export const VAPID_PUBLIC_KEY = "";`);
      return;
    }
    try {
      let body: Buffer | string = await readFile(join(SITE, path));
      if (path === "/app/index.html") body = body.toString().replace("connect-src https:", `connect-src https: ${base}`);
      response.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const app = `http://127.0.0.1:${(site.address() as AddressInfo).port}/app/`;

  const token = async (email: string, password: string) => {
    const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: FAKE_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    return ((await response.json()) as { access_token: string }).access_token;
  };
  const rpc = (who: () => Promise<string>) => async (name: string, body: object = {}) => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: FAKE_KEY, authorization: `Bearer ${await who()}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (response.status !== 200) throw new Error(`${name} answered ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const browser = await chromium.launch(PHONE_BROWSER);
  try {
    await supabase.addAccount(OWNER, OWNER_PASSWORD);
    await supabase.addAccount(RUNNER, RUNNER_PASSWORD);
    const [ownerToken, runnerToken] = [await token(OWNER, OWNER_PASSWORD), await token(RUNNER, RUNNER_PASSWORD)];
    const owner = rpc(async () => ownerToken);
    const runner = rpc(async () => runnerToken);
    // As the app leaves it: the runner linked and accepted.
    await owner("link_cloud_runner", { p_email: RUNNER });
    await runner("accept_cloud_runner_link", { p_owner_email: OWNER });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: theme, reducedMotion: "reduce" });
    await context.clock.setFixedTime(now);
    await context.route("https://www.browserbase.com/**", (route) => route.fulfill({ contentType: "text/html", body: LIVE_PAGE }));
    const page = await context.newPage();
    await page.goto(app);
    await page.getByRole("heading", { name: "Your mascots, from your phone" }).waitFor();
    const signIn = async () => {
      await page.getByLabel("Email").fill(OWNER);
      await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
    };
    const at = `'${new Date(now - 60_000).toISOString()}'`;
    const settleTimes = async () => {
      await supabase.cloudRows(
        `update public.cloud_jobs set created_at = ${at}, updated_at = ${at}, claimed_at = ${at}, heartbeat_at = ${at}, finished_at = case when finished_at is null then null else ${at}::timestamptz end`
      );
      await supabase.cloudRows(`update public.cloud_approvals set created_at = ${at}, decided_at = case when decided_at is null then null else ${at}::timestamptz end`);
    };
    await open({ page, owner, runner, signIn, settleTimes });
    let last: Buffer | null = null;
    for (let tries = 0; tries < 12; tries++) {
      const png = await page.screenshot({ animations: "disabled", caret: "hide" });
      if (last && png.equals(last)) return { png, restless: null };
      last = png;
      await page.waitForTimeout(250);
    }
    return { png: last!, restless: "somewhere on the page" };
  } finally {
    await browser.close();
    site.close();
    supabase.close();
  }
}
