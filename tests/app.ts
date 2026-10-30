import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Launches the built app in out/, so run `pnpm exec electron-vite build` first.
export async function launchApp(): Promise<ElectronApplication> {
  // Some shells export ELECTRON_RUN_AS_NODE, which would start Node instead of the app.
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    executablePath: electronPath as unknown as string,
    // A fresh profile keeps tests apart and away from the developer's real browsing data.
    args: [".", `--user-data-dir=${mkdtempSync(join(tmpdir(), "blueberry-test-"))}`],
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
