import type { RoutineRunStatus } from "../shared/library";
import { normaliseSite } from "../shared/mascots";
import { isShareable, plainText, shareableTitle, titleToShare, type PatternVisit } from "./suggestionPatterns";

// What the model reads to decide what to suggest. Built here, in code, from summaries only: site names, page titles in
// order, search queries, chat and routine titles, and when. Never a page's text or a full address. Every item has a
// short id, and a suggestion has to cite the ids it's based on, so code can check each one against what's really here.

const DAY_MS = 86_400_000;
export const DIGEST_WINDOW_MS = 14 * DAY_MS;
const SESSION_GAP_MS = 30 * 60_000;
const MAX_SESSIONS = 60;
const MAX_PAGES_PER_SESSION = 15;
const MAX_SEARCHES = 30;
const MAX_SEARCH_TIMES = 8;
const MAX_QUERY_LENGTH = 80;
const MAX_CHATS = 30;
const MAX_ROUTINES = 20;
const MAX_RUNS = 5;
const MAX_FLOCK = 20;
const MAX_FEEDBACK = 20;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The one place a search engine's address counts for anything: only its query is taken, and only from these.
const SEARCH_ENGINES: Array<{ host: RegExp; path: RegExp; param: string }> = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search$/, param: "q" },
  { host: /(^|\.)bing\.com$/, path: /^\/search$/, param: "q" },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\/(html\/?)?$/, param: "q" },
  { host: /(^|\.)ecosia\.org$/, path: /^\/search$/, param: "q" },
  { host: /(^|\.)search\.yahoo\.com$/, path: /^\/search/, param: "p" },
  { host: /(^|\.)kagi\.com$/, path: /^\/search$/, param: "q" },
];
// A search can say more than a visit: these are left out, though a list like this can miss one.
const SENSITIVE_QUERY =
  /throat|pain|ache|sick|fever|rash|cough|pregnan|cancer|tumou?r|hiv|std|herpes|depress|anxiety|suicid|therap|diagnos|symptom|medic|doctor|clinic|abortion|porn|sex|nude|naked|debt|loan|lawyer|divorce|arrest|password|login|log in|sign in/i;

export const searchQuery = (url: string): string | null => {
  try {
    const { protocol, hostname, pathname, searchParams, username, password } = new URL(url);
    if ((protocol !== "https:" && protocol !== "http:") || username || password) return null;
    const host = hostname.toLowerCase();
    const engine = SEARCH_ENGINES.find((candidate) => candidate.host.test(host) && candidate.path.test(pathname));
    const raw = engine ? searchParams.get(engine.param) : null;
    const query = raw ? titleToShare(raw) : null;
    if (!query || query.length > MAX_QUERY_LENGTH || SENSITIVE_QUERY.test(query)) return null;
    return query.toLowerCase();
  } catch {
    return null;
  }
};

export interface DigestChat {
  id: string;
  title: string;
  updatedAt: number;
  outcome: "done" | "failed" | "stopped" | "no reply";
}

export interface DigestRoutine {
  id: string;
  name: string;
  schedule: string;
  sites: string[];
  // Newest first.
  runs: Array<{ status: RoutineRunStatus; startedAt: number }>;
}

export interface DigestMascot {
  name: string;
  sites: string[];
}

export interface Feedback {
  verdict: "dismissed" | "used";
  kind: string;
  line: string;
  body: string;
  sites: string[];
  at: number;
}

export interface DigestInput {
  // Newest first, as the history gives them.
  visits: PatternVisit[];
  chats: DigestChat[];
  routines: DigestRoutine[];
  mascots: DigestMascot[];
  feedback: Feedback[];
  now: number;
}

// What one cited id stands for, for the checks.
export interface Evidence {
  id: string;
  // The sites a suggestion citing it may use.
  hosts: string[];
  // When the user did it, for checking a schedule. A routine's own runs aren't the user's habit, so they have none.
  times: number[];
  // Every number that may be said about it.
  numbers: number[];
  // Everything it says, for checking what a suggestion names.
  text: string;
  // What it's about across rebuilds, as `site:host`, `search:query`, `chat:id` or `routine:id`.
  sources: string[];
}

export interface Digest {
  data: object;
  evidence: Map<string, Evidence>;
  // Every site in the history, so a suggestion can't name one its evidence doesn't hold.
  allHosts: string[];
  // A number that changes when anything here does, so a model is only asked again when there's something new.
  newest: number;
}

