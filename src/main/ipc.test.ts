import { describe, expect, it } from "vitest";
import type { WebContents, WebFrameMain } from "electron";
import { findTrustedRegion, isTrustedSender, type ChromeEndpoint } from "./ipc";

const TOPBAR_URL = "file:///app/out/renderer/topbar/index.html";
const SIDEBAR_URL = "file:///app/out/renderer/sidebar/index.html";

const chromeView = (url: string) => {
  const mainFrame = { url } as WebFrameMain;
  const webContents = { mainFrame } as WebContents;
  return { webContents, mainFrame, endpoint: { webContents, url } as ChromeEndpoint };
};

describe("isTrustedSender", () => {
  const topBar = chromeView(TOPBAR_URL);

  it("accepts the top frame of the expected view on its own page", () => {
    const event = { sender: topBar.webContents, senderFrame: topBar.mainFrame };
    expect(isTrustedSender(event, topBar.endpoint)).toBe(true);
  });

  it("ignores a hash or query on the page", () => {
    const frame = { url: `${TOPBAR_URL}?x=1#top` } as WebFrameMain;
    const webContents = { mainFrame: frame } as WebContents;
    const event = { sender: webContents, senderFrame: frame };
    expect(isTrustedSender(event, { webContents, url: TOPBAR_URL })).toBe(true);
  });

  it("rejects another view", () => {
    const sidebar = chromeView(SIDEBAR_URL);
    const event = { sender: sidebar.webContents, senderFrame: sidebar.mainFrame };
    expect(isTrustedSender(event, topBar.endpoint)).toBe(false);
  });

  it("rejects a subframe of the expected view", () => {
    const iframe = { url: TOPBAR_URL } as WebFrameMain;
    const event = { sender: topBar.webContents, senderFrame: iframe };
    expect(isTrustedSender(event, topBar.endpoint)).toBe(false);
  });

  it("rejects the expected view once it shows another page", () => {
    const frame = { url: "https://example.com/" } as WebFrameMain;
    const webContents = { mainFrame: frame } as WebContents;
    const event = { sender: webContents, senderFrame: frame };
    expect(isTrustedSender(event, { webContents, url: TOPBAR_URL })).toBe(false);
  });

  it("rejects a frame that's already gone", () => {
    const event = { sender: topBar.webContents, senderFrame: null };
    expect(isTrustedSender(event, topBar.endpoint)).toBe(false);
  });
});

describe("findTrustedRegion", () => {
  const topBar = chromeView(TOPBAR_URL);
  const sidebar = chromeView(SIDEBAR_URL);
  const endpoints = { topbar: topBar.endpoint, sidebar: sidebar.endpoint };

  it("names the chrome region a message came from", () => {
    const event = { sender: sidebar.webContents, senderFrame: sidebar.mainFrame };
    expect(findTrustedRegion(event, endpoints)).toBe("sidebar");
  });

  it("finds no region for a tab", () => {
    const page = chromeView("https://example.com/");
    const event = { sender: page.webContents, senderFrame: page.mainFrame };
    expect(findTrustedRegion(event, endpoints)).toBeNull();
  });
});
