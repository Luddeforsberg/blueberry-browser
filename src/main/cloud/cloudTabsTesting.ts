import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "playwright-core";
import type { CloudBrowser } from "./cloudProvider";
import { CloudTabs, type CloudTabsHooks } from "./CloudTabs";

// For the CloudTabs tests, which mock electron's safeStorage themselves.

// Makes the cloud browser for a key, as makeCloud.ts does.
export type Provider = ConstructorParameters<typeof CloudTabs>[1];

export const tempFile = () => join(mkdtempSync(join(tmpdir(), "cloud-tabs-")), "cloud.json");

// A browser whose pages open when `opened` says so, standing in for the local one.
export const fakeLocal = () => {
  let opened: Promise<void> = Promise.resolve();
  const context = {
    route: async () => {},
    on: () => {},
    browser: () => null,
    newPage: async () => (await opened, { on: () => {}, close: async () => {} }),
  };
  const browser: CloudBrowser = {
    name: "local",
    origin: "local",
    release: async () => {},
    releaseTagged: async () => "none",
    create: async () => ({
      id: null,
      connect: async () => ({ context: context as unknown as BrowserContext, liveView: async () => null, close: async () => {} }),
    }),
  };
  return { browser, holdPages: (until: Promise<void>) => void (opened = until) };
};

export const hooks = (over: Partial<CloudTabsHooks> = {}): CloudTabsHooks => ({
  chrome: () => ({ isDestroyed: () => true }) as never,
  openTab: () => "tab-1",
  updateTab: () => {},
  closeTab: () => {},
  takenOver: () => {},
  showTab: () => {},
  confirmLogin: async () => true,
  ...over,
});

export const makeTabs = (file = tempFile(), provider: Provider = () => fakeLocal().browser, over: Partial<CloudTabsHooks> = {}) => {
  const tabs = new CloudTabs(file, provider, async () => []);
  tabs.attach(hooks(over));
  return tabs;
};
