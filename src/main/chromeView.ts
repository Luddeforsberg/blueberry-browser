import { is } from "@electron-toolkit/utils";
import { WebContentsView } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";
import type { ChromeRegion } from "../shared/ipc";

export interface ChromeView {
  view: WebContentsView;
  url: string;
}

// Every region loads the one chrome renderer, which picks what to draw from `view`.
const rendererUrl = (region: ChromeRegion): string => {
  const url =
    is.dev && process.env["ELECTRON_RENDERER_URL"]
      ? new URL("/chrome/", process.env["ELECTRON_RENDERER_URL"])
      : pathToFileURL(join(__dirname, "../renderer/chrome/index.html"));
  url.searchParams.set("view", region);
  return url.href;
};

export const createChromeView = (region: ChromeRegion): ChromeView => {
  const url = rendererUrl(region);
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, "../preload/chrome.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Transparent, so the window material shows through wherever the renderer draws glass.
  view.setBackgroundColor("#00000000");

  // The chrome keeps its preload for its whole life, so it must never show anything but our own page.
  view.webContents.on("will-navigate", (event) => event.preventDefault());
  view.webContents.loadURL(url);

  return { view, url };
};
