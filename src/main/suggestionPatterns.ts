import type { RoutineSchedule, SuggestionKind } from "../shared/library";
import { normaliseSite } from "../shared/mascots";

// What the user repeats, found with plain code. The bar is "you've done this three times", so a short session is enough.
const MIN_TIMES = 3;
const WINDOW_DAYS = 28;
// A habit nobody has kept up for over a week isn't one to bring up. Eight days lets a weekly one count.
const RECENT_DAYS = 8;
const HABIT_WINDOW_MINUTES = 60;
// Most of the visits have to fall in the hour, or a site that's open all day would count as a morning habit.
const HABIT_SHARE = 0.5;
// A routine should be finished by the time they usually look.
const LEAD_MINUTES = 15;
const MANY_PAGES = 5;
const TOGETHER_MINUTES = 20;
const MIN_SHARED_WORDS = 2;
const MIN_WORD_OVERLAP = 0.6;
const WORD_STEM = 5;
const MAX_TITLES = 4;
const MAX_TITLE_LENGTH = 80;
const MAX_LABEL_LENGTH = 24;
const TOP_PATTERNS = 6;
// Looked through on every new tab, so one very busy site can't slow that down.
const MAX_VISITS_PER_SITE = 500;

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const PATTERN_WINDOW_MS = WINDOW_DAYS * DAY_MS;

export interface PatternVisit {
  url: string;
  title: string;
  visitedAt: number;
}

export interface PatternChat {
  id: string;
  title: string;
  firstMessage: string;
  updatedAt: number;
}

export interface PatternSite {
  host: string;
  label: string;
}

export interface Pattern {
  // Everything it's about, as `site:host` or `chat:id`. Dismissing one card rules out every pattern sharing any of them.
  ids: string[];
  kind: SuggestionKind;
  sites: PatternSite[];
  // The card's reason, always written here so a model can't change the numbers.
  why: string;
  pageTitles: string[];
  chatTitles: string[];
  schedule: RoutineSchedule | null;
  score: number;
}

const PRIVATE_SUFFIX = /\.(local|internal|lan|corp|home|intranet|localhost)$/;
const IP_ADDRESS = /^\d+\.\d+\.\d+\.\d+$|^\[/;
const PRIVATE_LABEL =
  /(^|[.-])(mail|email|webmail|inbox|login|signin|sso|auth|accounts?|pay|payments?|checkout|wallet|health|patient|hospital|intranet|vpn|admin|dating)([.-]|$)/;
const PRIVATE_WORD = /bank|mail|outlook|proton|nordea|(^|\.)seb\.|paypal|klarna|revolut|swish|skatteverket|kivra|1177|mychart|porn|xvideos|xnxx|onlyfans|tinder|grindr/;
const PRIVATE_PATH = /^\/(log-?in|sign-?in|account|billing|checkout|inbox|mail|password)(\/|$)/i;
// These are how you get somewhere, not somewhere you go. Nothing can be suggested from them.
const JUST_A_WAY_THERE = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|kagi|baidu|yandex)\.[a-z.]+$/;
const SECRET_PARAMETER = /token|secret|session|sid|auth|password|passwd|pwd|signature|otp|apikey|api_key|access_key|code/i;
const LONG_RANDOM = /^(?=.*\d)[A-Za-z0-9_-]{24,}$/;
const PRIVATE_TITLE = /@|\d{6,}|bank|nordea|inbox|e-?mail|password|lösenord|konto|account|balance|invoice|diagnos|symptom/i;

// Whether a visit may count at all. Local addresses, banks, mail and anything carrying a token are left out, so they
// can't turn up in a pattern or reach the model.
export const isShareable = (url: string): boolean => {
  try {
    const { protocol, hostname, username, password, pathname, searchParams, hash } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (username || password) return false;
    const host = hostname.toLowerCase();
    if (!host.includes(".") || IP_ADDRESS.test(host) || PRIVATE_SUFFIX.test(host)) return false;
    if (PRIVATE_LABEL.test(host) || PRIVATE_WORD.test(host) || JUST_A_WAY_THERE.test(host)) return false;
    if (PRIVATE_PATH.test(pathname) || [...searchParams.keys()].some((key) => SECRET_PARAMETER.test(key))) return false;
    if (/access_token|id_token/.test(hash)) return false;
    return ![...pathname.split("/"), ...searchParams.values()].some((part) => LONG_RANDOM.test(part));
  } catch {
    return false;
  }
};

