import { appearance, setAppearance } from "../theme.js";
import { asContinuation, BERRY_ID, conversationsOf, flockFromRows, followUpHistory, permissionsInWords, plausibleCode, snapshotOf, withSiteNames } from "../shared.js";
import * as api from "./api.js";
import { POSES } from "./poses.js";
import { pushState, register, turnOff, turnOn } from "./push.js";

// Blueberry on the phone: the conversations your birds are having in the cloud, what they're asking, and the live view of
// the page each is on, read and answered as the signed-in user only. A follow-up is a new job in the same conversation,
// carrying the messages before it, as a runner chat on the Mac does. Everything from the server goes in as text. The one piece of
// markup is our own drawing, chosen by keys checked against the poses we have. A code is never typed here: a sign-in
// or a code goes into the live view itself, straight to the site.

const POLL_MS = 3_000;
const SVG = "http://www.w3.org/2000/svg";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key.startsWith("aria") || key.startsWith("data")) node.setAttribute(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value);
    else node[key] = value;
  }
  node.append(...children.filter((child) => child !== null && child !== false && child !== undefined));
  return node;
};

const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

// Lucide's shapes, drawn here so the page loads nothing from elsewhere.
const ICONS = {
  next: ["m9 18 6-6-6-6"],
  cloud: ["M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"],
  lock: ["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
  unlocked: ["M7 11V7a5 5 0 0 1 9.9-1", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
  up: ["m5 12 7-7 7 7", "M12 19V5"],
  settings: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
};
const icon = (name) => svg("svg", { viewBox: "0 0 24 24", class: "icon", "aria-hidden": "true" }, ...ICONS[name].map((d) => svg("path", { d })));

// Left foot, right foot, as in the app's step trail.
const footprint = (index) =>
  svg("svg", { viewBox: "-8 -8 16 16", class: "foot", "aria-hidden": "true", transform: `rotate(${index % 2 ? 12 : -12})` },
    svg("ellipse", { cx: 0, cy: -3.6, rx: 1.25, ry: 2.9 }),
    svg("ellipse", { cx: -3.2, cy: -1.2, rx: 1.1, ry: 2.5, transform: "rotate(-34 -3.2 -1.2)" }),
    svg("ellipse", { cx: 3.2, cy: -1.2, rx: 1.1, ry: 2.5, transform: "rotate(34 3.2 -1.2)" }),
    svg("ellipse", { cx: 0, cy: 3, rx: 1, ry: 2.1 }));

const MOOD_WORDS = { rest: "at rest", fetching: "working", asking: "waiting for you", delivered: "finished", oops: "something went wrong" };

let drawn = 0;
// A bird in one mood, always the whole drawing. Each gets gradient ids of its own, so one hidden drawing can't take the
// others' colour.
const bird = (mascot, mood, size = "") => {
  const poses = POSES[mascot.look.accessory] ?? POSES.none;
  const holder = el("span", { className: `bird ${size}` });
  const own = `b${++drawn}`;
  holder.innerHTML = (poses[mood] ?? poses.rest).replace(/«[^»]*»/g, (id) => `${own}${id.length}`);
  const drawing = holder.querySelector("svg");
  drawing.dataset.mascot = mascot.look.palette;
  drawing.setAttribute("aria-label", `${mascot.name}, ${MOOD_WORDS[mood] ?? "at rest"}`);
  return holder;
};

const button = (text, { kind = "", onClick } = {}) => el("button", { type: "button", className: `button ${kind}`, textContent: text, onclick: onClick });
const link = (text, href, kind = "") => el("a", { className: `button ${kind}`, href, textContent: text });
const top = (...children) => el("header", { className: "top" }, ...children);
const card = (...children) => el("main", { className: "card" }, ...children);
const say = (words, kind = "muted") => el("p", { className: kind, role: kind.includes("warning") ? "alert" : undefined, textContent: words });

// --- What's known ---

const state = {
  jobs: null,
  flock: flockFromRows([]),
  flockShared: null,
  linked: null,
  problem: null,
  push: "unavailable",
  // Handoffs this phone has taken over, by approval id, so the live view is unlocked for them.
  taken: new Set(),
  // Answered here and on their way, so a poll that crosses them doesn't bring them back.
  answered: new Set(),
  // What's being typed as a follow-up, by conversation, so a redraw doesn't lose it.
  drafts: new Map(),
  said: null,
};

// Who a job runs as: its own name, and its look from the flock if the phone has it.
const mascotOf = (job) => {
  const snapshot = job.mascot ?? {};
  const known = state.flock.find((bird) => bird.id === snapshot.id) ?? (snapshot.id === BERRY_ID ? state.flock[0] : null);
  return { id: String(snapshot.id ?? ""), name: typeof snapshot.name === "string" && snapshot.name ? snapshot.name : "Berry", look: known?.look ?? state.flock[0].look };
};

const conversations = () => conversationsOf(state.jobs ?? []);

// The sites the user brought along live in their Browserbase Context, which only the Mac knows. Its last job says.
const contextOf = () => (state.jobs ?? []).find((job) => typeof job.context_id === "string")?.context_id ?? null;

const stepsOf = (job) => (Array.isArray(job.steps) ? job.steps : []).filter((step) => typeof step?.text === "string").slice(-200);
const going = (job) => job.status === "queued" || job.status === "running" || job.status === "waiting";
const askOf = (job) => (job.status === "waiting" && job.ask && !state.answered.has(job.ask.approval_id) ? job.ask : null);

const when = (iso) => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const today = new Date();
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === today.toDateString()) return time;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return "yesterday";
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
};

