import type { WebContents, WebFrameMain } from "electron";
import type { ChromeRegion, EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

export const CHANNEL_REGIONS: { [C in InvokeChannel]: InvokeChannels[C]["region"] } = {
  "tabs:list": "topbar",
  "tabs:create": "topbar",
  "tabs:close": "topbar",
  "tabs:switch": "topbar",
  "tab:navigate": "topbar",
  "tab:back": "topbar",
  "tab:forward": "topbar",
  "tab:reload": "topbar",
  "sidebar:toggle": "topbar",
  "chat:send": "sidebar",
  "chat:clear": "sidebar",
  "chat:messages": "sidebar",
  "page:text": "sidebar",
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

export const findTrustedRegion = (
  event: IpcSender,
  endpoints: Record<ChromeRegion, ChromeEndpoint>
): ChromeRegion | null =>
  (Object.keys(endpoints) as ChromeRegion[]).find((region) =>
    isTrustedSender(event, endpoints[region])
  ) ?? null;

export const sendToRenderer = <C extends keyof EventChannels>(
  webContents: Pick<WebContents, "send">,
  channel: C,
  payload: EventChannels[C]
): void => webContents.send(channel, payload);