// One line of text, with nothing in it that could pass for formatting.
export const plainText = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const titleToShare = (title: string): string | null => {
  const clean = plainText(title);
  return !clean || clean.includes("://") || PRIVATE_TITLE.test(clean) ? null : clean.slice(0, MAX_TITLE_LENGTH);
};

// A title may repeat a search or an order number when the address has a query, so those titles stay here.
const shareableTitle = ({ url, title }: PatternVisit): string | null => {
  try {
    return new URL(url).search ? null : titleToShare(title);
  } catch {
    return null;
  }
};

const mostCommon = (items: string[]): Array<[string, number]> => {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]);
};

const lettersOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// What people call the site, from the part of its titles that keeps coming back: "Hacker News", or "GitHub" from
// "Pull requests · acme/app · GitHub". The address will do when nothing does.
const siteLabel = (host: string, titles: string[]): string => {
  const parts = titles.flatMap((title) => [...new Set(title.split(/\s+[-–—|·•:]\s+/).map((part) => part.trim()))]);
  const inHost = (part: string) => {
    const letters = lettersOf(part);
    return letters.length > 1 && lettersOf(host).includes(letters);
  };
  const candidates = mostCommon(parts).filter(([part, count]) => part.length <= MAX_LABEL_LENGTH && count >= titles.length / 2);
  const best = candidates.find(([part]) => inHost(part)) ?? candidates.at(0);
  return best?.[0] ?? host;
};