// The sentence on top names sites. The exact words always stay under it in full, because that's what is being allowed.
const asked = (name, ask) => {
  if (ask.approval_kind === "handoff") {
    const site = ask.approval_site || "a site";
    return ask.approval_need === "captcha" ? `${name} needs you to solve a check on ${site}` : `${name} needs you to sign in on ${site}`;
  }
  if (ask.approval_kind === "question") return `${name} asks: ${withSiteNames(ask.approval_text)}`;
  return `${name} wants to ${asContinuation(withSiteNames(ask.approval_text))}`;
};

const statusWords = (job) => {
  switch (job.status) {
    case "queued": return "Waiting to start";
    case "running": return stepsOf(job).at(-1)?.text ?? "Starting";
    case "waiting": return "Needs you";
    case "done": return `Done · ${when(job.updated_at)}`;
    case "failed": return job.error || "Didn’t finish";
    default: return job.error || "Stopped";
  }
};
const MOOD_FOR = { queued: "rest", running: "fetching", waiting: "asking", done: "delivered", failed: "oops", stopped: "rest" };

const NOT_SET_UP = "Nothing can run in the cloud yet. Set it up in Blueberry on your Mac, in Settings > Cloud.";
const problemWords = (error) => {
  if (error?.status === 0) return "Couldn’t reach Blueberry’s server. Check your connection.";
  if (error?.status === 401) return "You were signed out. Sign in again.";
  if (/Too many/.test(error?.message ?? "")) return "Five jobs are already going in the cloud. Try again when one is done.";
  if (/No runner/.test(error?.message ?? "")) return NOT_SET_UP;
  if (error?.status === 409) return "This conversation already has a job going. Send this once it’s done.";
  return "Something went wrong. Try again in a moment.";
};

// What just happened, said for a few seconds and then gone, so it never sits over the next question.
let sayingTimer = null;
const saying = (words) => {
  state.said = words;
  clearTimeout(sayingTimer);
  sayingTimer = setTimeout(() => {
    state.said = null;
    show();
  }, 4_000);
};

// --- Loading ---

const load = async () => {
  const asked = api.sessionVersion();
  try {
    const [jobs, flock, linked] = await Promise.all([api.jobs(), api.flock(), state.linked === null ? api.runner() : Promise.resolve(undefined)]);
    // Someone signed out or in while it was asking, so none of this is theirs.
    if (api.sessionVersion() !== asked) return;
    // A new question takes the place of whatever was said about the last one.
    const asking = jobs.flatMap((job) => (job.ask ? [job.ask.approval_id] : []));
    if (asking.some((id) => !(state.jobs ?? []).some((known) => known.ask?.approval_id === id))) state.said = null;
    state.jobs = jobs;
    state.flock = flockFromRows(flock);
    state.flockShared = flock.map((row) => row.updated_at).sort().at(-1) ?? null;
    if (linked !== undefined) state.linked = linked?.accepted === true;
    state.problem = null;
  } catch (error) {
    if (api.sessionVersion() === asked) state.problem = problemWords(error);
  }
};