export const when = (at: number): string => {
  const date = new Date(at);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const numbersIn = (text: string): number[] => (text.match(/\d+/g) ?? []).map(Number);
const dayOf = (at: number): string => new Date(at).toDateString();

type Step = { host: string; title: string | null; at: number } | { query: string; at: number };

const sessionsOf = (visits: PatternVisit[], now: number): Step[][] => {
  const steps = visits
    .filter(({ visitedAt }) => visitedAt <= now && now - visitedAt <= DIGEST_WINDOW_MS)
    .flatMap((visit): Step[] => {
      const query = searchQuery(visit.url);
      if (query) return [{ query, at: visit.visitedAt }];
      const host = isShareable(visit.url) ? normaliseSite(visit.url) : null;
      return host ? [{ host, title: shareableTitle(visit), at: visit.visitedAt }] : [];
    })
    .sort((a, b) => a.at - b.at);
  const sessions: Step[][] = [];
  steps.forEach((step) => {
    const last = sessions.at(-1);
    if (last && step.at - last[last.length - 1].at <= SESSION_GAP_MS) last.push(step);
    else sessions.push([step]);
  });
  return sessions;
};

export const buildDigest = ({ visits, chats, routines, mascots, feedback, now }: DigestInput): Digest => {
  const evidence = new Map<string, Evidence>();
  const add = (item: Evidence) => evidence.set(item.id, item);

  // Sessions, newest first, so the newest keep their place when the list is cut.
  const sessions = sessionsOf(visits, now).reverse().slice(0, MAX_SESSIONS);
  const sessionData = sessions.map((steps, index) => {
    const id = `s${index + 1}`;
    const pages: Array<{ site: string; title?: string; times?: number } | { searched: string }> = [];
    steps.forEach((step) => {
      const last = pages.at(-1);
      if ("query" in step) {
        if (!(last && "searched" in last && last.searched === step.query)) pages.push({ searched: step.query });
        return;
      }
      if (last && "site" in last && last.site === step.host && (last.title ?? null) === step.title) last.times = (last.times ?? 1) + 1;
      else pages.push({ site: step.host, ...(step.title ? { title: step.title } : {}) });
    });
    const start = steps[0].at;
    const minutes = Math.round((steps[steps.length - 1].at - start) / 60_000);
    const hosts = [...new Set(steps.flatMap((step) => ("host" in step ? [step.host] : [])))];
    const shown = pages.slice(0, MAX_PAGES_PER_SESSION);
    const text = [...hosts, ...shown.map((page) => ("searched" in page ? page.searched : (page.title ?? "")))].join(" \n ");
    add({
      id,
      hosts,
      times: [start],
      numbers: [minutes, pages.length, steps.length, ...hosts.map((host) => steps.filter((step) => "host" in step && step.host === host).length), ...numbersIn(when(start))],
      text,
      sources: hosts.map((host) => `site:${host}`),
    });
    return { id, start: when(start), minutes, pages: shown };
  });

  // Searches, the most repeated first.
  const byQuery = new Map<string, number[]>();
  sessions.flat().forEach((step) => {
    if ("query" in step) byQuery.set(step.query, [...(byQuery.get(step.query) ?? []), step.at]);
  });
  const searchData = [...byQuery]
    .sort((a, b) => b[1].length - a[1].length || Math.max(...b[1]) - Math.max(...a[1]))
    .slice(0, MAX_SEARCHES)
    .map(([query, times], index) => {
      const id = `q${index + 1}`;
      const sorted = [...times].sort((a, b) => b - a);
      const days = new Set(times.map(dayOf)).size;
      add({ id, hosts: [], times, numbers: [times.length, days, ...sorted.flatMap((at) => numbersIn(when(at)))], text: query, sources: [`search:${query}`] });
      return { id, query, times: times.length, days, when: sorted.slice(0, MAX_SEARCH_TIMES).map(when) };
    });

  const chatData = chats
    .filter(({ updatedAt }) => updatedAt <= now && now - updatedAt <= DIGEST_WINDOW_MS * 2)
    .flatMap((chat) => {
      const title = titleToShare(chat.title);
      return title ? [{ ...chat, title }] : [];
    })
    .slice(0, MAX_CHATS)
    .map(({ id: chatId, title, updatedAt, outcome }, index) => {
      const id = `c${index + 1}`;
      add({ id, hosts: [], times: [updatedAt], numbers: numbersIn(`${title} ${when(updatedAt)}`), text: title, sources: [`chat:${chatId}`] });
      return { id, title, when: when(updatedAt), ...(outcome === "done" ? {} : { outcome }) };
    });

  const routineData = routines.slice(0, MAX_ROUTINES).map((routine, index) => {
    const id = `r${index + 1}`;
    const name = plainText(routine.name).slice(0, 60);
    const runs = routine.runs.slice(0, MAX_RUNS);
    const failed = runs.filter(({ status }) => status === "failed" || status === "interrupted").length;
    add({
      id,
      hosts: routine.sites,
      times: [],
      numbers: [runs.length, failed, ...numbersIn(`${name} ${routine.schedule}`), ...runs.flatMap(({ startedAt }) => numbersIn(when(startedAt)))],
      text: `${name} ${routine.sites.join(" ")}`,
      sources: [`routine:${routine.id}`],
    });
    return { id, name, schedule: routine.schedule, ...(routine.sites.length ? { sites: routine.sites } : {}), lastRuns: runs.map(({ status, startedAt }) => ({ when: when(startedAt), result: status })) };
  });

  const flockData = mascots.slice(0, MAX_FLOCK).map(({ name, sites }, index) => ({ id: `m${index + 1}`, name: plainText(name), sites }));
  const feedbackData = feedback.slice(-MAX_FEEDBACK).map(({ verdict, kind, line, body }, index) => ({ id: `f${index + 1}`, [verdict]: true, kind, line, body }));

  const allHosts = [...new Set(visits.flatMap(({ url }) => (isShareable(url) ? (normaliseSite(url) ?? []) : [])))];
  const newest = Math.max(
    0,
    ...visits.slice(0, 1).map(({ visitedAt }) => visitedAt),
    ...chats.map(({ updatedAt }) => updatedAt),
    ...routines.flatMap(({ runs }) => runs.slice(0, 1).map(({ startedAt }) => startedAt))
  );
  return {
    data: {
      now: when(now),
      sessions: sessionData,
      searches: searchData,
      chats: chatData,
      routines: routineData,
      flock: flockData,
      feedback: feedbackData,
    },
    evidence,
    allHosts,
    newest,
  };
};
