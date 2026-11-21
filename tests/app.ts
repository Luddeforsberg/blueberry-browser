import { _electron as electron, errors, expect, type ElectronApplication, type Page } from "@playwright/test";
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
async function retryStuckLaunch<T>(launch: () => Promise<T>): Promise<T> {
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
async function closeWithin(close: () => Promise<void>, kill: () => void, timeoutMs = CLOSE_TIMEOUT_MS) {
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

// Signal 0 only asks whether the process is there.
const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Windows needs the whole tree named, or the app's helper processes stay behind. taskkill fails when part of the tree has
// already ended while it worked, which is only a failure if the app is still running.
const killApp = (app: ElectronApplication) => {
  const { pid } = app.process();
  if (process.platform !== "win32" || !pid) {
    app.process().kill("SIGKILL");
    return;
  }
  try {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "pipe" });
  } catch (error) {
    if (isRunning(pid)) throw error;
  }
};

// Launches the built app in out/, so run `pnpm exec electron-vite build` first.
// Pass a profile folder to launch again with the same saved settings.
// Tests skip onboarding unless they ask for a first launch, and start with only Berry unless they ask for the starters.
// They have no model unless they pass one, and a .env file can't change that: it never overrides these.
// `preload` adds scripts for the main process to load first, as tests/features/driveFakes.cjs is for `drive`, and `args`
// adds switches for Chromium that have to be there from the start.
export async function launchApp(
  userDataDir = mkdtempSync(join(tmpdir(), "blueberry-test-")),
  {
    firstLaunch = false,
    starters = false,
    modelEnv = {},
    preload = [],
    args = [],
  }: { firstLaunch?: boolean; starters?: boolean; modelEnv?: Record<string, string>; preload?: string[]; args?: string[] } = {},
): Promise<ElectronApplication> {
  const settingsFile = join(userDataDir, "settings.json");
  if (!firstLaunch && !existsSync(settingsFile)) {
    writeFileSync(settingsFile, JSON.stringify({ onboarded: true, startersAdded: !starters }));
  }

  // Some shells export ELECTRON_RUN_AS_NODE, which would start Node instead of the app.
  const env = {
    ...process.env,
    LLM_PROVIDER: "",
    LLM_MODEL: "",
    LLM_TITLE_MODEL: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    BLUEBERRY_SITE_URL: "",
    // A folder that isn't there, so no test looks at the real browsers on this computer.
    BLUEBERRY_BROWSER_DATA: join(userDataDir, "no-browsers"),
    ...modelEnv,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  const started = Date.now();
  const app = await retryStuckLaunch(() =>
    electron.launch({
      executablePath: electronPath as unknown as string,
      // A fresh profile keeps tests apart and away from the developer's real browsing data.
      args: [
        // The same on every computer, CI included: a window off-screen, which may be larger than a runner's small screen.
        "-r",
        join(__dirname, "background.cjs"),
        ...preload.flatMap((file) => ["-r", file]),
        "-r",
        join(__dirname, "motion.cjs"),
        "-r",
        join(__dirname, "fakeKeychain.cjs"),
        "-r",
        join(__dirname, "fakeShortcut.cjs"),
        "-r",
        join(__dirname, "fakeProtocol.cjs"),
        ".",
        `--user-data-dir=${userDataDir}`,
        ...args,
      ],
      env,
      timeout: LAUNCH_TIMEOUT_MS,
    }),
  );
  console.log(`App launched in ${Date.now() - started}ms`);
  app.process().stderr?.on("data", (data) => console.log(`[app stderr] ${data}`));
  const close = app.close.bind(app);
  app.close = () => closeWithin(close, () => killApp(app));
  await windowOpened(app).catch(async (error: unknown) => {
    await app.close();
    throw error;
  });
  return app;
}

// The app is up a moment before its window is, and every test starts from the window.
async function windowOpened(app: ElectronApplication) {
  const deadline = Date.now() + VIEW_TIMEOUT_MS;
  while (!(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length > 0))) {
    if (Date.now() > deadline) throw new Error(`No window after ${VIEW_TIMEOUT_MS}ms`);
    await new Promise((resolve) => setTimeout(resolve, VIEW_POLL_MS));
  }
}

// Our menus and Asking first are drawn in the menu view, over the window (DESIGN.md section 8). Tests press in it as a
// person would, since nothing else can answer it.
const menuRow = (view: Page, label: string) =>
  view.getByRole("menuitem", { name: label, exact: true }).or(view.getByRole("menuitemcheckbox", { name: label, exact: true }));

export async function chooseFromMenu(app: ElectronApplication, label: string): Promise<void> {
  await menuRow(await findView(app, "view=menu"), label).click();
}

// The rows of the menu that's open, in order, with "-" for a hairline.
export async function openMenuRows(app: ElectronApplication): Promise<string[]> {
  const view = await findView(app, "view=menu");
  return view
    .locator('[role=menu]:not([aria-hidden="true"])')
    .first()
    .evaluate((menu) => [...menu.children].map((child) => child.getAttribute("aria-label") ?? "-"));
}

export async function answerAsk(app: ElectronApplication, button: string): Promise<void> {
  const view = await findView(app, "view=menu");
  await view.getByRole("alertdialog").getByRole("button", { name: button, exact: true }).click();
}

// Each WebContentsView shows up as its own Playwright window. A window can exist before it reaches
// its address, and no event says when it does, so this keeps looking.
// Closes every window, as on a Mac, where the app keeps running with none, and waits until each of their views has gone,
// so nothing found afterwards is one of them.
export async function closeWindow(app: ElectronApplication): Promise<void> {
  const before = app.windows();
  await app.evaluate(({ app, BaseWindow }) => {
    const quit = app.quit.bind(app);
    app.quit = () => {};
    app.once("window-all-closed", () => setImmediate(() => (app.quit = quit)));
    BaseWindow.getAllWindows().forEach((window) => window.close());
  });
  await expect.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(0);
  await expect.poll(() => before.every((page) => page.isClosed())).toBe(true);
}

// Closes the window and opens a new one, as the Dock does.
export async function reopenWindow(app: ElectronApplication): Promise<void> {
  await closeWindow(app);
  await app.evaluate(({ app }) => app.emit("activate"));
}

export async function findView(app: Pick<ElectronApplication, "windows">, urlPart: string): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < VIEW_TIMEOUT_MS) {
    // A window that closed can stay in the list for a moment, as on a Mac after a reopen.
    const view = app.windows().find((page) => !page.isClosed() && page.url().includes(urlPart));
    if (view) {
      console.log(`Found ${urlPart} in ${Date.now() - started}ms`);
      return view;
    }
    await new Promise((resolve) => setTimeout(resolve, VIEW_POLL_MS));
  }
  const open = app.windows().map((page) => page.url());
  throw new Error(`No view at ${urlPart} after ${VIEW_TIMEOUT_MS}ms. Open: ${JSON.stringify(open)}`);
}