let timer = null;
const poll = async () => {
  clearTimeout(timer);
  if (!api.signedIn()) return show();
  if (document.visibilityState === "visible") {
    await load();
    show();
  }
  timer = setTimeout(poll, POLL_MS);
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void poll();
});

// --- Signing in ---

const signInScreen = () => {
  const problem = el("div");
  const email = el("input", { className: "field", type: "email", autocomplete: "username", required: true, id: "email" });
  const password = el("input", { className: "field", type: "password", autocomplete: "current-password", required: true, id: "password" });
  const submit = el("button", { type: "submit", className: "button wide", textContent: "Sign in" });
  const form = el("form", {
    onsubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      problem.replaceChildren();
      try {
        await api.signIn(email.value.trim(), password.value);
        state.linked = null;
        state.push = await pushState();
        location.hash = "";
        show(true);
        void poll();
      } catch (error) {
        problem.replaceChildren(say(error.status === 400 ? "That email and password don’t match an account." : problemWords(error), "small warning"));
        submit.disabled = false;
      }
    },
  },
  el("label", { htmlFor: "email" }, "Email", email),
  el("label", { htmlFor: "password" }, "Password", password),
  problem,
  submit);
  return [el("div", { className: "signin" },
    el("section", { className: "card" },
      el("div", { className: "perched" }, bird(state.flock[0], "rest")),
      el("h1", { textContent: "Your flock, from your phone" }),
      el("p", { className: "muted lead", textContent: "See what your birds are doing in the cloud, answer when they ask, and give them a job while your computer is off." }),
      api.configured() ? form : say("This site isn’t connected to Blueberry’s server yet.", "small warning gap"),
      el("p", { className: "small foot", textContent: "The same account as Blueberry’s Settings. You stay signed in on this phone until you sign out." })))];
};

// --- The list ---

// One row per conversation: what it was started with, or what it's asking now, and how its newest job is going.
const conversationRow = ({ id, jobs, latest }) => {
  const mascot = mascotOf(latest);
  const ask = askOf(latest);
  return el("li", {},
    el("a", { className: "row", href: `#chat/${id}` },
      bird(mascot, ask ? "asking" : MOOD_FOR[latest.status] ?? "rest", "s24"),
      el("div", { className: "body" },
        el("p", { className: ask ? "ask" : "prompt", textContent: ask ? asked(mascot.name, ask) : jobs[0].prompt }),
        el("p", { className: `meta ${latest.status === "failed" ? "warning" : ""}`, textContent: ask ? `${mascot.name} · ${when(ask.approval_asked_at)}` : `${mascot.name} · ${statusWords(latest)}` })),
      el("span", { className: "chev" }, icon("next"))));
};

const NOTIFY_WORDS = {
  "add-to-home": "To get notifications, add this page to your Home Screen, then open it from there.",
  blocked: "Notifications are blocked for this site in your browser’s settings.",
  on: "Notifications are on. They only ever say that Berry needs you or has finished.",
  off: "Get a notification when Berry needs you or has finished. It says nothing more.",
  unavailable: "This browser can’t show notifications from this page.",
};
const notifications = () => {
  const words = NOTIFY_WORDS[state.push];
  if (!words) return null;
  const toggle = state.push === "on" || state.push === "off"
    ? button(state.push === "on" ? "Turn off" : "Turn on", {
        kind: "outline",
        onClick: async () => {
          try {
            if (state.push === "on") await turnOff();
            else if (!(await turnOn())) state.problem = "Notifications weren’t turned on.";
          } catch {
            state.problem = "Notifications couldn’t be turned on here.";
          }
          state.push = await pushState();
          show(true);
        },
      })
    : null;
  return el("div", { className: "lockline" }, el("p", { textContent: words }), toggle);
};

const signOut = async () => {
  await turnOff().catch(() => {});
  await api.signOut();
  Object.assign(state, { jobs: null, flock: flockFromRows([]), flockShared: null, linked: null, problem: null, said: null, push: await pushState() });
  state.taken.clear();
  state.answered.clear();
  location.hash = "";
  show(true);
};

