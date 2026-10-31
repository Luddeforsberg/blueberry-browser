import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Launches the built app in out/, so run `pnpm exec electron-vite build` first.
// Pass a profile folder to launch again with the same saved settings.
// Tests skip onboarding unless they ask for a first launch.
// They have no model unless they pass one, and a .env file can't change that: it never overrides these.
export async function launchApp(
  userDataDir = mkdtempSync(join(tmpdir(), "blueberry-test-")),
  { firstLaunch = false, modelEnv = {} }: { firstLaunch?: boolean; modelEnv?: Record<string, string> } = {}
): Promise<ElectronApplication> {
  const settingsFile = join(userDataDir, "settings.json");
  if (!firstLaunch && !existsSync(settingsFile)) {
    writeFileSync(settingsFile, JSON.stringify({ onboarded: true }));
  }

  // Some shells export ELECTRON_RUN_AS_NODE, which would start Node instead of the app.
  const env = {
    ...process.env,
    LLM_PROVIDER: "",
    LLM_MODEL: "",
    LLM_TITLE_MODEL: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    ...modelEnv,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  // CI has nobody to disturb, so it runs the app exactly as users get it.
  const background = process.env.CI ? [] : ["-r", join(__dirname, "background.cjs")];

  return electron.launch({
    executablePath: electronPath as unknown as string,
    // A fresh profile keeps tests apart and away from the developer's real browsing data.
    args: [...background, ".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

// Each WebContentsView shows up as its own Playwright window.
export async function findView(
  app: ElectronApplication,
  urlPart: string
): Promise<Page> {
  const matches = (page: Page) => page.url().includes(urlPart);
  return (
    app.windows().find(matches) ??
    app.waitForEvent("window", { predicate: matches })
  );
}
