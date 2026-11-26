import { fieldsOf, mascotsFromSharedRows, oneAtATime, runnerLinkDue } from "../shared.js";
import * as api from "./api.js";
import { refreshAsk } from "./ask.js";
import { mountHome } from "./home.js";
import { mountFull } from "./full.js";
import { mountJob } from "./job.js";
import { placeLive } from "./live.js";
import { pushState, register } from "./push.js";
import { refreshSettings } from "./settings.js";
import { closeSheet } from "./sheet.js";
import { mountSignIn } from "./signin.js";
import { hooks, lasted, problemWords, state } from "./state.js";

// Blueberry on the phone: what the user's mascots are doing in the cloud, what they're asking, and the live page each
// is on, read and answered as the signed-in user only. A follow-up is a new job in the same conversation, carrying the
// messages before it, as a chat in the cloud on the computer does. A code is never typed here: a sign-in or a code goes
// into the live page itself, straight to the site. See On the phone in DESIGN.md.
//
// The screen is home, a job, or a job's live page full screen. Each is put up once and then only the parts whose
// contents changed are drawn again, so a poll never takes away focus, typing or the live page.

const POLL_MS = 3_000;

// --- Loading ---

// When the page last heard whether a runner is linked. Linking or unlinking happens on the computer, so it asks again
// now and then.
/** @type {number | null} */
let linkCheckedAt = null;

// What's shown is never older than what was shown before: a read that lands after a newer one has is dropped. One that
// a newer read only started after still lands, so a refresh someone waits on, as a follow-up the server refused does,
// always brings the conversation up to at least when it was asked.
let readsStarted = 0;
let readShown = 0;
const load = async () => {
  const asked = api.accountTurn();
  const read = ++readsStarted;
  const current = () => asked.current && read > readShown;
  try {
    const askLink = state.linked === null || runnerLinkDue(linkCheckedAt, Date.now());
    const [jobs, shared, linked] = await Promise.all([
      api.jobs(),
      api.mascots(),
      askLink ? api.runnerAccepted() : Promise.resolve(undefined),
    ]);
    // Someone signed out or in while it was asking, so none of this is theirs, or a newer read has landed already.
    if (!current()) return;
    readShown = read;
    // A new question takes the place of whatever was said about the last one.
    const asking = jobs.flatMap((job) => (job.ask ? [job.ask.approval_id] : []));
    if (asking.some((id) => !(state.jobs ?? []).some((known) => known.ask?.approval_id === id))) state.said = null;
    state.jobs = jobs;
    state.mascots = mascotsFromSharedRows(shared);
    state.mascotsShared =
      shared
        .flatMap((row) => {
          const { updated_at: at } = fieldsOf(row);
          return typeof at === "string" ? [at] : [];
        })
        .sort()
        .at(-1) ?? null;
    if (linked !== undefined) {
      state.linked = linked;
      linkCheckedAt = Date.now();
    }
    state.problem = null;
  } catch (error) {
    if (current()) state.problem = problemWords(error);
  }
};

// One poll at a time: one asked for while another is out is that one, so there's only ever one timer going.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
const poll = oneAtATime(async () => {
  clearTimeout(timer);
  if (!api.signedIn()) return show();
  if (document.visibilityState === "visible") {
    await load();
    show();
  }
  timer = setTimeout(poll, POLL_MS);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Coming back after a while, the link may have changed on the computer.
  linkCheckedAt = null;
  void poll();
});

// --- The screen ---

/** @returns {{ name: "home" } | { name: "job" | "full" | "yours", id: string }} */
const route = () => {
  const [, id, place] = /^job\/([\w-]{1,100})(?:\/(live|yours))?$/.exec(location.hash.replace(/^#/, "")) ?? [];
  if (!id) return { name: "home" };
  return { name: place === "live" ? "full" : place === "yours" ? "yours" : "job", id };
};

/** @param {HTMLElement} app @param {ReturnType<typeof route>} where */
const mount = (app, where) => {
  if (where.name === "home") return mountHome(app);
  if (where.name === "job") return mountJob(app, where.id);
  return mountFull(app, where.id, where.name === "yours");
};

// The browser's own bar takes the colour of the ground or the sheet, whichever is showing.
/** @param {"ground" | "sheet"} surface */
const themeColor = (surface) => {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${surface}`).trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (channels && meta instanceof HTMLMetaElement) meta.content = `rgb(${channels})`;
};

/** @type {{ key: string, update: (force: boolean) => void }} */
let screen = { key: "", update: () => {} };
const show = (force = false) => {
  const app = document.getElementById("app");
  if (!app) return;
  if (!api.signedIn()) {
    if (screen.key !== "signin" || force) {
      closeSheet({ instant: true });
      screen = { key: "signin", update: mountSignIn(app) };
    }
    themeColor("ground");
    placeLive();
    return;
  }
  const where = route();
  const key = where.name === "home" ? "home/" : `${where.name}/${where.id}`;
  if (key !== screen.key) {
    screen = { key, update: mount(app, where) };
    scrollTo(0, 0);
  }
  screen.update(force);
  refreshAsk();
  refreshSettings();
  placeLive();
  themeColor(where.name === "job" ? "sheet" : "ground");
  tick();
};

hooks.show = show;
hooks.load = () => poll();
hooks.refresh = load;

// How long things have been going, counted on screen each second while anything is.
/** @type {ReturnType<typeof setInterval> | undefined} */
let ticking;
const tick = () => {
  const counting = () => document.querySelectorAll("[data-since]");
  if (ticking || !counting().length) return;
  ticking = setInterval(() => {
    const all = counting();
    if (!all.length) {
      clearInterval(ticking);
      ticking = undefined;
      return;
    }
    for (const node of all) if (node instanceof HTMLElement) node.textContent = lasted(node.dataset.since);
  }, 1_000);
};

// Going back, or anywhere else, puts away a sheet that's up.
window.addEventListener("hashchange", () => {
  closeSheet({ instant: true });
  state.problem = null;
  show();
});

void register();
void pushState().then((push) => {
  state.push = push;
  show();
});
show(true);
void poll();
