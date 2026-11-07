import type { WebContents, WebFrameMain } from "electron";
import type { ChatSendOptions, EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

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
  "history:search": ["chrome"],
  "history:delete": ["chrome"],
  "history:clear": ["chrome"],
  "history:import-sources": ["chrome"],
  "history:import": ["chrome"],
  "tab:navigate": ["chrome"],
  "tab:back": ["chrome"],
  "tab:forward": ["chrome"],
  "tab:reload": ["chrome"],
  "tab:stop": ["chrome"],
  "tab:stop-work": ["chrome"],
  "tab:zoom-reset": ["chrome"],
  "find:search": ["find"],
  "find:step": ["find"],
  "find:close": ["find"],
  "layout:get": BOTH,
  "layout:toggle-sidebar": BOTH,
  "layout:toggle-chat": ["chrome"],
  "layout:resize": ["chrome"],
  "layout:app-menu": ["chrome"],
  "overlay:show-sidebar": ["chrome"],
  "overlay:hide": ["overlay"],
  "theme:get": ["chrome", "overlay", "find", "prompt", "desktop", "composer"],
  "library:get": BOTH,
  "bookmarks:toggle": ["chrome"],
  "bookmarks:toggle-pin": ["chrome"],
  "bookmarks:menu": BOTH,
  "library:chat": ["chrome"],
  "settings:get": BOTH,
  "settings:update": ["chrome"],
  "desktop:shortcut-taken": ["chrome"],
  "desktop:state": ["desktop"],
  "desktop:line-box": ["desktop"],
  "desktop:press": ["desktop"],
  "desktop:drag-start": ["desktop"],
  "desktop:drag-end": ["desktop"],
  "desktop:menu": ["desktop"],
  "desktop:composer-state": ["composer"],
  "desktop:composer-height": ["composer"],
  "desktop:send": ["composer"],
  "desktop:close-composer": ["composer"],
  "chat:send": ["chrome"],
  "work:watch": ["chrome"],
  "chat:stop": ["chrome"],
  "chat:decide": BOTH,
  "chat:rename": BOTH,
  "chat:menu": BOTH,
  "nests:create": BOTH,
  "nests:board": ["chrome"],
  "nests:rename": BOTH,
  "nests:menu": BOTH,
  "nests:add-card": ["chrome"],
  "nests:move-card": ["chrome"],
  "nests:set-bird": ["chrome"],
  "nests:delete-card": ["chrome"],
  "nests:send": ["chrome"],
  "nests:send-each": ["chrome"],
  "nests:send-run": ["chrome"],
  "nests:stop-card": ["chrome"],
  "nests:ask": ["chrome"],
  "nests:edit-plan": ["chrome"],
  "nests:run-plan": ["chrome"],
  "nests:discard-plan": ["chrome"],
  "nests:continue": ["chrome"],
  "nests:attach-files": ["chrome"],
  "nests:add-note": ["chrome"],
  "nests:edit-note": ["chrome"],
  "nests:remove-attachment": ["chrome"],
  "page:text": ["chrome"],
  "chat:page-access": ["chrome"],
  "chat:set-page-access": ["chrome"],
  "berry:context-menu": ["chrome"],
  "recording:state": ["chrome"],
  "recording:start": ["chrome"],
  "recording:stop": ["chrome"],
  "recording:remove-step": ["chrome"],
  "recording:discard": ["chrome"],
  "recording:draft": ["chrome"],
  "routines:save": ["chrome"],
  "routines:set-paused": ["chrome"],
  "routines:delete": ["chrome"],
  "routines:run-now": ["chrome"],
  "routines:stop": ["chrome"],
  "routines:runs": ["chrome"],
  "routines:mark-seen": ["chrome"],
  "memory:decide": ["chrome"],
  "memory:edit": ["chrome"],
  "memory:forget": ["chrome"],
  "memory:clear": ["chrome"],
  "mascots:save": ["chrome"],
  "mascots:delete": ["chrome"],
  "mascots:gallery": ["chrome"],
  "mascots:gallery-linked": ["chrome"],
  "mascots:add-from-gallery": ["chrome"],
  "mascots:publish": ["chrome"],
  "mascots:unpublish": ["chrome"],
  "mascots:published": ["chrome"],
  "mascots:last-author": ["chrome"],
  "account:state": ["chrome"],
  "account:sign-in": ["chrome"],
  "account:sign-up": ["chrome"],
  "account:sign-out": ["chrome"],
  "suggestions:list": ["chrome"],
  "suggestions:dismiss": ["chrome"],
  "suggestions:used": ["chrome"],
  "downloads:list": ["chrome"],
  "downloads:act": ["chrome"],
  "downloads:choose-folder": ["chrome"],
  "permissions:saved": ["chrome"],
  "permissions:set": ["chrome"],
  "phone:state": ["chrome"],
  "phone:connect": ["chrome"],
  "phone:new-link": ["chrome"],
  "phone:open-link": ["chrome"],
  "phone:disconnect": ["chrome"],
  "mcp:state": ["chrome"],
  "mcp:set-on": ["chrome"],
  "mcp:revoke": ["chrome"],
  "mcp:copy": ["chrome"],
  "cloud:state": ["chrome"],
  "cloud:save": ["chrome"],
  "cloud:forget": ["chrome"],
  "cloud:end": ["chrome"],
  "cloud:view": ["chrome"],
  "cloud:runner-view": ["chrome"],
  "cloud:runner-state": ["chrome"],
  "cloud:runner-link": ["chrome"],
  "cloud:runner-unlink": ["chrome"],
  "cloud:relay-disconnect": ["chrome"],
  "cloud:watch": ["chrome"],
  "cloud:fit": ["chrome"],
  "cloud:take-over": ["chrome"],
  "cloud:login-suggestions": ["chrome"],
  "cloud:bring-login": ["chrome"],
  "cloud:check-login": ["chrome"],
  "cloud:mark-login": ["chrome"],
  "cloud:revoke-login": ["chrome"],
  "cloud:forget-logins": ["chrome"],
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

// What a renderer may ask of `chat:send`, and nothing else, each checked for its type. What only main sets on a reply,
// such as `from`, `sites`, `tools`, `askAtLeast` and `onEnd`, can't come in this way.
export const chatSendOptions = (options: unknown): ChatSendOptions => {
  const { seePage, mascotId, cloud, runner } = (options ?? {}) as Record<string, unknown>;
  return { seePage: seePage === true, mascotId: typeof mascotId === "string" ? mascotId : null, cloud: cloud === true, runner: runner === true };
};

export const sendToRenderer = <C extends keyof EventChannels>(
  webContents: Pick<WebContents, "send" | "isDestroyed">,
  channel: C,
  payload: EventChannels[C]
): void => {
  if (!webContents.isDestroyed()) webContents.send(channel, payload);
};
