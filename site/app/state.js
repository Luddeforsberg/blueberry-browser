import { asContinuation, BERRY_ID, conversationsOf, finishedWhen, flockFromRows, rowTime, withSiteNames } from "../shared.js";

// What the page knows, and the words it says about it. Everything here was read as the signed-in user only.

export const state = {
  jobs: null,
  flock: flockFromRows([]),
  flockShared: null,
  linked: null,
  problem: null,
  push: "unavailable",
  // Handoffs this phone has taken over, by approval id, so the live page is unlocked for them.
  taken: new Set(),
  // Answered here and on their way, so a poll that crosses them doesn't bring them back.
  answered: new Set(),
  // Asks that have been up as a sheet already, so one put away doesn't come back by itself.
  seen: new Set(),
  // Finished jobs whose steps are open.
  unfolded: new Set(),
  // What's being typed, by conversation, and "" for a new job, so drawing again never loses it.
  drafts: new Map(),
  // What just happened, said for a few seconds.
  said: null,
};

// Set by app.js: draw what's shown again; read everything again and draw it; read everything again without drawing.
export const hooks = { show: () => {}, load: async () => {}, refresh: async () => {} };

// Who a job runs as: its own name, and its look from the flock if the phone has it.
export const mascotOf = (job) => {
  const snapshot = job.mascot ?? {};
  const known = state.flock.find((mascot) => mascot.id === snapshot.id) ?? (snapshot.id === BERRY_ID ? state.flock[0] : null);
  return { id: String(snapshot.id ?? ""), name: typeof snapshot.name === "string" && snapshot.name ? snapshot.name : "Berry", look: known?.look ?? state.flock[0].look };
};

// The flock member a job may go on as: only one still in the flock, with its limits as they are now.
export const senderOf = (job) => {
  const id = job.mascot?.id;
  return id === BERRY_ID ? state.flock[0] : (state.flock.find((mascot) => mascot.id === id) ?? null);
};

// Who the box talks to, kept for this visit.
const CHOSEN = "blueberry.bird";
export const chosen = () => {
  let id = null;
  try {
    id = sessionStorage.getItem(CHOSEN);
  } catch {
    // Private windows can refuse it.
  }
  return state.flock.find((mascot) => mascot.id === id) ?? state.flock[0];
};
export const choose = (mascot) => {
  try {
    sessionStorage.setItem(CHOSEN, mascot.id);
  } catch {
    // Chosen until the page is drawn again.
  }
};

export const conversations = () => conversationsOf(state.jobs ?? []);
export const conversation = (id) => conversations().find((candidate) => candidate.id === id) ?? null;

// The sites the user brought along live in their Browserbase Context, which only the computer knows. Its last job says.
export const contextOf = () => (state.jobs ?? []).find((job) => typeof job.context_id === "string")?.context_id ?? null;

export const stepsOf = (job) => (Array.isArray(job.steps) ? job.steps : []).filter((step) => typeof step?.text === "string").slice(-200);
export const going = (job) => job.status === "queued" || job.status === "running" || job.status === "waiting";
export const askOf = (job) => (job.status === "waiting" && job.ask && !state.answered.has(job.ask.approval_id) ? job.ask : null);

// Everything waiting for an answer, the oldest first.
export const waiting = () =>
  conversations()
    .flatMap(({ id, latest }) => {
      const ask = askOf(latest);
      return ask ? [{ conversation: id, job: latest, ask, mascot: mascotOf(latest) }] : [];
    })
    .sort((a, b) => String(a.ask.approval_asked_at ?? "").localeCompare(String(b.ask.approval_asked_at ?? "")));

// Only ever Browserbase's own page, as the database and the app also check.
const isLiveView = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "browserbase.com" || hostname.endsWith(".browserbase.com"));
  } catch {
    return false;
  }
};
export const liveOf = (job) => (typeof job.live_view_url === "string" && isLiveView(job.live_view_url) ? job.live_view_url : null);

const MOOD_FOR = { queued: "fetching", running: "fetching", waiting: "asking", done: "delivered", failed: "oops", stopped: "rest" };
// One answered here and on its way is working again, whatever the row still says.
export const moodOf = (job) => (askOf(job) ? "asking" : job.status === "waiting" ? "fetching" : (MOOD_FOR[job.status] ?? "rest"));

// --- Words ---

const time = (iso) => {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
};
// How long ago, as a row writes it: "now", "12m", "2h", "Sat", "3 Nov".
export const ago = (iso) => {
  const at = time(iso);
  return at === null ? "" : rowTime(at);
};
// How long something has been going, "0:48", from when it started to now or to when it ended.
export const lasted = (from, to) => {
  const start = time(from);
  if (start === null) return "";
  return rowTime(start, { now: time(to) ?? Date.now(), going: true });
};
// "at 14:09", "yesterday", "on Mon".
export const finished = (iso) => {
  const at = time(iso);
  return at === null ? "" : finishedWhen(at);
};

export const greeting = () => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
};

// The sentence on top names sites. The exact words always stay under it in full, because that's what is being allowed.
export const handoffWords = (name, ask) => {
  const site = ask.approval_site || "a site";
  return ask.approval_need === "captcha" ? `${name} needs you to solve a check on ${site}` : `${name} needs you to sign in on ${site}`;
};
export const asked = (name, ask) => {
  if (ask.approval_kind === "handoff") return handoffWords(name, ask);
  if (ask.approval_kind === "question") return `${name} asks: ${withSiteNames(ask.approval_text)}`;
  return `${name} wants to ${asContinuation(withSiteNames(ask.approval_text))}`;
};
// The same, with the first letter up, for the line under "Scout wants to".
export const wanted = (ask) => {
  const words = withSiteNames(ask.approval_text);
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const SET_UP = "Set it up in Blueberry on your computer, in Settings > Connections > Cloud.";
export const NOT_SET_UP = `Nothing can run in the cloud yet. ${SET_UP}`;
export const problemWords = (error) => {
  if (error?.status === 0) return "Couldn’t reach Blueberry’s server. Check your connection.";
  if (error?.status === 401) return "You were signed out. Sign in again.";
  if (/Too many/.test(error?.message ?? "")) return "Five jobs are already going in the cloud. Try again when one is done.";
  if (/No runner/.test(error?.message ?? "")) return NOT_SET_UP;
  if (error?.status === 409) return "This conversation already has a job going. Send this once it’s done.";
  return "Something went wrong. Try again in a moment.";
};

// What just happened, said for a few seconds and then gone, so it never sits over the next question.
let sayingTimer = null;
export const saying = (words) => {
  state.said = words;
  clearTimeout(sayingTimer);
  sayingTimer = setTimeout(() => {
    state.said = null;
    hooks.show();
  }, 4_000);
};

// The sites a job used, from what its steps say, for the chips under its reply. Only names, never whole addresses.
const SITE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
const NOT_SITES = /\.(?:pdf|png|jpe?g|gif|svg|txt|csv|docx?|xlsx?|html?|js|json|zip)$/i;
export const sitesOf = (job) => {
  const found = new Set();
  for (const step of stepsOf(job)) {
    for (const [name] of step.text.matchAll(SITE)) {
      const site = name.toLowerCase().replace(/^www\./, "");
      if (!NOT_SITES.test(site)) found.add(site);
    }
  }
  return [...found].slice(0, 4);
};