const dayOf = (at: number): string => {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const minutesOf = (at: number): number => {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
};

const calendarDaysBetween = (from: number, to: number): number => {
  const start = new Date(from);
  const end = new Date(to);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((endDay - startDay) / DAY_MS);
};

const clockTime = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

const scheduleTime = (minutes: number): string => {
  const early = Math.max(0, minutes - LEAD_MINUTES);
  const rounded = early - (early % 5);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
};

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// The hour of the day that holds the most different days, if most of the visits fall in it.
const habitualTime = (visits: PatternVisit[]): { minutes: number; days: number } | null => {
  const sorted = visits.map(({ visitedAt }) => ({ minutes: minutesOf(visitedAt), day: dayOf(visitedAt) })).sort((a, b) => a.minutes - b.minutes);
  let best: { minutes: number; days: number } | null = null;
  sorted.forEach(({ minutes: from }, start) => {
    const inside = sorted.slice(start).filter(({ minutes }) => minutes < from + HABIT_WINDOW_MINUTES);
    const days = new Set(inside.map(({ day }) => day)).size;
    if (days >= MIN_TIMES && inside.length >= sorted.length * HABIT_SHARE && (!best || days > best.days)) {
      best = { minutes: median(inside.map(({ minutes }) => minutes)), days };
    }
  });
  return best;
};

// The weekday that holds most of the days it was visited, on enough different dates.
const habitualWeekday = (visits: PatternVisit[], allDays: number): { weekday: number; dates: number; minutes: number } | null => {
  const byWeekday = new Map<number, PatternVisit[]>();
  visits.forEach((visit) => {
    const weekday = new Date(visit.visitedAt).getDay();
    byWeekday.set(weekday, [...(byWeekday.get(weekday) ?? []), visit]);
  });
  for (const [weekday, onThatDay] of byWeekday) {
    const dates = new Set(onThatDay.map(({ visitedAt }) => dayOf(visitedAt))).size;
    if (dates >= MIN_TIMES && dates >= allDays * HABIT_SHARE) {
      return { weekday, dates, minutes: median(onThatDay.map(({ visitedAt }) => minutesOf(visitedAt))) };
    }
  }
  return null;
};

const howOften = (days: number, span: number): string =>
  days === span ? `every day for the last ${span} days` : `on ${days} of the last ${span} days`;

interface SiteVisits {
  host: string;
  visits: PatternVisit[];
  titles: string[];
  label: string;
}

const groupBySite = (visits: PatternVisit[]): SiteVisits[] => {
  const byHost = new Map<string, PatternVisit[]>();
  visits.forEach((visit) => {
    const host = normaliseSite(visit.url);
    if (!host) return;
    const own = byHost.get(host);
    if (!own) byHost.set(host, [visit]);
    else if (own.length < MAX_VISITS_PER_SITE) own.push(visit);
  });
  return [...byHost].map(([host, own]) => {
    const titles = own.flatMap((visit) => shareableTitle(visit) ?? []);
    return { host, visits: own, titles, label: siteLabel(host, titles) };
  });
};

const distinctTitles = (titles: string[], label: string): string[] =>
  mostCommon(titles)
    .map(([title]) => title)
    .filter((title) => title !== label)
    .slice(0, MAX_TITLES);

const sitePattern = ({ host, visits, titles, label }: SiteVisits, now: number): Pattern | null => {
  const days = new Set(visits.map(({ visitedAt }) => dayOf(visitedAt))).size;
  if (days < MIN_TIMES) return null;
  const newest = Math.max(...visits.map(({ visitedAt }) => visitedAt));
  if (now - newest > RECENT_DAYS * DAY_MS) return null;
  const span = Math.max(days, calendarDaysBetween(Math.min(...visits.map(({ visitedAt }) => visitedAt)), now) + 1);
  const base = {
    ids: [`site:${host}`],
    sites: [{ host, label }],
    pageTitles: distinctTitles(titles, label),
    chatTitles: [],
  };

  const time = habitualTime(visits);
  if (time) {
    return {
      ...base,
      kind: "routine",
      why: `You’ve opened ${label} around ${clockTime(time.minutes)} ${howOften(time.days, span)}`,
      schedule: { kind: "daily", time: scheduleTime(time.minutes) },
      score: time.days * 2,
    };
  }
  const weekday = habitualWeekday(visits, days);
  if (weekday) {
    return {
      ...base,
      kind: "routine",
      why: `You’ve opened ${label} on ${weekday.dates} ${WEEKDAYS[weekday.weekday]}s in the last ${span} days`,
      schedule: { kind: "weekly", days: [weekday.weekday], time: scheduleTime(weekday.minutes) },
      score: weekday.dates * 2,
    };
  }
  const pages = new Set(visits.map(({ url }) => url.split("#")[0])).size;
  if (pages >= MANY_PAGES) {
    return {
      ...base,
      kind: "mascot",
      why: `You’ve been on ${label} ${howOften(days, span)}, across ${pages} pages`,
      schedule: null,
      score: days * 1.5,
    };
  }
  return { ...base, kind: "prompt", why: `You’ve checked ${label} ${howOften(days, span)}`, schedule: null, score: days };
};

const togetherPatterns = (sites: SiteVisits[], visits: PatternVisit[], now: number): Pattern[] => {
  const siteOf = new Map(sites.flatMap((site) => site.visits.map((visit) => [visit, site] as const)));
  const ordered = [...visits].sort((a, b) => a.visitedAt - b.visitedAt);
  const pairs = new Map<string, { a: SiteVisits; b: SiteVisits; days: Set<string>; newest: number; oldest: number }>();
  ordered.forEach((visit, at) => {
    const site = siteOf.get(visit);
    if (!site) return;
    for (let next = at + 1; next < ordered.length && ordered[next].visitedAt - visit.visitedAt <= TOGETHER_MINUTES * 60_000; next++) {
      const other = siteOf.get(ordered[next]);
      if (!other || other === site) continue;
      const [a, b] = [site, other].sort((x, y) => x.host.localeCompare(y.host));
      const key = `${a.host}+${b.host}`;
      const pair = pairs.get(key) ?? { a, b, days: new Set<string>(), newest: 0, oldest: visit.visitedAt };
      pair.days.add(dayOf(visit.visitedAt));
      pair.newest = Math.max(pair.newest, visit.visitedAt);
      pairs.set(key, pair);
    }
  });
  return [...pairs.values()].flatMap(({ a, b, days, newest, oldest }): Pattern[] => {
    if (days.size < MIN_TIMES || now - newest > RECENT_DAYS * DAY_MS) return [];
    const span = Math.max(days.size, calendarDaysBetween(oldest, now) + 1);
    return [
      {
        ids: [`site:${a.host}`, `site:${b.host}`],
        kind: "mascot",
        sites: [a, b].map(({ host, label }) => ({ host, label })),
        why: `You’ve gone back and forth between ${a.label} and ${b.label} ${howOften(days.size, span)}`,
        pageTitles: [...distinctTitles(a.titles, a.label).slice(0, MAX_TITLES / 2), ...distinctTitles(b.titles, b.label).slice(0, MAX_TITLES / 2)],
        chatTitles: [],
        schedule: null,
        // Above either site on its own, because noticing the two together is the better catch.
        score: days.size * 2,
      },
    ];
  });
};

const NOT_WORTH_COMPARING = new Set(
  "about after again also and any are ask can could find for from get give have help how into let like list make me more my need new not now of on please show some tell than that the their them then there these this to today top want was what when where which who why will with would you your".split(" ")
);

// Cut short so "flights" and "flight", or "cheap" and "cheapest", count as the same word in any language.
const wordsOf = (text: string): Set<string> =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((word) => word.length > 2 && !NOT_WORTH_COMPARING.has(word))
      .map((word) => word.slice(0, WORD_STEM))
  );