const listScreen = () => {
  const all = conversations();
  const waiting = all.filter(({ latest }) => askOf(latest));
  const rest = all.filter(({ latest }) => !askOf(latest));
  const sender = state.flock[0];
  const ready = state.linked === true;
  return [
    top(el("span", { className: "title", textContent: "Blueberry" }),
      state.linked === null ? null : el("span", { className: "status" }, el("span", { className: `status-dot ${ready ? "" : "off"}`, ariaHidden: "true" }), ready ? "Ready" : "Not set up"),
      el("a", { className: "button quiet icon-only", href: "#settings", ariaLabel: "Settings" }, icon("settings"))),
    card(
      el("div", { className: "composer-wrap" },
        el("div", { className: "perched" }, bird(sender, "rest")),
        el("a", { className: "composer", href: "#start", ariaLabel: "Give a bird a job" },
          el("span", { className: "placeholder", textContent: "Give Berry a job" }),
          el("span", { className: "send off" }, icon("up")))),
      state.linked === false ? say(NOT_SET_UP, "small warning gap") : null,
      state.problem ? say(state.problem, "small warning gap") : null,
      state.said ? el("p", { className: "small gap", role: "status", textContent: state.said }) : null,
      waiting.length ? el("h2", { textContent: "Needs you" }) : null,
      waiting.length ? el("ul", { className: "rows" }, ...waiting.map(conversationRow)) : null,
      el("h2", { textContent: "In the cloud" }),
      state.jobs === null
        ? say("Loading…")
        : rest.length
          ? el("ul", { className: "rows" }, ...rest.map(conversationRow))
          : say(all.length ? "Nothing else right now." : "Nothing in the cloud yet. Give Berry a job and it keeps going with your computer off.")),
  ];
};

// --- Settings ---

const APPEARANCES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];

const settingsScreen = () => [
  top(link("Jobs", "#", "quiet"), el("span", { className: "title", textContent: "Settings" })),
  card(
    el("section", { className: "setting", ariaLabelledby: "appearance" },
      el("h2", { id: "appearance", textContent: "Appearance" }),
      el("div", { className: "segmented", role: "radiogroup", ariaLabelledby: "appearance" },
        ...APPEARANCES.map(([choice, words]) =>
          el("button", {
            type: "button",
            role: "radio",
            ariaChecked: String(appearance() === choice),
            textContent: words,
            onclick: () => {
              setAppearance(choice);
              show(true);
            },
          })))),
    el("section", { className: "setting", ariaLabelledby: "notifications" },
      el("h2", { id: "notifications", textContent: "Notifications" }),
      notifications()),
    el("section", { className: "setting", ariaLabelledby: "account" },
      el("h2", { id: "account", textContent: "Account" }),
      el("div", { className: "lockline" },
        el("p", { textContent: `Signed in as ${api.signedIn()?.email ?? ""}` }),
        button("Sign out", { kind: "outline", onClick: signOut }))),
    state.problem ? say(state.problem, "small warning gap") : null),
];

// --- A job ---

const decide = async (ask, allow, answer, said) => {
  state.answered.add(ask.approval_id);
  try {
    const written = await api.rpc("decide_cloud_approval", { p_approval: ask.approval_id, p_allow: allow, p_answer: answer });
    saying(written ? said : "That was already answered.");
  } catch (error) {
    state.answered.delete(ask.approval_id);
    state.problem = problemWords(error);
  }
  await load();
  show(true);
};

