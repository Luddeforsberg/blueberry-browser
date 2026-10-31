import type { WebContents, WebFrameMain } from "electron";
import type { EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

const BOTH = ["chrome", "overlay"] as const;

export const CHANNEL_REGIONS: {
  [C in InvokeChannel]: readonly InvokeChannels[C]["region"][];
} = {
  "tabs:list": BOTH,
  "tabs:create": BOTH,
  "tabs:close": BOTH,
  "tabs:switch": BOTH,
  "tabs:move": BOTH,
  "tabs:move-by": BOTH,
  "tabs:open-page": BOTH,
  "history:recent": ["chrome"],
  "tab:navigate": ["chrome"],
  "tab:back": ["chrome"],
  "tab:forward": ["chrome"],
  "tab:reload": ["chrome"],
  "tab:stop": ["chrome"],
  "tab:zoom-reset": ["chrome"],
  "find:search": ["find"],
  "find:step": ["find"],
  "find:close": ["find"],
  "layout:get": BOTH,
  "layout:toggle-sidebar": BOTH,
  "layout:toggle-chat": ["chrome"],
  "layout:resize": ["chrome"],
  "overlay:show-sidebar": ["chrome"],
  "overlay:hide": ["overlay"],
  "theme:get": ["chrome", "overlay", "find", "prompt"],
  "library:get": BOTH,
  "bookmarks:toggle": ["chrome"],
  "bookmarks:menu": BOTH,
  "library:chat": ["chrome"],
  "settings:get": BOTH,
  "settings:update": ["chrome"],
  "chat:send": ["chrome"],
  "chat:stop": ["chrome"],
  "chat:decide": BOTH,
  "chat:rename": BOTH,
  "chat:menu": BOTH,
  "page:text": ["chrome"],
  "chat:page-access": ["chrome"],
  "chat:set-page-access": ["chrome"],
  "berry:context-menu": ["chrome"],
  "routines:save": ["chrome"],
  "routines:set-paused": ["chrome"],
  "routines:delete": ["chrome"],
  "routines:run-now": ["chrome"],
  "routines:stop": ["chrome"],
  "routines:runs": ["chrome"],
  "routines:mark-seen": ["chrome"],
  "downloads:list": ["chrome"],
  "downloads:act": ["chrome"],
  "downloads:choose-folder": ["chrome"],
  "permissions:saved": ["chrome"],
  "permissions:set": ["chrome"],
  "permissions:current": ["prompt"],
  "permissions:decide": ["prompt"],
  "permissions:resize": ["prompt"],
};

export interface ChromeEndpoint {
  webContents: WebContents;
  url: string;
}

export interface IpcSender {
  sender: WebContents;
  senderFrame: WebFrameMain | null;
}

const withoutHashOrQuery = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.href;
  } catch {
    return null;
  }
};

// Only the top frame of the expected chrome view, still showing our own page, may call in.
export const isTrustedSender = (
  event: IpcSender,
  endpoint: ChromeEndpoint
): boolean => {
  const frame = event.senderFrame;
  if (event.sender !== endpoint.webContents || !frame) return false;
  if (frame !== event.sender.mainFrame) return false;
  const actual = withoutHashOrQuery(frame.url);
  return actual !== null && actual === withoutHashOrQuery(endpoint.url);
};

export const sendToRenderer = <C extends keyof EventChannels>(
  webContents: Pick<WebContents, "send" | "isDestroyed">,
  channel: C,
  payload: EventChannels[C]
): void => {
  if (!webContents.isDestroyed()) webContents.send(channel, payload);
};
