import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome } from "../../src/main/localChrome";
import type { Site } from "./site";

// The cloud browser for a cloud tab: a headless Chrome on this computer, as tests/cloudTab.spec.ts uses, started here
// rather than by the app so it gets the same host rules and its addresses read shop.example. The app is pointed at it
// with BLUEBERRY_CLOUD_LOCAL, which only an unpackaged app reads.
export async function startCloudBrowser(site: Site): Promise<{ env: Record<string, string>; close: () => Promise<void> }> {
  const chrome = findChrome();
  if (!chrome) throw new Error("A cloud tab needs Google Chrome on this computer.");
  const profile = mkdtempSync(join(tmpdir(), "blueberry-drive-cloud-"));
  const child = spawn(
    chrome,
    ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,800", "--force-device-scale-factor=1", "--hide-scrollbars", `--host-resolver-rules=${site.hostRules}`, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  // Its profile can only go once Chrome has let go of its files.
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  const endpoint = await new Promise<string>((resolve, reject) => {
    let said = "";
    const timer = setTimeout(() => reject(new Error("The local cloud browser didn't start in time.")), 15_000);
    child.stderr.on("data", (part: Buffer) => {
      said += part.toString();
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(said);
      if (!found) return;
      clearTimeout(timer);
      child.stderr.removeAllListeners("data");
      child.stderr.resume();
      resolve(found[1]);
    });
  }).catch(async (error) => {
    await close();
    throw error;
  });
  return { env: { BLUEBERRY_CLOUD_LOCAL: endpoint }, close };
}
