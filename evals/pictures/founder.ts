// The made-up person in the README's pictures: Maja Ekholm, cofounder and CEO of Tidvik, a 14-person company in
// Stockholm that sells booking and scheduling software to physiotherapy clinics. Neither is real. In the next weeks she's
// raising a seed extension, watching competitors, hiring two senior engineers and prepping calls. Every address is a real
// public page that opens without a sign-in. See evals/README.md.
import type { Visit } from "../../src/shared/ipc";
import type { MascotDraft, RoutineDraft } from "../../src/shared/library";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const at = (now: number, daysAgo: number, hour: number, minute: number): number => {
  const day = new Date(now - daysAgo * DAY_MS);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};

type Page = [url: string, title: string];

const google = (query: string): Page => [
  `https://www.google.com/search?q=${encodeURIComponent(query).replaceAll("%20", "+")}`,
  `${query} - Google Search`,
];

const PAGES = {
  hackerNews: ["https://news.ycombinator.com/", "Hacker News"],
  sifted: ["https://sifted.eu/", "Sifted: Europe's startup news"],
  siftedHealth: ["https://sifted.eu/sector/healthtech", "Healthtech | Sifted"],
  techCrunch: ["https://techcrunch.com/category/venture/", "Venture | TechCrunch"],
  janePricing: ["https://jane.app/pricing", "Pricing | Jane App"],
  clinikoPricing: ["https://www.cliniko.com/pricing/", "Pricing | Cliniko"],
  clinikoBlog: ["https://www.cliniko.com/blog/news/", "News | Cliniko"],
  calPricing: ["https://cal.com/pricing", "Pricing | Cal.com"],
  calChangelog: ["https://cal.com/changelog", "Changelog | Cal.com"],
  calendlyPricing: ["https://calendly.com/pricing", "Pricing | Calendly"],
  calendlyNotes: ["https://calendly.com/release-notes", "Release notes | Calendly"],
  ycSeed: ["https://www.ycombinator.com/library/4A-a-guide-to-seed-fundraising", "A guide to seed fundraising : YC Startup Library"],
  ycDocuments: ["https://www.ycombinator.com/documents", "Documents | Y Combinator"],
  a16zQuestions: ["https://a16z.com/16-common-questions-about-fundraising/", "16 Common Questions About Fundraising | Andreessen Horowitz"],
  a16zCommandments: [
    "https://a16z.com/the-16-commandments-of-raising-equity-in-a-challenging-market/",
    "The 16 Commandments of Raising Equity in a Challenging Market | Andreessen Horowitz",
  ],
  cartaSeed: ["https://carta.com/learn/startups/fundraising/seed-funding/", "Seed funding: how it works | Carta"],
  visibleUpdates: ["https://visible.vc/blog/investor-updates/", "Investor updates | Visible"],
  hubJobs: ["https://thehub.io/jobs?roles=backenddeveloper&countryCode=SE", "Backend developer jobs in Sweden | The Hub"],
  levels: ["https://www.levels.fyi/t/software-engineer/locations/sweden", "Software Engineer Salary in Sweden | Levels.fyi"],
  platsbanken: ["https://arbetsformedlingen.se/platsbanken/", "Platsbanken | Arbetsförmedlingen"],
  physitrack: ["https://www.physitrack.com/", "Physitrack | Exercise prescription and telehealth"],
  smhi: ["https://www.smhi.se/", "SMHI"],
  gmail: ["https://mail.google.com/mail/u/0/#inbox", "Inbox (9) - Gmail"],
  calendar: ["https://calendar.google.com/calendar/u/0/r/week", "Google Calendar - Week"],
  bank: ["https://www.seb.se/privat/konton", "Mina konton | SEB"],
} satisfies Record<string, Page>;

const visit = ([url, title]: Page, visitedAt: number): Visit => ({ url, title, favicon: null, visitedAt });

// Each habit as [page, days ago, hour, minute] rows, so the history reads like two real weeks.
type Row = [Page, number, number, number];

const WEEKDAYS_AGO = [1, 2, 3, 4, 7, 8, 9, 10, 11, 14];

const mornings = (): Row[] =>
  WEEKDAYS_AGO.flatMap((daysAgo, index): Row[] => [
    [PAGES.gmail, daysAgo, 7, 30],
    [PAGES.hackerNews, daysAgo, 7, 42 + (index % 3)],
    [index % 2 ? PAGES.sifted : PAGES.techCrunch, daysAgo, 7, 51],
    [PAGES.calendar, daysAgo, 8, 2],
  ]);

// Competitors on Monday mornings and once mid-week, the same few pages together.
const competitors = (): Row[] =>
  [4, 11, 9, 2].flatMap((daysAgo, index): Row[] => [
    [PAGES.janePricing, daysAgo, 9, 10 + index],
    [PAGES.clinikoPricing, daysAgo, 9, 16 + index],
    [index % 2 ? PAGES.calendlyNotes : PAGES.calChangelog, daysAgo, 9, 24 + index],
    [index === 0 ? google("jane app vs cliniko") : PAGES.clinikoBlog, daysAgo, 9, 31 + index],
  ]);

