// Dev only. Fills a new, throwaway profile folder with two weeks of made-up history, chats and a routine that keeps
// failing, then asks the real cheap model for suggestions through the app's own Suggestions class and prints what it
// proposed and what got past the checks. It costs one cheap-model call. It refuses a folder that already has anything
// in it, so it can't touch real data. See evals/README.md.
//
//   pnpm dlx tsx evals/suggestionsCheck.ts /tmp/blueberry-suggestions-check
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChatStore } from "../src/main/ChatStore";
import { HistoryStore } from "../src/main/HistoryStore";
import { RoutineStore } from "../src/main/RoutineStore";
import { Suggestions } from "../src/main/Suggestions";
import { hasModel, writeWithCheapModel } from "../src/main/agent";
import { scheduleLabel } from "../src/main/routineSchedule";
import type { Routine } from "../src/shared/library";
import type { Visit } from "../src/shared/ipc";

const DAY_MS = 86_400_000;

const at = (now: number, daysAgo: number, hour: number, minute: number): number => {
  const day = new Date(now - daysAgo * DAY_MS);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};
const visit = (url: string, title: string, visitedAt: number): Visit => ({ url, title, favicon: null, visitedAt });

export const suggestionVisits = (now = Date.now()): Visit[] => {
  const visits: Visit[] = [];
  // Comparing Stockholm to Lisbon flights across three sites, on three evenings.
  [2, 4, 5].forEach((daysAgo, index) => {
    const start = at(now, daysAgo, 20, 5 + index * 4);
    visits.push(
      visit("https://www.google.com/search?q=flights+stockholm+lisbon+march", "flights stockholm lisbon march - Google Search", start),
      visit("https://www.skyscanner.se/transport/flights/arn/lis/260312/260319/", "Cheap flights from Stockholm Arlanda to Lisbon | Skyscanner", start + 2 * 60_000),
      visit("https://www.kayak.com/flights/STO-LIS/2026-03-12/2026-03-19", "Stockholm (STO) to Lisbon (LIS) flights, 12 Mar – 19 Mar | KAYAK", start + 9 * 60_000),
      visit("https://www.momondo.se/flight-search/STO-LIS/2026-03-12/2026-03-19", "Stockholm – Lisbon, 12 mar – 19 mar | momondo", start + 15 * 60_000),
      visit("https://www.skyscanner.se/transport/flights/arn/lis/260312/260319/", "Cheap flights from Stockholm Arlanda to Lisbon | Skyscanner", start + 22 * 60_000)
    );
  });
  // Arsenal's score, first thing on Mondays.
  for (let daysAgo = 0; daysAgo < 14; daysAgo++) {
    if (new Date(now - daysAgo * DAY_MS).getDay() !== 1) continue;
    const morning = at(now, daysAgo, 7, 38);
    if (morning > now) continue;
    visits.push(
      visit("https://www.flashscore.com/team/arsenal/hA1Zm19f/", "Arsenal live scores, results, fixtures | Flashscore", morning),
      visit("https://www.flashscore.com/team/arsenal/hA1Zm19f/results/", "Arsenal results | Flashscore", morning + 3 * 60_000)
    );
  }
  // A USB-C hub, searched for again and again without settling on one.
  [1, 3, 6, 9].forEach((daysAgo, index) => {
    const start = at(now, daysAgo, 13 + (index % 2) * 8, 10);
    visits.push(
      visit("https://www.google.com/search?q=best+usb-c+hub", "best usb-c hub - Google Search", start),
      visit("https://www.rtings.com/laptop/reviews/best/usb-c-hubs", "The 6 Best USB-C Hubs of 2026 - RTINGS.com", start + 2 * 60_000),
      visit("https://www.reddit.com/r/UsbCHardware/comments/1abcde/hub_for_macbook_with_two_monitors/", "Hub for MacBook with two monitors? : r/UsbCHardware", start + 7 * 60_000)
    );
    if (index % 2 === 0) visits.push(visit("https://www.google.com/search?q=usb-c+hub+two+monitors+macbook", "usb-c hub two monitors macbook - Google Search", start + 12 * 60_000));
  });
  // Ordinary work and reading at no particular time.
  [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].forEach((daysAgo, index) => {
    const morning = at(now, daysAgo, 9 + (index % 3), 15 + index);
    if (morning > now) return;
    visits.push(
      visit("https://github.com/acme/checkout/pulls", "Pull requests · acme/checkout · GitHub", morning),
      visit(`https://github.com/acme/checkout/pull/${430 + index}`, `Checkout change ${index + 1} · Pull Request #${430 + index} · acme/checkout · GitHub`, morning + 6 * 60_000)
    );
    if (index % 3 === 0) visits.push(visit("https://news.ycombinator.com/", "Hacker News", at(now, daysAgo, 12 + (index % 5), 40)));
    if (index % 4 === 1) visits.push(visit("https://www.youtube.com/watch?v=abc123", "How espresso machines work - YouTube", at(now, daysAgo, 22, 5)));
  });
  // Noise that must never reach the model.
  [1, 2, 3, 5, 8].forEach((daysAgo) => {
    visits.push(
      visit("https://mail.google.com/mail/u/0/#inbox", "Inbox (12) - someone@example.com - Gmail", at(now, daysAgo, 8, 5)),
      visit("https://www.google.com/search?q=sore+throat+three+weeks", "sore throat three weeks - Google Search", at(now, daysAgo, 23, 15)),
      visit("https://internbank.swedbank.se/app", "Swedbank Internetbanken", at(now, daysAgo, 19, 0)),
      visit("http://localhost:5173/", "acme checkout dev", at(now, daysAgo, 10, 0))
    );
  });
  return visits.filter(({ visitedAt }) => visitedAt <= now - 60_000);
};

