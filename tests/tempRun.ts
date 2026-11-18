import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every run of the tests, the end-to-end tests, drive and the evals writes its profiles, databases and downloads to the
// system's temp folder. Each run gets a folder of its own there, removed when the run ends, since thousands of runs
// left behind once filled the disk. Used as the global setup in each config, so the workers and the apps they launch
// start with it as their temp folder.
const PREFIX = "blueberry-run-";
const KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
// A run that was killed can't remove its own folder, so a later run does, once nothing could still be using it.
const STALE_MS = 24 * 60 * 60 * 1000;

const removeStale = (system: string) => {
  for (const name of readdirSync(system)) {
    if (!name.startsWith(PREFIX)) continue;
    const folder = join(system, name);
    const modified = statSync(folder, { throwIfNoEntry: false })?.mtimeMs ?? Date.now();
    if (Date.now() - modified < STALE_MS) continue;
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // Something still holds a file in it, so it waits for the next run.
    }
  }
};

export default function ownTempFolder(): () => void {
  const system = tmpdir();
  removeStale(system);
  const folder = mkdtempSync(join(system, PREFIX));
  const before = KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of KEYS) process.env[key] = folder;
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // On Windows a helper process of the last app can hold a file for a moment after it quits.
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };
}
