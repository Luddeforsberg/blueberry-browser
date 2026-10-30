import { describe, expect, it } from "vitest";
import type { WebContents, WebFrameMain } from "electron";
import { isTrustedSender, type ChromeEndpoint } from "./ipc";

const CHROME_URL = "file:///app/out/renderer/chrome/index.html";

const chromeView = (url: string) => {
  const mainFrame = { url } as WebFrameMain;
  const webContents = { mainFrame } as WebContents;
  return { webContents, mainFrame, endpoint: { webContents, url } as ChromeEndpoint };
};

describe("isTrustedSender", () => {
  const chrome = chromeView(CHROME_URL);

  it("accepts the top frame of the expected view on its own page", () => {
    const event = { sender: chrome.webContents, senderFrame: chrome.mainFrame };
    expect(isTrustedSender(event, chrome.endpoint)).toBe(true);
  });

  it("ignores a hash or query on the page", () => {
    const frame = { url: `${CHROME_URL}?x=1#top` } as WebFrameMain;
    const webContents = { mainFrame: frame } as WebContents;
    const event = { sender: webContents, senderFrame: frame };
    expect(isTrustedSender(event, { webContents, url: CHROME_URL })).toBe(true);
  });

  it("rejects another view", () => {
    const tab = chromeView("https://example.com/");
    const event = { sender: tab.webContents, senderFrame: tab.mainFrame };
    expect(isTrustedSender(event, chrome.endpoint)).toBe(false);
  });

  it("rejects a subframe of the expected view", () => {
    const iframe = { url: CHROME_URL } as WebFrameMain;
    const event = { sender: chrome.webContents, senderFrame: iframe };
    expect(isTrustedSender(event, chrome.endpoint)).toBe(false);
  });

  it("rejects the expected view once it shows another page", () => {
    const frame = { url: "https://example.com/" } as WebFrameMain;
    const webContents = { mainFrame: frame } as WebContents;
    const event = { sender: webContents, senderFrame: frame };
    expect(isTrustedSender(event, { webContents, url: CHROME_URL })).toBe(false);
  });

  it("rejects a frame that's already gone", () => {
    const event = { sender: chrome.webContents, senderFrame: null };
    expect(isTrustedSender(event, chrome.endpoint)).toBe(false);
  });
});
