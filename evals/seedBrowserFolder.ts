// Dev only, and nothing in the app can reach it. Makes a folder that looks like a computer with Chrome on it, so
// bringing in history can be shown without touching a real browser. It refuses to run without a folder. See evals/README.md.
import { existsSync } from "node:fs";
import { chromeHistoryFile, writeChromiumHistory } from "../tests/chromiumHistory";
import { demoVisits } from "./seedHistory";

const main = (folder: string | undefined): void => {
  if (!folder) throw new Error("Name a folder: pnpm dlx tsx evals/seedBrowserFolder.ts /tmp/blueberry-demo-browsers");
  const file = chromeHistoryFile(folder);
  if (existsSync(file)) throw new Error(`${file} is already there. Delete the folder to start again.`);
  const visits = demoVisits();
  writeChromiumHistory(file, visits).close();
  console.log(`Wrote ${visits.length} visits to ${file}`);
};

if (process.argv[1]?.endsWith("seedBrowserFolder.ts")) main(process.argv[2]);