const says = (mascot, ask) => {
  const sentence = el("h3", { textContent: asked(mascot.name, ask) });
  const { name } = mascot;
  if (ask.approval_kind === "approval") {
    return el("section", { className: "says", ariaLabel: "Approval needed" },
      bird(mascot, "asking", "s28"),
      el("div", { className: "body" }, sentence,
        el("p", { className: "exactly", textContent: ask.approval_text }),
        el("div", { className: "actions" },
          button("Allow", { onClick: () => decide(ask, true, null, `Allowed. ${name} carries on.`) }),
          button("Don’t allow", { kind: "outline", onClick: () => decide(ask, false, null, `Not allowed. ${name} carries on without it.`) }))));
  }
  if (ask.approval_kind === "question") {
    const problem = el("div");
    const answer = el("input", { className: "field", type: "text", autocomplete: "off", ariaLabel: "Your answer", maxLength: 2000 });
    return el("section", { className: "says", ariaLabel: "Question" },
      bird(mascot, "asking", "s28"),
      el("div", { className: "body" }, sentence,
        el("form", {
          className: "answer",
          onsubmit: (event) => {
            event.preventDefault();
            const words = answer.value.trim();
            if (!words) return;
            // A code only ever goes into the page itself, so nothing shaped like one is sent from here.
            if (plausibleCode(words)) {
              answer.value = "";
              return problem.replaceChildren(say("That looks like a code, so it wasn’t sent. Codes only go into the page itself, never through Blueberry.", "small warning"));
            }
            void decide(ask, true, words, `Answered. ${name} carries on.`);
          },
        }, answer, problem,
        el("div", { className: "actions" },
          el("button", { type: "submit", className: "button", textContent: "Answer" }),
          button("Skip", { kind: "outline", onClick: () => decide(ask, false, null, `Skipped. ${name} carries on.`) })))));
  }
  const yours = state.taken.has(ask.approval_id);
  return el("section", { className: "says", ariaLabel: "Handed to you" },
    bird(mascot, "asking", "s28"),
    el("div", { className: "body" }, sentence,
      el("p", { className: "note", textContent: yours ? "Do it in the page below, then press I’m done." : "Take over the page below to do it there." }),
      el("div", { className: "actions" },
        yours
          ? button("I’m done", { onClick: () => decide(ask, true, null, `${name} has the page back.`) })
          : button("Take over", { onClick: () => { state.taken.add(ask.approval_id); show(true); } }),
        button("Not now", { kind: "outline", onClick: () => decide(ask, false, null, `Not now. ${name} goes on without it.`) }))));
};

const steps = (job) =>
  el("ol", { className: "steps", ariaLabel: "Steps" },
    ...stepsOf(job).map((step, index) =>
      el("li", {},
        step.done ? footprint(index) : el("span", { className: "dot", ariaHidden: "true" }),
        el("span", { className: step.done ? "" : "now shimmer", textContent: step.text }),
        step.done ? null : el("span", { className: "sr-only", textContent: " (in progress)" }))));

// Only ever Browserbase's own page, as the database and the app also check.
const isLiveView = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "browserbase.com" || hostname.endsWith(".browserbase.com"));
  } catch {
    return false;
  }
};

// One box and frame per address, kept in place between looks, so a poll never reloads the page the user is working in.
// Moving an iframe in the page reloads it, so `show` draws everything around this box rather than the box itself.
let live = null;
const liveBox = (url, yours) => {
  if (live?.dataset.url !== url) {
    const frame = el("iframe", { title: "Live view of the page in the cloud", sandbox: "allow-same-origin allow-scripts allow-forms", referrerPolicy: "no-referrer" });
    frame.src = url;
    live = el("div", { className: "live", dataUrl: url }, frame);
  }
  const frame = live.firstChild;
  frame.inert = !yours;
  frame.tabIndex = yours ? 0 : -1;
  frame.classList.toggle("locked", !yours);
  live.classList.toggle("yours", yours);
  return live;
};

const liveView = (job, mascot, ask) => {
  const yours = !!ask && ask.approval_kind === "handoff" && state.taken.has(ask.approval_id);
  const url = typeof job.live_view_url === "string" && isLiveView(job.live_view_url) ? job.live_view_url : null;
  if (url) liveBox(url, yours);
  return [
    el("p", { className: "runner-head" }, icon("cloud"), el("b", { textContent: "In the cloud" })),
    url
      ? el("div", { className: "live-slot" })
      : el("div", { className: "live" }, el("p", { className: "live-empty", textContent: job.status === "queued" ? "It starts as soon as the cloud takes it." : "No live view yet." })),
    yours
      ? el("div", { className: "lockline" }, icon("unlocked"), el("p", { textContent: "It’s yours. Type any code into the page itself: it goes straight to the site, never through Blueberry." }))
      : el("div", { className: "lockline" }, icon("lock"), el("p", { textContent: `Locked while ${mascot.name} works, so a tap can’t land in the middle of a step. If it needs you there, it asks.` })),
  ];
};

