import type { WebContents, WebFrameMain } from "electron";
import type { EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

export const CHANNEL_REGIONS: { [C in InvokeChannel]: InvokeChannels[C]["region"] } = {
  "tabs:list": "chrome",
  "tabs:create": "chrome",
  "tabs:close": "chrome",
  "tabs:switch": "chrome",
  "tab:navigate": "chrome",
  "tab:back": "chrome",
  "tab:forward": "chrome",
  "tab:reload": "chrome",
  "tab:stop": "chrome",
  "layout:get": "chrome",
  "layout:toggle-sidebar": "chrome",
  "layout:toggle-chat": "chrome",
  "theme:get": "chrome",
  "theme:toggle-dark": "chrome",
  "chat:send": "chrome",
  "chat:clear": "chrome",
  "chat:messages": "chrome",
  "page:text": "chrome",
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
