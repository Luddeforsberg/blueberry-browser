import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectOverCdp, type CloudBrowser, type CloudSession } from "./cloudProvider";

// A Chrome on this computer standing in for the cloud, for tests and development: launched headless with a throwaway
// profile, or one already running with `--remote-debugging-port`. There's no live view, so the window shows pictures.

// A fresh profile on a cold machine, such as a Windows CI runner, often takes more than 15 seconds.
const LAUNCH_MS = 60_000;

const CHROME_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: [join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe")],
};

export const findChrome = (): string | null => (CHROME_PATHS[process.platform] ?? []).find((path) => existsSync(path)) ?? null;

// Only this computer, so a test hook can never point a job at someone else's browser.
export const isLocalEndpoint = (endpoint: string): boolean => {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return ["http:", "ws:"].includes(protocol) && hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const launch = (executable: string): Promise<{ endpoint: string; process: ChildProcess; profile: string }> => {
  const profile = mkdtempSync(join(tmpdir(), "blueberry-cloud-"));
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Nothing a stand-in needs, and each is work a fresh profile does at startup.
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-breakpad",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let said = "";
    const fail = (why: string) => {
      clearTimeout(timer);
      child.kill();
      rmSync(profile, { recursive: true, force: true });
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("The local browser didn't start in time."), LAUNCH_MS);
    child.on("error", () => fail("The local browser couldn't be started."));
    child.stderr?.on("data", (part: Buffer) => {
      said += part.toString();
      const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(said)?.[1];
      if (!endpoint) return;
      clearTimeout(timer);
      child.stderr?.removeAllListeners("data");
      child.stderr?.resume();
      resolve({ endpoint, process: child, profile });
    });
  });
};

// How long a browser that was told to stop gets before its profile goes anyway.
const STOP_MS = 5_000;

// Kills a browser this computer started, and waits until it has gone, so nothing outlives the app or the runner.
const stop = async ({ process: child, profile }: { process: ChildProcess; profile: string }): Promise<void> => {
  if (child.exitCode === null && child.signalCode === null) {
    const gone = new Promise((resolve) => child.once("exit", resolve));
    let timer: ReturnType<typeof setTimeout> | undefined;
    child.kill();
    await Promise.race([gone, new Promise((resolve) => (timer = setTimeout(resolve, STOP_MS)))]);
    clearTimeout(timer);
  }
  rmSync(profile, { recursive: true, force: true });
};

// Connects to `endpoint`, a browser already running here, or launches one from `executable` or the usual place.
const start = async (endpoint: string | undefined, executable: string | undefined): Promise<CloudSession> => {
  if (endpoint && !isLocalEndpoint(endpoint)) throw new Error("A local browser has to be on 127.0.0.1.");
  const path = executable ?? findChrome();
  if (!endpoint && !path) throw new Error("No Chrome or Chromium was found on this computer.");
  const launched = endpoint ? null : await launch(path!);
  const browser = await connectOverCdp(endpoint ?? launched!.endpoint).catch(async (error) => {
    if (launched) await stop(launched);
    throw error;
  });
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return {
    context,
    liveView: async () => null,
    close: async () => {
      await browser.close().catch(() => {});
      if (launched) await stop(launched);
    },
  };
};

export const localChrome = ({
  endpoint,
  executable,
}: { endpoint?: string | undefined; executable?: string | undefined } = {}): CloudBrowser => ({
  name: "local",
  // Closing the session ends this browser, so there's no id, and nothing left at a provider to release.
  release: async () => {},
  // It makes no tags, so there are none to end.
  releaseTagged: async () => {},
  create: async () => ({ id: null, connect: () => start(endpoint, executable) }),
});