const seed = (folder: string, now: number) => {
  new HistoryStore(join(folder, "history.db")).importVisits(suggestionVisits(now));
  const chats = new ChatStore(join(folder, "chats.db"));
  const chat = (title: string, message: string, reply: string | null) => {
    const id = chats.createChat(title);
    chats.addMessage(id, { role: "user", content: message });
    if (reply) chats.addMessage(id, { role: "assistant", content: reply });
  };
  chat("Lisbon trip ideas", "What should I do in Lisbon for a week in March?", "Here are some ideas…");
  chat("USB-C hub for two monitors", "Which USB-C hub runs two external monitors from a MacBook Air?", null);
  chat("Summarise checkout v2 notes", "Summarise the checkout v2 notes I pasted", "The notes say…");
  const routines = new RoutineStore(join(folder, "routines.db"));
  const id = routines.create(
    { name: "Headphone price check", instructions: "Open prisjakt.nu and tell me if the Sony WH-1000XM6 is under 3,500 kr.", schedule: { kind: "daily", time: "07:00" }, sites: ["prisjakt.nu"] },
    null
  );
  [[3, "finished"], [2, "failed"], [1, "failed"]].forEach(([daysAgo, status]) => {
    const run = routines.startRun(id, at(now, daysAgo as number, 7, 0), null);
    routines.finishRun(run, at(now, daysAgo as number, 7, 2), {
      status: status as "finished" | "failed",
      steps: [],
      result: status === "finished" ? "Still 3,890 kr." : null,
      error: status === "failed" ? "The page didn't load" : null,
      tokens: null,
      seen: true,
    });
  });
  writeFileSync(join(folder, "settings.json"), JSON.stringify({ onboarded: true }));
  return { chats, routines };
};

const main = async (folder: string | undefined) => {
  if (!folder) throw new Error("Name a new profile folder: pnpm dlx tsx evals/suggestionsCheck.ts /tmp/blueberry-suggestions-check");
  if (existsSync(folder) && readdirSync(folder).length > 0) throw new Error(`${folder} isn't empty. Use a new folder.`);
  if (!hasModel()) throw new Error("No model key. Link .env first.");
  mkdirSync(folder, { recursive: true });
  const now = Date.now();
  const { chats, routines } = seed(folder, now);
  const history = new HistoryStore(join(folder, "history.db"));

  let answered: () => void = () => {};
  const done = new Promise<void>((resolve) => (answered = resolve));
  const suggestions = new Suggestions(join(folder, "suggestions.json"), {
    enabled: () => true,
    visits: () => history.since(now - 28 * DAY_MS, 5000),
    chats: () => chats.firstMessages(100).map((chat) => ({ ...chat, outcome: chat.replied ? "done" : "no reply" })),
    routines: () =>
      routines.routines().map((routine): Routine => ({
        ...routine,
        scheduleSpec: routine.schedule,
        schedule: scheduleLabel(routine.schedule),
        lastResult: "",
        status: "idle",
        latestRun: null,
        unseen: false,
      })),
    runs: (id) => routines.runs(id),
    mascots: () => [],
    hasModel: () => true,
    write: async (system, data) => {
      writeFileSync(join(folder, "digest-sent.txt"), data);
      const started = Date.now();
      try {
        const reply = await writeWithCheapModel(system, data);
        writeFileSync(join(folder, "model-reply.json"), reply);
        console.log(`Model answered in ${((Date.now() - started) / 1000).toFixed(1)}s. Digest: ${data.length} characters.`);
        return reply;
      } finally {
        setTimeout(answered, 50);
      }
    },
    onChanged: () => {},
  });
  console.log("Before the model (the old rules):", JSON.stringify(suggestions.list(), null, 2));
  await done;
  const proposed = (JSON.parse(readFileSync(join(folder, "model-reply.json"), "utf8")) as { cards: unknown[] }).cards;
  console.log(`\nThe model proposed ${proposed.length}:`, JSON.stringify(proposed, null, 2));
  const saved = JSON.parse(readFileSync(join(folder, "suggestions.json"), "utf8")) as { proposals: unknown[] };
  console.log(`\n${saved.proposals.length} got past the checks:`, JSON.stringify(saved.proposals, null, 2));
  console.log("\nShown on the new tab:", JSON.stringify(suggestions.list(), null, 2));
};

if (process.argv[1]?.endsWith("suggestionsCheck.ts")) void main(process.argv[2]).catch((error) => {
  console.error(error);
  process.exit(1);
});