// The box under a conversation once its newest job is over. What's sent goes as the same bird, with the conversation so
// far as its history: the earlier job's own history, then its prompt and reply.
const followUp = (conversation, mascot) => {
  const { id, latest } = conversation;
  const problem = el("div");
  const box = el("textarea", { ariaLabel: "Follow up", rows: 2, maxLength: 8000, placeholder: `Ask ${mascot.name} to go on`, value: state.drafts.get(id) ?? "" });
  box.oninput = () => state.drafts.set(id, box.value);
  const send = el("button", { type: "submit", className: "send", ariaLabel: "Send" }, icon("up"));
  return el("form", {
    className: "follow",
    onsubmit: async (event) => {
      event.preventDefault();
      const prompt = box.value.trim();
      if (!prompt) return box.focus();
      problem.replaceChildren();
      // Only as a bird that's still in the flock, with its limits as they are now.
      const snapshot = latest.mascot ?? {};
      const sender = snapshot.id === BERRY_ID ? state.flock[0] : state.flock.find((bird) => bird.id === snapshot.id);
      if (!sender) return problem.replaceChildren(say(`${mascot.name} isn’t in your flock any more, so this can’t go on.`, "small warning"));
      send.disabled = true;
      try {
        const last = await api.jobWithHistory(latest.id);
        if (!last) throw new api.ApiError(404);
        await api.rpc("start_cloud_job", { p_prompt: prompt, p_history: followUpHistory(last), p_mascot: snapshotOf(sender), p_action_approval: "risky", p_context_id: contextOf(), p_conversation: id });
        state.drafts.delete(id);
        await load();
        show(true);
      } catch (error) {
        problem.replaceChildren(say(problemWords(error), "small warning"));
        send.disabled = false;
      }
    },
  }, el("div", { className: "composer" }, box, send), problem);
};

// What one job in a conversation asked and how it went. Only the newest can be asking, and only it says what just happened.
const exchange = (job, newest) => {
  const mascot = mascotOf(job);
  const ask = newest ? askOf(job) : null;
  return [
    el("p", { className: "bubble", textContent: job.prompt }),
    el("p", { className: "who" }, ask ? null : bird(mascot, MOOD_FOR[job.status] ?? "rest", "s28"), el("b", { textContent: mascot.name }), el("span", { className: "muted", textContent: `Sent ${when(job.created_at)}` })),
    newest && state.problem ? say(state.problem, "small warning gap") : null,
    newest && state.said ? el("p", { className: "small gap", role: "status", textContent: state.said }) : null,
    ask ? says(mascot, ask) : null,
    steps(job),
    job.reply ? el("p", { className: "reply", textContent: job.reply }) : null,
    job.status === "failed" || job.status === "stopped" ? say(statusWords(job), job.status === "failed" ? "small warning gap" : "small gap") : null,
  ];
};

const chatScreen = (conversation) => {
  if (!conversation) return [top(link("Jobs", "#", "quiet")), card(say(state.jobs === null ? "Loading…" : "This conversation isn’t on your account any more."))];
  const job = conversation.latest;
  const mascot = mascotOf(job);
  const ask = askOf(job);
  const stop = async () => {
    try {
      await api.rpc("stop_cloud_job", { p_job: job.id });
      saying(`Stopping ${mascot.name}.`);
    } catch (error) {
      state.problem = problemWords(error);
    }
    await load();
    show(true);
  };
  return [
    top(link("Jobs", "#", "quiet"), el("span", { className: "title" }), going(job) ? button("Stop", { kind: "outline", onClick: stop }) : null),
    card(
      ...conversation.jobs.flatMap((one) => el("div", { className: "exchange" }, ...exchange(one, one === job))),
      ...(going(job) ? liveView(job, mascot, ask) : [followUp(conversation, mascot)])),
  ];
};

// --- Starting a job ---

