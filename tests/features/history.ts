import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Browsing history for the new tab's suggestions, brought in the way a user brings it in: a Chrome History file under
// BLUEBERRY_BROWSER_DATA, imported from Settings. Playwright's loader can't load `node:sqlite` on every Node the project
// runs on, so tests/chromiumHistory.ts writes the file in a Node process of its own.

const DAY_MS = 86_400_000;

// Someone who reads the news most mornings and keeps going back to the same shop after lunch.
export const habitVisits = (now: number): Array<{ url: string; title: string; visitedAt: number }> => {
  const at = (daysAgo: number, hour: number, minute: number) => {
    const day = new Date(now - daysAgo * DAY_MS);
    day.setHours(hour, minute, 0, 0);
    return day.getTime();
  };
  return [1, 2, 3, 4, 5, 6].flatMap((daysAgo) => [
    { url: "http://news.example/news", title: "Morning News", visitedAt: at(daysAgo, 8, 24) },
    ...(daysAgo <= 4
      ? [
          { url: "http://shop.example/", title: "Cheap Cables", visitedAt: at(daysAgo, 13, 10) },
          { url: "http://shop.example/cart", title: "Your cart", visitedAt: at(daysAgo, 13, 14) },
        ]
      : []),
  ]);
};

export const writeBrowserHistory = (folder: string, visits: ReturnType<typeof habitVisits>): void => {
  const helper = pathToFileURL(join(__dirname, "..", "chromiumHistory.ts")).href;
  const script = `import { chromeHistoryFile, writeChromiumHistory } from ${JSON.stringify(helper)};
writeChromiumHistory(chromeHistoryFile(${JSON.stringify(folder)}), ${JSON.stringify(visits)}).close();`;
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`Couldn't write the browser history: ${run.stderr}`);
};

interface Session {
  id: string;
  pages: Array<{ site?: string }>;
}

// What the cheap model proposes from that history, citing the digest's real sessions, as tests/suggestionReplies.ts
// does for the evals' history.
export const habitProposals = (digest: string): string => {
  const { sessions } = JSON.parse(digest.replace(/^<browsing_digest>\n/, "").replace(/\n<\/browsing_digest>$/, "")) as { sessions: Session[] };
  const on = (site: string) => sessions.filter(({ pages }) => pages.some((page) => page.site === site)).map(({ id }) => id);
  return JSON.stringify({
    cards: [
      { kind: "prompt", line: "Shall I check the cable prices again?", why: "You keep going back to Cheap Cables", evidence: on("shop.example"), sites: ["shop.example"], prompt: "Check the USB-C cable prices on shop.example and tell me the cheapest." },
      { kind: "routine", line: "Want the morning news picked out by 8:15?", why: "You read Morning News around half past eight", evidence: on("news.example"), sites: ["news.example"], name: "Morning news", instructions: "Read the Morning News page and list the stories worth my time.", schedule: { kind: "daily", time: "08:15" } },
    ],
  });
};
