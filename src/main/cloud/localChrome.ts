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

const STOPPED = "The local browser was stopped while it started.";

interface Launched {
  endpoint: string;
  process: ChildProcess;
  profile: string;
}

// Started here, and killed the moment `stop` aborts, even before it has said where it's listening.
const launch = (executable: string, stop: AbortSignal): Promise<Launched> => {
  if (stop.aborted) return Promise.reject(new Error(STOPPED));
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
    let done = false;
    const finish = () => {
      done = true;
      clearTimeout(timer);
      stop.removeEventListener("abort", stopped);
    };
    const fail = (why: string) => {
      if (done) return;
      finish();
      void kill({ endpoint: "", process: child, profile }).finally(() => reject(new Error(why)));
    };
    const stopped = () => fail(STOPPED);
    stop.addEventListener("abort", stopped, { once: true });
    const timer = setTimeout(() => fail("The local browser didn't start in time."), LAUNCH_MS);
    child.on("error", () => fail("The local browser couldn't be started."));
    child.stderr?.on("data", (part: Buffer) => {
      said += part.toString();
      const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(said)?.[1];
      if (!endpoint || done) return;
      finish();
      child.stderr?.removeAllListeners("data");
      child.stderr?.resume();
      resolve({ endpoint, process: child, profile });
    });
  });
};

// How long a browser that was told to stop gets before its profile goes anyway.
const STOP_MS = 5_000;

const killing = new WeakMap<ChildProcess, Promise<void>>();

// Kills a browser this computer started, and waits until it has gone, so nothing outlives the app or the runner. Once,
// however often it's asked.
const kill = (launched: Launched): Promise<void> => {
  const known = killing.get(launched.process);
  if (known) return known;
  const killed = killNow(launched);
  killing.set(launched.process, killed);
  return killed;
};

const killNow = async ({ process: child, profile }: Launched): Promise<void> => {
  if (child.exitCode === null && child.signalCode === null) {
    const gone = new Promise((resolve) => child.once("exit", resolve));
    let timer: ReturnType<typeof setTimeout> | undefined;
    child.kill();
    await Promise.race([gone, new Promise((resolve) => (timer = setTimeout(resolve, STOP_MS)))]);
    clearTimeout(timer);
  }
  rmSync(profile, { recursive: true, force: true });
};

// Connects to `endpoint`, a browser already running here, or launches one from `executable` or the usual place. One it
// launched is killed as soon as `stop` aborts, however far it got.
const start = async (endpoint: string | undefined, executable: string | undefined, stop: AbortSignal): Promise<CloudSession> => {
  if (endpoint && !isLocalEndpoint(endpoint)) throw new Error("A local browser has to be on 127.0.0.1.");
  const path = executable ?? findChrome();
  if (!endpoint && !path) throw new Error("No Chrome or Chromium was found on this computer.");
  const launched = endpoint ? null : await launch(path!, stop);
  const stopped = () => void (launched && kill(launched));
  stop.addEventListener("abort", stopped, { once: true });
  const browser = await connectOverCdp(endpoint ?? launched!.endpoint)
    .catch(async (error: unknown) => {
      if (launched) await kill(launched);
      throw error;
    })
    .finally(() => stop.removeEventListener("abort", stopped));
  if (stop.aborted) {
    await browser.close().catch(() => {});
    if (launched) await kill(launched);
    throw new Error(STOPPED);
  }
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return {
    context,
    liveView: async () => null,
    close: async () => {
      await browser.close().catch(() => {});
      if (launched) await kill(launched);
    },
  };
};

export const localChrome = ({
  endpoint,
  executable,
}: { endpoint?: string | undefined; executable?: string | undefined } = {}): CloudBrowser => ({
  name: "local",
  origin: "local",
  // Closing the session ends this browser, so there's no id, and nothing left at a provider to release.
  release: async () => {},
  // It makes no tags, so there are none to end.
  releaseTagged: async () => "none",
  create: async () => ({ id: null, connect: (stop) => start(endpoint, executable, stop) }),
});
