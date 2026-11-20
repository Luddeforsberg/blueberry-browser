import { copyFile, lstat, mkdtemp, readdir, rm } from "fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "os";
import { join } from "path";
import type { ImportSource, Visit } from "../../shared/ipc";
import { rowsOf } from "./database";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;
const MAX_VISITS = 50_000;
const MAX_FILE_BYTES = 2 ** 31;
const MAX_ADDRESS_LENGTH = 4096;
const MAX_TITLE_LENGTH = 512;
// Chromium counts microseconds from 1601. Those numbers are too big for a JavaScript number, so the query converts them.
const CHROMIUM_EPOCH_MS = 11_644_473_600_000n;
const PROFILE_FOLDER = /^(Default|Profile \d+)$/;

// Only these columns of these tables are ever read, and `hidden` marks frames a person never went to.
const VISITS_QUERY = `
  SELECT urls.url AS url,
         CASE WHEN typeof(urls.title) = 'text' THEN substr(urls.title, 1, ${MAX_TITLE_LENGTH}) ELSE '' END AS title,
         visits.visit_time / 1000 - ${CHROMIUM_EPOCH_MS} AS visitedAt
  FROM visits JOIN urls ON urls.id = visits.url
  WHERE visits.visit_time BETWEEN ? AND ?
    AND urls.hidden = 0
    AND typeof(urls.url) = 'text'
    AND urls.url GLOB 'http*'
    AND length(urls.url) <= ${MAX_ADDRESS_LENGTH}
  ORDER BY visits.visit_time DESC
  LIMIT ${MAX_VISITS}`;

// Each with its data folder and its own app, the Mac way and the Windows way.
const BROWSERS = [
  {
    id: "chrome",
    name: "Chrome",
    mac: "Google/Chrome",
    windows: "Google/Chrome/User Data",
    app: { mac: "Google Chrome.app", windows: "Google/Chrome/Application/chrome.exe" },
  },
  { id: "arc", name: "Arc", mac: "Arc/User Data", windows: null, app: { mac: "Arc.app", windows: null } },
  {
    id: "brave",
    name: "Brave",
    mac: "BraveSoftware/Brave-Browser",
    windows: "BraveSoftware/Brave-Browser/User Data",
    app: { mac: "Brave Browser.app", windows: "BraveSoftware/Brave-Browser/Application/brave.exe" },
  },
  {
    id: "edge",
    name: "Edge",
    mac: "Microsoft Edge",
    windows: "Microsoft/Edge/User Data",
    app: { mac: "Microsoft Edge.app", windows: "Microsoft/Edge/Application/msedge.exe" },
  },
];

// Where browsers keep their data, laid out the Mac way or the Windows way, and the folders their apps are installed in.
export interface BrowserData {
  base: string;
  layout: "mac" | "windows";
  apps?: string[];
}

// Other platforms have none. An unpackaged app can be pointed at a folder laid out like the Mac's, for tests and filming,
// and then no app on this computer is looked at.
export const browserDataFor = (
  platform: NodeJS.Platform,
  {
    appData,
    localAppData,
    home,
    programFiles = [],
    override,
    packaged,
  }: {
    appData: string;
    localAppData?: string | undefined;
    home: string;
    programFiles?: (string | undefined)[];
    override?: string | undefined;
    packaged: boolean;
  },
): BrowserData | null => {
  if (override && !packaged) return { base: override, layout: "mac" };
  if (platform === "darwin") return { base: appData, layout: "mac", apps: ["/Applications", join(home, "Applications")] };
  if (platform === "win32" && localAppData) {
    return { base: localAppData, layout: "windows", apps: [localAppData, ...programFiles].filter((folder) => folder !== undefined) };
  }
  return null;
};

// The picture of an app, as a data address. Only the picture leaves main, never the app's path.
export type AppIcon = (file: string) => Promise<string | null>;

// From the first place the browser's own app is installed.
const iconFor = async ({ layout, apps = [] }: BrowserData, browser: (typeof BROWSERS)[number], iconOf: AppIcon): Promise<string | null> => {
  const app = browser.app[layout];
  if (!app) return null;
  for (const folder of apps) {
    const file = join(folder, app);
    // Asked about a file that isn't there, Windows answers with a generic icon, so only an app that's there is asked.
    const stats = await lstat(file).catch(() => null);
    if (stats && (layout === "mac" ? stats.isDirectory() : stats.isFile())) return iconOf(file).catch(() => null);
  }
  return null;
};

const historyFiles = async ({ base, layout }: BrowserData, browser: (typeof BROWSERS)[number]): Promise<string[]> => {
  const folder = browser[layout];
  if (!folder) return [];
  try {
    const entries = await readdir(join(base, folder), { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && PROFILE_FOLDER.test(entry.name))
        .map(async ({ name }) => {
          const file = join(base, folder, name, "History");
          const stats = await lstat(file).catch(() => null);
          return stats?.isFile() ? [file] : [];
        }),
    );
    return files.flat();
  } catch {
    return [];
  }
};

// Only names, how many profiles and the app's icon, and it opens nothing.
export const findBrowsers = async (data: BrowserData | null, iconOf: AppIcon = async () => null): Promise<ImportSource[]> => {
  if (!data) return [];
  const found = await Promise.all(
    BROWSERS.map(async (browser) => {
      const profiles = (await historyFiles(data, browser)).length;
      return profiles > 0 ? [{ id: browser.id, name: browser.name, profiles, icon: await iconFor(data, browser, iconOf) }] : [];
    }),
  );
  return found.flat();
};

const copyIfThere = (from: string, to: string): Promise<void> =>
  copyFile(from, to).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });

// The browser may hold the file locked, so this reads a copy, and the copy always goes.
const readProfile = async (file: string, now: number, tempRoot: string): Promise<Visit[]> => {
  if ((await lstat(file)).size > MAX_FILE_BYTES) throw new Error("History file is too large");
  const folder = await mkdtemp(join(tempRoot, "blueberry-import-"));
  try {
    const copy = join(folder, "History");
    await copyFile(file, copy);
    // Its newest visits can still be in the write-ahead log.
    await copyIfThere(`${file}-wal`, `${copy}-wal`);
    const db = new DatabaseSync(copy, { readOnly: true });
    try {
      const inChromiumTime = (ms: number) => (BigInt(ms) + CHROMIUM_EPOCH_MS) * 1000n;
      const rows = rowsOf<Omit<Visit, "favicon">>(
        db.prepare(VISITS_QUERY),
        inChromiumTime(now - WINDOW_DAYS * DAY_MS),
        inChromiumTime(now),
      );
      return rows.map((row) => ({ ...row, favicon: null }));
    } finally {
      db.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};

// Every profile of that browser, newest first. Null if it isn't a source or nothing could be read, and a profile that
// can't be read doesn't lose the others.
export const readBrowserHistory = async (
  data: BrowserData | null,
  id: unknown,
  { now = Date.now(), tempRoot = tmpdir() }: { now?: number; tempRoot?: string } = {},
): Promise<Visit[] | null> => {
  const browser = BROWSERS.find((candidate) => candidate.id === id);
  if (!data || !browser) return null;
  const read = await Promise.all(
    (await historyFiles(data, browser)).map((file) =>
      readProfile(file, now, tempRoot).catch((error: Error) => {
        console.error(`Couldn't read a ${browser.name} profile:`, error.message);
        return null;
      }),
    ),
  );
  const profiles = read.filter((visits) => visits !== null);
  if (profiles.length === 0) return null;
  return profiles
    .flat()
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_VISITS);
};
