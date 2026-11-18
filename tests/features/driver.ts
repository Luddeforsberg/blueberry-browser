import type { ElectronApplication, Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Settings } from "../../src/shared/ipc";
import { findView, launchApp } from "../app";
import { startFakeModel, type FakeModel } from "../fakeModel";
import { startFakeSupabase } from "../fakeSupabase";
import { startCloudBrowser } from "./cloudBrowser";
import { captureWindow } from "./capture";
import type { Feature, Look, Needs } from "./map";
import { drivePhone } from "./phone";
import { startSite, type Site } from "./site";

type FakeSupabase = Awaited<ReturnType<typeof startFakeSupabase>>;

// Everything a feature's `open` gets: the app, its chrome view, and the fakes behind it.
export interface Drive {
  app: ElectronApplication;
  chrome: Page;
  model: FakeModel;
  site: Site;
  supabase: FakeSupabase | null;
  look: Look;
}

// The moment every drive starts at, so dates, times and "Today" come out the same: Monday 15 June 2026, 10:00 here.
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();
const HEIGHT = 800;
const STEP_TIMEOUT_MS = 10_000;

export const DEFAULT_LOOK: Look = { theme: "light", layout: "vertical", width: 1280 };

// The window's saved settings for this look. Berry keeps still, so the pictures do too.
const settingsFor = (needs: Needs, look: Look, profile: string): Partial<Settings> => ({
  onboarded: !needs.firstRun,
  startersAdded: !needs.starters,
  appearance: look.theme,
  layoutMode: look.layout,
  keepBerryStill: true,
  downloadFolder: join(profile, "downloads"),
  ...needs.settings,
});

// Launches the built app with what the feature needs, opens the state, and returns its picture.
export async function driveFeature(feature: Feature, stateName: string, look: Look): Promise<{ png: Buffer; restless: string | null }> {
  if (!Object.hasOwn(feature.states, stateName))
    throw new Error(`${feature.name} has no state "${stateName}". It has: ${Object.keys(feature.states).join(", ")}`);
  if (feature.surface === "phone") return drivePhone(feature.states[stateName].open, look.theme, NOW);
  const state = feature.states[stateName];
  const needs: Needs = { ...feature.needs, ...state.needs, settings: { ...feature.needs?.settings, ...state.needs?.settings } };
  const profile = mkdtempSync(join(tmpdir(), "blueberry-drive-"));
  mkdirSync(join(profile, "downloads"));
  writeFileSync(join(profile, "settings.json"), JSON.stringify(settingsFor(needs, look, profile)));

  const site = await startSite();
  const model = await startFakeModel();
  needs.model?.(model);
  const supabase = needs.supabase ? await startFakeSupabase() : null;
  const cloud = needs.cloudBrowser ? await startCloudBrowser(site) : null;
  let app: ElectronApplication | null = null;
  try {
    await needs.profile?.(profile, NOW);
    app = await launchApp(profile, {
      modelEnv: {
        ...model.env,
        ...supabase?.env,
        ...cloud?.env,
        ...needs.env?.(profile),
        BLUEBERRY_DRIVE_NOW: String(NOW),
        BLUEBERRY_DRIVE_HOSTS: site.hostRules,
      },
      preload: [join(__dirname, "driveFakes.cjs")],
    });
    // A state that can't be reached fails in seconds, not at the end of the test's time.
    app.context().setDefaultTimeout(STEP_TIMEOUT_MS);
    await app.evaluate(({ BaseWindow }, size) => BaseWindow.getAllWindows()[0].setSize(size.width, size.height), {
      width: look.width,
      height: HEIGHT,
    });
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => document.fonts.ready.then(() => undefined));
    const drive: Drive = { app, chrome, model, site, supabase, look };
    await state.open(drive);
    return await captureWindow(app, { view: state.window ?? feature.window ?? "chrome", theme: look.theme });
  } finally {
    await app?.close();
    await cloud?.close();
    model.close();
    site.close();
    supabase?.close();
  }
}
