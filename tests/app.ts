import {
  _electron as electron,
  errors,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Two launches and a view stay inside the 30 second test timeout, so a hang names the step that stuck.
const LAUNCH_TIMEOUT_MS = 12_000;
const VIEW_TIMEOUT_MS = 5_000;
const VIEW_POLL_MS = 50;
const CLOSE_TIMEOUT_MS = 10_000;

// Now and then on Windows CI the app starts and Playwright connects to it, and then the launch never
// finishes. We don't know why yet, and the next launch works. This line in a log means it happened again.
export async function retryStuckLaunch<T>(launch: () => Promise<T>): Promise<T> {
  try {
    return await launch();
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
    console.log(`Launch stuck on ${process.platform} after ${LAUNCH_TIMEOUT_MS}ms, trying once more`);
    return await launch();
  }
}

// Now and then on Windows CI the app is told to quit and its process never exits, which used to fail the
// test, hold up the worker for another 30 seconds and leave the app running. This line in a log means it
// happened again.
export async function closeWithin(close: () => Promise<void>, kill: () => void, timeoutMs = CLOSE_TIMEOUT_MS) {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  const hung = await Promise.race([close().then(() => false), timedOut]);
  clearTimeout(timer);
  if (!hung) return;
  console.log(`App didn't quit on ${process.platform} within ${timeoutMs}ms, killing it`);
  kill();
}

// Windows needs the whole tree named, or the app's helper processes stay behind.
export const killApp = (app: ElectronApplication) => {
  const { pid } = app.process();
  if (process.platform === "win32" && pid) execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"]);
  else app.process().kill("SIGKILL");
};

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
  const app = await retryStuckLaunch(() =>
    electron.launch({
      executablePath: electronPath as unknown as string,
      // A fresh profile keeps tests apart and away from the developer's real browsing data.
      args: [...background, ".", `--user-data-dir=${userDataDir}`],
      env,
      timeout: LAUNCH_TIMEOUT_MS,
    })
  );
  console.log(`App launched in ${Date.now() - started}ms`);
  app.process().stderr?.on("data", (data) => console.log(`[app stderr] ${data}`));
  const close = app.close.bind(app);
  app.close = () => closeWithin(close, () => killApp(app));
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
