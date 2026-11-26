import {
  asContinuation,
  BERRY_ID,
  conversationsOf,
  finishedWhen,
  mascotsFromSharedRows,
  rowTime,
  stripWww,
  withSiteNames,
} from "../shared.js";
import { ApiError, onAccountChange } from "./api.js";

/** @import { MascotProfile, PhoneAsk, PhoneJob, PhoneJobStatus } from "../shared.js" */
/** @import { Mood } from "../draw.js" */
/** @import { PushState } from "./push.js" */

// What the page knows, and the words it says about it. Everything here was read as the signed-in user only.

/**
 * @typedef {object} State
 * @property {PhoneJob[] | null} jobs
 * @property {[MascotProfile, ...MascotProfile[]]} mascots Berry first, always.
 * @property {string | null} mascotsShared When the computer last shared them.
 * @property {boolean | null} linked
 * @property {string | null} problem
 * @property {PushState} push
 * @property {Set<string>} taken
 * @property {Set<string>} answered
 * @property {Set<string>} seen
 * @property {Set<string>} unfolded
 * @property {Set<string>} allSteps
 * @property {Map<string, string>} drafts
 * @property {string | null} said
 */

/** @type {State} */
export const state = {
  jobs: null,
  mascots: mascotsFromSharedRows([]),
  mascotsShared: null,
  linked: null,
  problem: null,
  push: "unavailable",
  // Handoffs this phone has taken over, by approval id, so the live page is unlocked for them.
  taken: new Set(),
  // Answered here, so a poll that crossed the answer doesn't bring them back.
  answered: new Set(),
  // Asks that have been up as a sheet already, so one put away doesn't come back by itself.
  seen: new Set(),
  // Finished jobs whose steps are open.
  unfolded: new Set(),
  // Jobs going whose earlier steps are showing.
  allSteps: new Set(),
  // What's being typed, by conversation, and "" for a new job, so drawing again never loses it.
  drafts: new Map(),
  // What just happened, said for a few seconds.
  said: null,
};

// Who the box talks to, kept for this visit. A page from before the mascots were called mascots kept it under the old
// key, which moves to the new one the first time it's read.
const CHOSEN = "blueberry.mascot";
const OLD_CHOSEN = "blueberry.bird";

// All of the above but `push`, which is this phone's, belongs to the account signed in, and so does the mascot chosen. Whenever that changes, by signing
// out, by the session running out, or by someone else signing in, it's forgotten at once, so nothing of one account is
// ever drawn for the next, and nothing typed for one is sent as the other.
const forgetAccount = () => {
  Object.assign(state, { jobs: null, mascots: mascotsFromSharedRows([]), mascotsShared: null, linked: null, problem: null, said: null });
  for (const kept of [state.taken, state.answered, state.seen, state.unfolded, state.allSteps, state.drafts]) kept.clear();
  try {
    sessionStorage.removeItem(CHOSEN);
    sessionStorage.removeItem(OLD_CHOSEN);
  } catch {
    // Private windows can refuse it, and then nothing was kept.
  }
};
onAccountChange(forgetAccount);

// Set by app.js: draw what's shown again; read everything again and draw it; read everything again without drawing.
/** @type {{ show: (force?: boolean) => void, load: () => Promise<void>, refresh: () => Promise<void> }} */
export const hooks = { show: () => {}, load: async () => {}, refresh: async () => {} };

// Who a job runs as: its own name, and its look from the phone's mascots if it has it.
/** @param {PhoneJob} job */
export const mascotOf = (job) => {
  const { id, name } = job.mascot;
  const known = state.mascots.find((mascot) => mascot.id === id) ?? (id === BERRY_ID ? state.mascots[0] : null);
  return { id, name: name || "Berry", look: known?.look ?? state.mascots[0].look };
};

// The mascot a job may go on as: only one the phone still has, with its limits as they are now.
/** @param {PhoneJob} job */
export const senderOf = (job) => {
  const { id } = job.mascot;
  return id === BERRY_ID ? state.mascots[0] : (state.mascots.find((mascot) => mascot.id === id) ?? null);
};

export const chosen = () => {
  let id = null;
  try {
    const old = sessionStorage.getItem(OLD_CHOSEN);
    if (old !== null) {
      if (sessionStorage.getItem(CHOSEN) === null) sessionStorage.setItem(CHOSEN, old);
      sessionStorage.removeItem(OLD_CHOSEN);
    }
    id = sessionStorage.getItem(CHOSEN);
  } catch {
    // Private windows can refuse it.
  }
  return state.mascots.find((mascot) => mascot.id === id) ?? state.mascots[0];
};
/** @param {MascotProfile} mascot */
export const choose = (mascot) => {
  try {
    sessionStorage.setItem(CHOSEN, mascot.id);
  } catch {
    // Chosen until the page is drawn again.
  }
};

export const conversations = () => conversationsOf(state.jobs ?? []);
/** One conversation, its jobs oldest first. @typedef {ReturnType<typeof conversations>[number]} Conversation */
/** @param {string} id */
export const conversation = (id) => conversations().find((candidate) => candidate.id === id) ?? null;

