import { describe, expect, it } from "vitest";
import type { WebContents, WebFrameMain } from "electron";
import { chatSendOptions, isTrustedSender, type ChromeEndpoint } from "./ipc";

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

describe("chatSendOptions", () => {
  it("passes on only what a renderer may set, of the right type", () => {
    expect(chatSendOptions({ seePage: true, mascotId: "m-1", cloud: true, runner: true, files: ["f-1"], tabs: ["tab-2"] })).toEqual({
      seePage: true,
      mascotId: "m-1",
      cloud: true,
      runner: true,
      files: ["f-1"],
      tabs: ["tab-2"],
    });
    const sneaky = {
      seePage: "yes",
      mascotId: 7,
      cloud: 1,
      from: "ChatGPT or Claude",
      sites: ["bank.example"],
      tools: [],
      askAtLeast: "never",
      onEnd: () => {},
    };
    const none = { seePage: false, mascotId: null, cloud: false, runner: false, files: [], tabs: [] };
    expect(chatSendOptions(sneaky)).toEqual(none);
    expect(chatSendOptions(null)).toEqual(none);
    expect(chatSendOptions("seePage")).toEqual(none);
  });

  it("refuses attachments that aren't a list of ids, rather than sending without them", () => {
    expect(() => chatSendOptions({ seePage: false, files: "f-1" })).toThrow();
    expect(() => chatSendOptions({ seePage: false, files: [{ path: "C:/secret.txt" }] })).toThrow();
    expect(() => chatSendOptions({ seePage: false, tabs: [7] })).toThrow();
  });
});