const startScreen = () => {
  let chosen = state.flock.find((bird) => bird.id === sessionStorage.getItem("blueberry.bird")) ?? state.flock[0];
  const can = el("ul", { className: "can" });
  const box = el("textarea", { ariaLabel: "The job", rows: 4, maxLength: 8000 });
  const problem = el("div");
  const perch = el("div", { className: "perch", role: "group", ariaLabel: "Who goes" });
  const showChoice = () => {
    for (const option of perch.children) option.setAttribute("aria-pressed", String(option.dataset.id === chosen.id));
    can.replaceChildren(...permissionsInWords(chosen).map(({ text }) => el("li", { textContent: text })));
    box.placeholder = `What should ${chosen.name} do?`;
  };
  perch.append(...state.flock.map((mascot) =>
    el("button", { type: "button", dataId: mascot.id, onclick: () => { chosen = mascot; sessionStorage.setItem("blueberry.bird", mascot.id); showChoice(); } },
      bird(mascot, "rest"),
      el("span", { className: "name", textContent: mascot.name }))));
  showChoice();
  const send = el("button", {
    type: "button",
    className: "button wide",
    textContent: "Send",
    onclick: async () => {
      const prompt = box.value.trim();
      if (!prompt) return box.focus();
      send.disabled = true;
      problem.replaceChildren();
      try {
        // A new conversation, under the job's own id.
        const id = await api.rpc("start_cloud_job", { p_prompt: prompt, p_history: [], p_mascot: snapshotOf(chosen), p_action_approval: "risky", p_context_id: contextOf() });
        await load();
        location.hash = UUID.test(String(id)) ? `#chat/${id}` : "";
      } catch (error) {
        problem.replaceChildren(say(problemWords(error), "small warning"));
        send.disabled = false;
      }
    },
  });
  const shared = state.flock.length > 1
    ? `Your flock as your Mac last shared it${state.flockShared ? `, ${when(state.flockShared)}` : ""}.`
    : "Only Berry is here. Your other birds show once Blueberry on your Mac is signed in and set up to keep going in the cloud.";
  setTimeout(() => box.focus(), 0);
  return [
    top(link("Cancel", "#", "quiet")),
    el("main", { className: "card start" },
      el("div", { className: "composer" }, box),
      el("h2", { textContent: "Who goes" }),
      perch,
      can,
      el("p", { className: "small foot", textContent: `${shared} It works in the cloud, and asks you here before anything risky.` }),
      problem,
      el("div", { className: "send-bar" }, send)),
  ];
};

// --- Choosing the screen ---

// Drawn again only when what it shows has changed, so a poll never takes away focus, typing or a live view's page.
let shown = "";
const show = (force = false) => {
  const route = location.hash.replace(/^#/, "");
  const chatId = /^chat\/(.+)$/.exec(route)?.[1];
  const conversation = chatId ? conversations().find((candidate) => candidate.id === chatId) : null;
  const screen = !api.signedIn() ? "signin" : route === "start" ? "start" : route === "settings" ? "settings" : chatId ? "chat" : "list";
  // Signing in and starting a job are drawn once, so what's typed there stays.
  if (!force && (screen === "start" || screen === "signin") && shown.startsWith(`["${screen}"`)) return;
  const signature = JSON.stringify([screen, screen === "chat" ? conversation : screen === "list" ? state.jobs : null, state.linked, state.problem, state.said, state.push, appearance(), [...state.taken], [...state.answered]]);
  if (!force && signature === shown) return;
  // An answer or a follow-up being typed isn't drawn over by a poll.
  if (!force && screen === "chat" && document.activeElement?.closest(".answer, .follow")) return;
  shown = signature;
  const draw = { signin: signInScreen, list: listScreen, start: startScreen, settings: settingsScreen, chat: () => chatScreen(conversation) }[screen];
  const nodes = draw();
  const app = document.getElementById("app");
  const slot = nodes.find((node) => node.matches("main"))?.querySelector(".live-slot");
  const oldCard = app.querySelector("main");
  if (slot && live && live.parentNode === oldCard) {
    // The live view stays where it is, and everything else is drawn again around it.
    const kids = [...slot.parentNode.childNodes];
    for (const child of [...oldCard.childNodes]) if (child !== live) child.remove();
    let before = true;
    for (const kid of kids) {
      if (kid === slot) before = false;
      else if (before) oldCard.insertBefore(kid, live);
      else oldCard.append(kid);
    }
    app.querySelector("header").replaceWith(nodes[0]);
    return;
  }
  if (slot) slot.replaceWith(live);
  else live = null;
  app.replaceChildren(...nodes);
};

window.addEventListener("hashchange", () => {
  state.said = null;
  state.problem = null;
  show(true);
  scrollTo(0, 0);
});

void register();
void pushState().then((push) => {
  state.push = push;
  show(true);
});
show(true);
void poll();
