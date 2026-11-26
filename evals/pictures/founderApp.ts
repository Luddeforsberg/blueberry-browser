import type { ElectronApplication, Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsStore } from "../../src/main/settings/SettingsStore";
import type { Settings } from "../../src/shared/ipc";
import { findView, launchApp } from "../../tests/app";
import { costOf, installMeter, readCalls } from "../meter";
import { readModelEnv } from "../modelEnv";
import { captureRect, showOnScreen, windowFrame } from "./screen";

// The founder's profile in the built app, with the real model, on the screen, and what each launch spent.

// Long enough for the window to come forward and draw, and a page's own animations to end.
const SETTLE_MS = 1_500;
const BUDGET_USD = Number(process.env.PICTURES_BUDGET ?? 6);
const MODEL_KEYS = ["LLM_PROVIDER", "LLM_MODEL", "LLM_TITLE_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

export interface Founder {
  app: ElectronApplication;
  chrome: Page;
  profile: string;
  // The window's native handle, to find its frame on the screen.
  handle: string;
}

// Only the model's keys from .env: no Supabase, Firecrawl or Browserbase, so nothing signs in to the owner's accounts
// and every page is opened by Berry itself.
const modelOnly = (): Record<string, string> =>
  Object.fromEntries(Object.entries(readModelEnv()).filter(([key]) => MODEL_KEYS.includes(key)));

const spentFile = (profile: string) => join(profile, "pictures-spent.json");
const spent = (profile: string): number =>
  existsSync(spentFile(profile)) ? (JSON.parse(readFileSync(spentFile(profile), "utf8")) as number) : 0;

export const overBudget = (profile: string): boolean => spent(profile) >= BUDGET_USD;

export async function launchFounder(
  profile: string,
  { settings = {}, env = {} }: { settings?: Partial<Settings>; env?: Record<string, string> } = {},
): Promise<Founder> {
  const saved = new SettingsStore(join(profile, "settings.json"));
  saved.update({ appearance: "light", layoutMode: "vertical", keepBerryStill: true, actionApproval: "risky", ...settings });
  saved.flush();
  const app = await launchApp(profile, {
    modelEnv: { ...modelOnly(), BLUEBERRY_MCP_PORT: "0", BLUEBERRY_CLOUD_LOCAL: "1", ...env },
    onScreen: true,
  });
  await installMeter(app);
  const { handle, scale } = await showOnScreen(app);
  if (scale !== 1) console.log(`The picture's display is at a scale of ${scale}, so pictures will be ${scale} times the window's size`);
  const chrome = await findView(app, "view=chrome");
  await chrome.evaluate(() => document.fonts.ready.then(() => undefined));
  // She keeps her apps on top and the bookmarks folded, which the sidebar doesn't remember between launches.
  await chrome.getByRole("button", { name: "Fold bookmarks" }).click();
  return { app, chrome, profile, handle };
}

// Adds what this launch spent to the profile's total, then quits.
export async function closeFounder({ app, profile }: Founder): Promise<number> {
  // The usage arrives as a response finishes being read.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const cost = costOf(await readCalls(app));
  writeFileSync(spentFile(profile), JSON.stringify(spent(profile) + cost));
  await app.close();
  console.log(`This launch spent $${cost.toFixed(3)}, $${spent(profile).toFixed(3)} in all`);
  return cost;
}

// Chromium writes WebP itself, so no encoder is added to the repo. Lossless, since lossy blurs the edges of text.
const toWebp = (page: Page, png: Buffer): Promise<Buffer> =>
  page
    .evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const webp = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp", quality: 1 })).arrayBuffer());
      let binary = "";
      for (let at = 0; at < webp.length; at += 0x8000) binary += String.fromCharCode(...webp.subarray(at, at + 0x8000));
      return btoa(binary);
    }, png.toString("base64"))
    .then((base64) => Buffer.from(base64, "base64"));

const IMAGES = join(__dirname, "..", "..", "docs", "images");
const LOOKS = join(__dirname, "..", "..", "test-results", "pictures");

// The README's picture, and a PNG of it beside the test results to look at.
export async function savePicture(page: Page, name: string, png: Buffer): Promise<void> {
  mkdirSync(LOOKS, { recursive: true });
  writeFileSync(join(LOOKS, `${name}.png`), png);
  writeFileSync(join(IMAGES, `${name}.webp`), await toWebp(page, png));
  console.log(`Saved docs/images/${name}.webp`);
}

// The window as it is on the screen, frame and all, brought in front first.
export async function pictureWindow(founder: Founder, name: string): Promise<void> {
  await showOnScreen(founder.app);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  await savePicture(founder.chrome, name, captureRect(windowFrame(founder.handle)));
}