const areSimilar = (a: Set<string>, b: Set<string>): boolean => {
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared >= MIN_SHARED_WORDS && shared / Math.min(a.size, b.size) >= MIN_WORD_OVERLAP;
};

const chatPatterns = (chats: PatternChat[], now: number): Pattern[] => {
  const groups: Array<{ words: Set<string>; chats: PatternChat[] }> = [];
  [...chats]
    .filter(({ updatedAt }) => now - updatedAt <= PATTERN_WINDOW_MS)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .forEach((chat) => {
      const words = wordsOf(chat.firstMessage);
      const group = groups.find((candidate) => areSimilar(candidate.words, words));
      if (group) group.chats.push(chat);
      else groups.push({ words, chats: [chat] });
    });
  return groups.flatMap(({ chats: members }): Pattern[] => {
    const titles = members.flatMap(({ title }) => titleToShare(title) ?? []);
    // One private title means they're all about something private.
    if (members.length < MIN_TIMES || titles.length < members.length) return [];
    return [
      {
        ids: members.map(({ id }) => `chat:${id}`),
        kind: "prompt",
        sites: [],
        why: `You’ve asked something like this ${members.length} times`,
        pageTitles: [],
        chatTitles: titles.slice(-MAX_TITLES),
        schedule: null,
        score: members.length * 2,
      },
    ];
  });
};

// Every site in the history by the name people would write, such as "reddit" for old.reddit.com.
export const siteNamesIn = (visits: PatternVisit[]): string[] => [
  ...new Set(visits.flatMap(({ url }) => normaliseSite(url)?.split(".").at(-2) ?? []).filter((name) => name.length > 2)),
];

// Everything the history and chats show, best first. Costs a few milliseconds and no money.
export const findPatterns = (visits: PatternVisit[], chats: PatternChat[], now = Date.now()): Pattern[] => {
  const usable = visits.filter(({ url, visitedAt }) => visitedAt <= now && now - visitedAt <= PATTERN_WINDOW_MS && isShareable(url));
  const sites = groupBySite(usable);
  return [
    ...sites.flatMap((site) => sitePattern(site, now) ?? []),
    ...togetherPatterns(sites, usable, now),
    ...chatPatterns(chats, now),
  ].sort((a, b) => b.score - a.score);
};

// The ones worth writing cards for: one of each kind if there is one, and never two about the same thing.
export const topPatterns = (patterns: Pattern[], limit = TOP_PATTERNS): Pattern[] => {
  const chosen: Pattern[] = [];
  const isFree = ({ ids }: Pattern) => !chosen.some((other) => other.ids.some((id) => ids.includes(id)));
  // The mascot goes first, or one of its sites could take the place of the whole pair.
  (["mascot", "routine", "prompt"] as const).forEach((wanted) => {
    const pattern = patterns.find((candidate) => candidate.kind === wanted && isFree(candidate));
    if (pattern) chosen.push(pattern);
  });
  patterns.forEach((pattern) => {
    if (isFree(pattern)) chosen.push(pattern);
  });
  return chosen.slice(0, limit);
};
