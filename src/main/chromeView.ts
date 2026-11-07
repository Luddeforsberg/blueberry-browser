import { is } from "@electron-toolkit/utils";
import { WebContentsView, type WebContents, type WebFrameMain } from "electron";
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

// Every chrome view's page, which `sessionHandlers.ts` asks about for each request.
const chromeContents = new WeakSet<WebContents>();
export const isChromeContents = (contents: WebContents | undefined): boolean => !!contents && chromeContents.has(contents);

// Whether a frame in a chrome view is an HTML card's, a page a bird wrote (see `src/shared/nestHtml.ts`), or anything
// inside one. The card's frame is the chrome's only frame with no origin, since it's sandboxed without allow-same-origin
// and shows its srcdoc. A live view's frame has its site's origin. A frame that can't be read counts as a card's.
export const inHtmlCard = (frame: WebFrameMain | null | undefined): boolean => {
  try {
    for (let each = frame; each?.parent; each = each.parent) if (each.origin === "null" || each.url.startsWith("about:srcdoc")) return true;
    return false;
  } catch {
    return true;
  }
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
  // An HTML card's frame only ever shows its own page. Going anywhere else, by a link, a script, a refresh in the page or
  // a frame inside it, could carry the board's data out in the address, which no policy in the page can stop.
  view.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame && (inHtmlCard(event.frame) || inHtmlCard(event.initiator)) && !event.url.startsWith("about:srcdoc")) event.preventDefault();
  });
  // The chrome itself never uses WebRTC, which a page's policy doesn't cover. This only stops UDP, so STUN, and a TURN
  // server over TCP still answers: an HTML card has no WebRTC at all because its page's first script takes it away.
  view.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  chromeContents.add(view.webContents);
  view.webContents.loadURL(url);

  return { view, url };
};
