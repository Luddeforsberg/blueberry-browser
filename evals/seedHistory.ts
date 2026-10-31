// Dev only, and nothing in the app can reach it. Fills a profile folder with a few days of realistic use, so the new
// tab page has something to notice on a fresh install. It refuses to run without a folder, so it can't touch real data
// by accident. See evals/README.md.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChatStore } from "../src/main/ChatStore";
import { HistoryStore } from "../src/main/HistoryStore";
import type { Visit } from "../src/shared/ipc";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const at = (now: number, daysAgo: number, hour: number, minute: number): number => {
  const day = new Date(now - daysAgo * DAY_MS);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};

const visit = (url: string, title: string, visitedAt: number): Visit => ({ url, title, favicon: null, visitedAt });

// The same few habits each day, with the ordinary noise around them.
export const demoVisits = (now = Date.now()): Visit[] => {
  const visits: Visit[] = [];
  // Hacker News with the first coffee, on all but one of the last six days.
  [1, 2, 3, 4, 5].forEach((daysAgo, index) => {
    visits.push(visit("https://news.ycombinator.com/", "Hacker News", at(now, daysAgo, 8, 24 + index * 3)));
  });
  // Pull requests with the issue next to them, on four working afternoons.
  const repositoryPages: Array<[string, string]> = [
    ["https://github.com/acme/checkout/pulls", "Pull requests · acme/checkout · GitHub"],
    ["https://github.com/acme/checkout/pull/412", "Fix retry on declined cards by mira · Pull Request #412 · acme/checkout · GitHub"],
    ["https://github.com/acme/checkout/pull/418", "Move tax rules to the server · Pull Request #418 · acme/checkout · GitHub"],
    ["https://github.com/acme/checkout/actions", "Actions · acme/checkout · GitHub"],
    ["https://github.com/acme/checkout/issues", "Issues · acme/checkout · GitHub"],
  ];
  [1, 2, 3, 4].forEach((daysAgo, index) => {
    const [address, title] = repositoryPages[index];
    const [next, nextTitle] = repositoryPages[index + 1];
    visits.push(
      visit(address, title, at(now, daysAgo, 11 + index, 5)),
      visit("https://linear.app/acme/team/CHK/active", "Checkout team · Active issues · Linear", at(now, daysAgo, 11 + index, 12)),
      visit(next, nextTitle, at(now, daysAgo, 15 - index, 40)),
      visit("https://linear.app/acme/project/checkout-v2", "Checkout v2 · Project · Linear", at(now, daysAgo, 15 - index, 47)),
    );
  });
  // A flat hunt, checked at odd hours, so it has no habit of time.
  [[1, 21, 10], [2, 7, 45], [4, 12, 30], [5, 18, 20]].forEach(([daysAgo, hour, minute]) => {
    visits.push(visit("https://www.hemnet.se/bostader", "Bostäder till salu i Södermalm, Stockholm | Hemnet", at(now, daysAgo, hour, minute)));
  });
  // Noise that must never turn up on a card or reach a model. Older than the rest, so it isn't in Recent on film.
  [2, 3, 4, 5, 6].forEach((daysAgo) => {
    visits.push(
      visit("https://mail.google.com/mail/u/0/#inbox", "Inbox (12) - someone@example.com - Gmail", at(now, daysAgo, 8, 5)),
      visit("https://www.google.com/search?q=sore+throat+three+weeks", "sore throat three weeks - Google Search", at(now, daysAgo, 13, 15)),
      visit("https://www.seb.se/privat/konton", "Mina konton | SEB", at(now, daysAgo, 9, 40)),
      visit("https://internbank.swedbank.se/app", "Swedbank Internetbanken", at(now, daysAgo, 20, 0)),
      visit("http://localhost:5173/", "acme checkout dev", at(now, daysAgo, 10, 0)),
    );
  });
  return visits.filter(({ visitedAt }) => visitedAt <= now - MINUTE_MS);
};

export const DEMO_CHATS = [
  { title: "Cheap flights to Lisbon", message: "Find me cheap flights from Stockholm to Lisbon in May" },
  { title: "Lisbon flights in May", message: "What are the cheapest flights to Lisbon from Stockholm in May?" },
  { title: "Stockholm to Lisbon prices", message: "Any cheaper flights Stockholm Lisbon? Weekends in May" },
];

export const seedChats = (folder: string): void => {
  const chats = new ChatStore(join(folder, "chats.db"));
  DEMO_CHATS.forEach(({ title, message }) => {
    const id = chats.createChat(title);
    chats.addMessage(id, { role: "user", content: message });
  });
};

const main = (folder: string | undefined): void => {
  if (!folder) throw new Error("Name a profile folder: pnpm dlx tsx evals/seedHistory.ts /tmp/blueberry-demo");
  mkdirSync(folder, { recursive: true });
  const added = new HistoryStore(join(folder, "history.db")).importVisits(demoVisits());
  seedChats(folder);
  const settings = join(folder, "settings.json");
  if (!existsSync(settings)) writeFileSync(settings, JSON.stringify({ onboarded: true }));
  console.log(`Added ${added} visits and ${DEMO_CHATS.length} chats to ${folder}`);
};

if (process.argv[1]?.endsWith("seedHistory.ts")) main(process.argv[2]);
