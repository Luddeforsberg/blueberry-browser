import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Together these stay inside the 30 second test timeout, so a hang names the step that stuck.
const LAUNCH_TIMEOUT_MS = 18_000;
const VIEW_TIMEOUT_MS = 10_000;
const VIEW_POLL_MS = 50;

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

  const started = Date.now();
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    // A fresh profile keeps tests apart and away from the developer's real browsing data.
    args: [...background, ".", `--user-data-dir=${userDataDir}`],
    env,
    timeout: LAUNCH_TIMEOUT_MS,
  });
  // Reporters only print a test's output when it fails.
  console.log(`App launched in ${Date.now() - started}ms`);
  app.process().stderr?.on("data", (data) => console.log(`[app stderr] ${data}`));
  return app;
}

// Each WebContentsView shows up as its own Playwright window. A window can exist before it reaches
// its address, and no event says when it does, so this keeps looking.
export async function findView(
  app: Pick<ElectronApplication, "windows">,
  urlPart: string
): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < VIEW_TIMEOUT_MS) {
    const view = app.windows().find((page) => page.url().includes(urlPart));
    if (view) {
      console.log(`Found ${urlPart} in ${Date.now() - started}ms`);
      return view;
    }
    await new Promise((resolve) => setTimeout(resolve, VIEW_POLL_MS));
  }
  const open = app.windows().map((page) => page.url());
  throw new Error(`No view at ${urlPart} after ${VIEW_TIMEOUT_MS}ms. Open: ${JSON.stringify(open)}`);
}
