import type { ElectronApplication } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

// A fresh runner has none of Electron, Chromium or LangChain in its disk cache, so the first app of a run reads them
// all from disk. On GitHub's macOS runners that app launched in 3 to 6 seconds rather than 1 to 2, and its first page and
// first reply waited seconds more while main loaded LangChain, failing whichever test came first in the shard (#181).
// This launches the app once before any test, opens a page and gets a reply from the fake model, which loads LangChain,
// and closes it. It only gives the tests a head start, so one that fails or runs out of time leaves the tests to run and
// show what's wrong.
const WARM_MS = 60_000;
const POLL_MS = 100;

const until = async (check: () => Promise<boolean>) => {
  while (!(await check())) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
};

const openPageAndChat = async (app: ElectronApplication, url: string) => {
  const chromeView = () => app.windows().find((page) => page.url().includes("view=chrome"));
  await until(async () => !!chromeView());
  const chrome = chromeView()!;
  await chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), url);
  await until(async () => app.windows().some((page) => page.url() === url));
  const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Hello", { seePage: false }));
  await until(async () => {
    const chat = await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id);
    return !!chat && chat.partial === null && chat.messages.some((message) => message.role === "assistant");
  });
};

export default async function warmUp(): Promise<void> {
  const started = Date.now();
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Warm</title><body>warm</body>");
  });
  const model = await startFakeModel();
  let timer: NodeJS.Timeout | undefined;
  let launching: Promise<ElectronApplication> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    launching = launchApp(undefined, { modelEnv: model.env });
    const outOfTime = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`it took over ${WARM_MS}ms`)), WARM_MS);
    });
    await Promise.race([launching.then((app) => openPageAndChat(app, url)), outOfTime]);
    console.log(`Warmed up in ${Date.now() - started}ms`);
  } catch (error) {
    console.log(`Didn't finish warming up, so the first test may start cold: ${String(error)}`);
  } finally {
    clearTimeout(timer);
    // An app still launching when time ran out is closed once it's up.
    await launching?.then((app) => app.close()).catch(() => {});
    model.close();
    server.close();
  }
}