// The seed extension, read in the evenings.
const fundraising = (): Row[] => [
  [google("seed extension terms 2026"), 13, 21, 5],
  [PAGES.ycSeed, 13, 21, 9],
  [PAGES.a16zCommandments, 12, 21, 40],
  [PAGES.cartaSeed, 10, 20, 55],
  [PAGES.ycDocuments, 10, 21, 10],
  [google("investor update template"), 8, 21, 15],
  [PAGES.visibleUpdates, 8, 21, 18],
  [PAGES.a16zQuestions, 6, 20, 30],
  [PAGES.ycSeed, 3, 21, 2],
  [PAGES.visibleUpdates, 1, 20, 44],
];

// Two senior engineers to hire.
const hiring = (): Row[] =>
  [9, 7, 3, 1].flatMap((daysAgo, index): Row[] => [
    [PAGES.hubJobs, daysAgo, 14, 5 + index * 2],
    [index < 2 ? google("senior backend engineer salary stockholm") : PAGES.levels, daysAgo, 14, 14 + index],
    [PAGES.platsbanken, daysAgo, 14, 22 + index],
  ]);

// A partner call and the clinics around it, and the rest of a life.
const calls = (): Row[] => [
  [PAGES.physitrack, 8, 10, 40],
  [PAGES.siftedHealth, 8, 10, 52],
  [PAGES.physitrack, 2, 11, 5],
  [google("physio clinic chains sweden"), 2, 11, 12],
  [PAGES.smhi, 6, 7, 15],
  [PAGES.smhi, 5, 8, 40],
  [PAGES.bank, 5, 19, 30],
  [PAGES.bank, 12, 19, 10],
];

export const founderVisits = (now = Date.now()): Visit[] =>
  [...mornings(), ...competitors(), ...fundraising(), ...hiring(), ...calls()]
    .map(([page, daysAgo, hour, minute]) => visit(page, at(now, daysAgo, hour, minute)))
    .filter(({ visitedAt }) => visitedAt <= now - MINUTE_MS);

export const BOOKMARKS: Page[] = [PAGES.janePricing, PAGES.clinikoPricing, PAGES.ycSeed, PAGES.hubJobs];

// The apps she lives in, kept on top. Each with the icon its own page names, where /favicon.ico isn't one, and Google
// Calendar's with today's date on it, as Google draws it.
export const pinned = (now: number): Array<[url: string, title: string, favicon: string | null]> => [
  ["https://mail.google.com/mail/u/0/#inbox", "Gmail", null],
  [
    "https://calendar.google.com/calendar/u/0/r",
    "Google Calendar",
    `https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_${new Date(now).getDate()}.ico`,
  ],
  ["https://app.slack.com/client", "Slack", null],
  ["https://www.notion.so/", "Notion", "https://www.notion.so/images/favicon.ico"],
  ["https://app.hubspot.com/", "HubSpot", "https://static.hsappstatic.net/quartz/static-1.6368/favicon/favicon-32x32.png"],
  ["https://linear.app/", "Linear", null],
  ["https://dashboard.stripe.com/", "Stripe", null],
  ["https://drive.google.com/drive/my-drive", "Google Drive", null],
];

// The web pages left open, in order, with a new tab after them in front.
export const OPEN_TABS: Page[] = [PAGES.ycSeed, PAGES.cartaSeed, PAGES.janePricing, PAGES.hubJobs, PAGES.sifted, PAGES.hackerNews];

// Her own mascot, beside three of the Gallery's starters.
export const STARTERS = ["meeting-prep", "competitor-watch", "talent-scout"] as const;

export const INVESTOR_UPDATE: MascotDraft = {
  name: "Investor Update",
  look: { palette: "cloudberry", accessory: "bow" },
  instructions:
    "Help me write our monthly investor update. From what I paste and the pages I name, draft it in this order: one line on the month, the numbers (ARR, net new clinics, burn, runway), three highlights, one lowlight said plainly, and at most two asks. Keep it under 300 words, in plain English with no hype. Mark any number you couldn't check.",
  sites: [],
  tools: ["visit"],
};

// What she's said she likes, by mascot name, as she pressed Remember on them.
export const FACTS: Record<string, string[]> = {
  "Investor Update": ["Updates go out on the first Monday of the month.", "Lead with ARR and runway, then the asks."],
  "Competitor Watch": ["Compare plans for a chain of 40 practitioners, our usual customer."],
};

// Named routines, by mascot name or null for Berry.
export const ROUTINES: Array<RoutineDraft & { mascot: string | null }> = [
  {
    name: "Investor update draft",
    instructions: "Draft this month's investor update from my notes, and list what's missing.",
    schedule: { kind: "monthly", day: 1, time: "08:00" },
    mascot: "Investor Update",
  },
  {
    name: "Morning startup news",
    instructions: "Pick the five stories from Sifted and Hacker News most relevant to a Nordic B2B SaaS founder.",
    schedule: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "07:40" },
    sites: ["sifted.eu", "news.ycombinator.com"],
    mascot: null,
  },
];