// The sites the user brought along live in their Browserbase Context, which only the computer knows. Its last job says.
export const contextOf = () => (state.jobs ?? []).find((job) => job.context_id !== null)?.context_id ?? null;

/** @param {PhoneJob} job */
export const going = (job) => job.status === "queued" || job.status === "running" || job.status === "waiting";
/** @param {PhoneJob} job */
export const askOf = (job) => (job.status === "waiting" && job.ask && !state.answered.has(job.ask.approval_id) ? job.ask : null);

/** One ask waiting, with who asks and in which conversation. @typedef {ReturnType<typeof waiting>[number]} Waiting */

// Everything waiting for an answer, the oldest first.
export const waiting = () =>
  conversations()
    .flatMap(({ id, latest }) => {
      const ask = askOf(latest);
      return ask ? [{ conversation: id, job: latest, ask, mascot: mascotOf(latest) }] : [];
    })
    .sort((a, b) => String(a.ask.approval_asked_at ?? "").localeCompare(String(b.ask.approval_asked_at ?? "")));

// Only ever Browserbase's own page, as the database and the app also check.
/** @param {string} url */
const isLiveView = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "browserbase.com" || hostname.endsWith(".browserbase.com"));
  } catch {
    return false;
  }
};
/** @param {PhoneJob} job */
export const liveOf = (job) => (job.live_view_url !== null && isLiveView(job.live_view_url) ? job.live_view_url : null);

/** @type {Record<PhoneJobStatus, Mood>} */
const MOOD_FOR = { queued: "fetching", running: "fetching", waiting: "asking", done: "delivered", failed: "oops", stopped: "rest" };
// One answered here is working again, whatever the row still says.
/** @param {PhoneJob} job @returns {Mood} */
export const moodOf = (job) => (askOf(job) ? "asking" : job.status === "waiting" ? "fetching" : MOOD_FOR[job.status]);

// --- Words ---

/** @param {string | null | undefined} iso */
const time = (iso) => {
  const at = Date.parse(iso ?? "");
  return Number.isNaN(at) ? null : at;
};
// How long ago, as a row writes it: "now", "12m", "2h", "Sat", "3 Nov".
/** @param {string | null} iso */
export const ago = (iso) => {
  const at = time(iso);
  return at === null ? "" : rowTime(at);
};
// How long something has been going, "0:48", from when it started to now or to when it ended.
/** @param {string | undefined} from @param {string} [to] */
export const lasted = (from, to) => {
  const start = time(from);
  if (start === null) return "";
  return rowTime(start, { now: time(to) ?? Date.now(), going: true });
};
// "at 14:09", "yesterday", "on Mon".
/** @param {string} iso */
export const finished = (iso) => {
  const at = time(iso);
  return at === null ? "" : finishedWhen(at);
};

export const greeting = () => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
};

// The sentence on top names sites. The exact words always stay under it in full, because that's what is being allowed.
/** @param {string} name @param {PhoneAsk} ask */
export const handoffWords = (name, ask) => {
  const site = ask.approval_site || "a site";
  return ask.approval_need === "captcha" ? `${name} needs you to solve a check on ${site}` : `${name} needs you to sign in on ${site}`;
};
/** @param {string} name @param {PhoneAsk} ask */
export const asked = (name, ask) => {
  if (ask.approval_kind === "handoff") return handoffWords(name, ask);
  if (ask.approval_kind === "question") return `${name} asks: ${withSiteNames(ask.approval_text)}`;
  return `${name} wants to ${asContinuation(withSiteNames(ask.approval_text))}`;
};
// The same, with the first letter up, for the line under "Scout wants to".
/** @param {PhoneAsk} ask */
export const wanted = (ask) => {
  const words = withSiteNames(ask.approval_text);
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const SET_UP = "Set it up in Blueberry on your computer, in Settings > Connections > Cloud.";
export const NOT_SET_UP = `Nothing can run in the cloud yet. ${SET_UP}`;
/** @param {unknown} error */
export const problemWords = (error) => {
  const status = error instanceof ApiError ? error.status : null;
  const message = error instanceof Error ? error.message : "";
  if (status === 0) return "Couldn’t reach Blueberry’s server. Check your connection.";
  if (status === 401) return "You were signed out. Sign in again.";
  if (/Too many/.test(message)) return "Five jobs are already going in the cloud. Try again when one is done.";
  if (/No runner/.test(message)) return NOT_SET_UP;
  if (status === 409) return "This conversation already has a job going. Send this once it’s done.";
  return "Something went wrong. Try again in a moment.";
};

// What just happened, said for a few seconds and then gone, so it never sits over the next question.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let sayingTimer;
/** @param {string} words */
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
/** @param {PhoneJob} job */
export const sitesOf = (job) => {
  /** @type {Set<string>} */
  const found = new Set();
  for (const step of job.steps) {
    for (const [name] of step.text.matchAll(SITE)) {
      const site = stripWww(name.toLowerCase());
      if (!NOT_SITES.test(site)) found.add(site);
    }
  }
  return [...found].slice(0, 4);
};
