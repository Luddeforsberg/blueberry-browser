import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";

// Launches the built app in out/, so run `pnpm exec electron-vite build` first.
export async function launchApp(): Promise<ElectronApplication> {
  // Some shells export ELECTRON_RUN_AS_NODE, which would start Node instead of the app.
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    executablePath: electronPath as unknown as string,
    args: ["."],
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
