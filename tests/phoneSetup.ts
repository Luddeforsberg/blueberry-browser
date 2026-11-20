import { expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { normalize } from "node:path/posix";
import type { MascotProfile } from "../src/shared/library";
import { FAKE_KEY } from "./fakeSupabase";

// What phone.spec.ts sets up around its test: the mascots, the stand-in page, the browser, the site and the REST API.
export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = join(__dirname, "..", "site");

export const SCOUT: MascotProfile = {
  id: "m-scout",
  name: "Scout",
  look: { palette: "lingon", accessory: "cap" },
  instructions: "Find the cheapest one that fits.",
  sites: ["shop.example", "prices.example"],
  tools: ["visit", "click", "type"],
  deletedAt: null,
};
export const PENNY: MascotProfile = {
  ...SCOUT,
  id: "m-penny",
  name: "Penny",
  look: { palette: "cloudberry", accessory: "glasses" },
  sites: ["news.example"],
  tools: ["visit"],
};

// Someone else's page, as it would show in the live view.
export const SHOP = `<!doctype html><title>Shop</title><style>body{font:16px system-ui;margin:24px;color:#222;background:#fff}input{display:block;margin:8px 0;padding:8px;width:80%}</style>
<h1>shop.example</h1><p>Sign in to go on.</p><label>Email<input id="email"></label><label>Code<input id="code" autocomplete="one-time-code"></label><button>Sign in</button>`;

// Chrome on a Mac, and on Windows Edge, which comes with it.
export const BROWSER = process.platform === "win32" ? { channel: "msedge" } : { executablePath: CHROME };

// Where the phone page's pictures go, light and dark, for looking at by eye.
export const SHOTS = process.env.BLUEBERRY_SHOTS ?? join(homedir(), "blueberry-audit", "shots-phone");
export const shooter = () => {
  mkdirSync(SHOTS, { recursive: true });
  return async (target: Page, name: string) => {
    await target.waitForTimeout(200);
    await target.screenshot({ path: join(SHOTS, `${name}-light.png`), fullPage: true });
    await target.emulateMedia({ colorScheme: "dark" });
    await target.waitForTimeout(200);
    await target.screenshot({ path: join(SHOTS, `${name}-dark.png`), fullPage: true });
    await target.emulateMedia({ colorScheme: "light" });
  };
};

// The site as deployed, pointed at the fake server, which is plain http on 127.0.0.1.
export const serveSite = async (base: string, publicKey: string) => {
  const respond = async (request: IncomingMessage, response: ServerResponse) => {
    let path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://site").pathname));
    if (path.endsWith("/")) path += "index.html";
    if (path.includes("..")) {
      response.writeHead(404).end();
      return;
    }
    if (path === "/config.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(
        `export const SUPABASE_URL = ${JSON.stringify(base)}; export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(FAKE_KEY)}; export const GET_BLUEBERRY_URL = "/"; export const VAPID_PUBLIC_KEY = ${JSON.stringify(publicKey)};`,
      );
      return;
    }
    try {
      let body: Buffer | string = await readFile(join(SITE, path));
      if (path === "/app/index.html") body = body.toString().replace("connect-src https:", `connect-src https: ${base}`);
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
        ".woff2": "font/woff2",
      };
      response.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  };
  const site = createServer((request, response) => void respond(request, response));
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  return site;
};

// The REST API as one user, the way the app and the runner call it.
export const restApi = (base: string) => {
  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: FAKE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return ((await response.json()) as { access_token: string }).access_token;
  };
  const rpc = async (token: string, name: string, body: object = {}) => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: FAKE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status, name).toBe(200);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  return { signIn, rpc };
};
