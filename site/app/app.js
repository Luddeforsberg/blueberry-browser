import "../theme.js";
import { permissionsInWords } from "../shared.js";
import { POSES } from "./poses.js";
import { DEMO } from "./demo.js";

// Blueberry on the phone: the jobs on your runner, what they're asking, and the live view of the page each is on. For
// now every screen is drawn from made-up data in demo.js, chosen with `?demo=`, so the look can be agreed before any of
// it talks to Supabase. Everything that will come from the server goes in as text only. The one piece of markup is our
// own drawing, chosen by keys checked against the poses we have.

const SVG = "http://www.w3.org/2000/svg";

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
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
  monitorOff: ["M17 17H4a2 2 0 0 1-2-2V5c0-1.5 1-2 1-2", "M22 15V5a2 2 0 0 0-2-2H9", "M8 21h8", "M12 17v4", "m2 2 20 20"],
  back: ["m15 18-6-6 6-6"],
  next: ["m9 18 6-6-6-6"],
  lock: ["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
  unlocked: ["M7 11V7a5 5 0 0 1 9.9-1", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
  up: ["m5 12 7-7 7 7", "M12 19V5"],
};
const icon = (name) => svg("svg", { viewBox: "0 0 24 24", class: "icon", "aria-hidden": "true" }, ...ICONS[name].map((d) => svg("path", { d })));

// Left foot, right foot, as in the app's step trail.
const footprint = (index) =>
  svg("svg", { viewBox: "-8 -8 16 16", class: "foot", "aria-hidden": "true", transform: `rotate(${index % 2 ? 12 : -12})` },
    svg("ellipse", { cx: 0, cy: -3.6, rx: 1.25, ry: 2.9 }),
    svg("ellipse", { cx: -3.2, cy: -1.2, rx: 1.1, ry: 2.5, transform: "rotate(-34 -3.2 -1.2)" }),
    svg("ellipse", { cx: 3.2, cy: -1.2, rx: 1.1, ry: 2.5, transform: "rotate(34 3.2 -1.2)" }),
    svg("ellipse", { cx: 0, cy: 3, rx: 1, ry: 2.1 }));

const MOOD_WORDS = { rest: "at rest", fetching: "working", thinking: "thinking", asking: "waiting for you", delivered: "finished", oops: "something went wrong", "off-duty": "asleep" };

let drawn = 0;
// A bird in one mood. Each drawing's gradient gets an id of its own, so one hidden drawing can't take the others' colour.
const bird = (mascot, mood, size) => {
  const pose = POSES[mascot.look.accessory]?.[mood] ?? POSES.none.rest;
  const holder = el("span", { className: `bird ${size === "small" ? "s24" : size === "medium" ? "s28" : ""}` });
  const own = `b${++drawn}`;
  holder.innerHTML = (size === "small" || size === "medium" ? pose.small : pose.full).replace(/«[^»]*»/g, (id) => `${own}${id.length}`);
  const drawing = holder.querySelector("svg");
  drawing.dataset.mascot = mascot.look.palette;
  drawing.setAttribute("aria-label", `${mascot.name}, ${MOOD_WORDS[mood] ?? "at rest"}`);
  return holder;
};

const button = (text, { kind = "", href, onClick } = {}) =>
  href
    ? el("a", { className: `button ${kind}`, href, textContent: text })
    : el("button", { type: "button", className: `button ${kind}`, textContent: text, onclick: onClick });

const go = (screen) => `?demo=${screen}`;

const top = (...children) => el("header", { className: "top" }, ...children);
const card = (...children) => el("main", { className: "card" }, ...children);

// How a job stands, in a few words.
const STATUS = {
  queued: () => "Waiting for the runner",
  running: (job) => job.steps.at(-1)?.text ?? "Starting",
  waiting: () => "Needs you",
  done: (job) => `Done · ${job.when}`,
  failed: (job) => job.error ?? "Didn’t finish",
  stopped: () => "Stopped",
};
const MOOD_FOR = { queued: "rest", running: "fetching", waiting: "asking", done: "delivered", failed: "oops", stopped: "rest" };

const asked = (job) => {
  const { ask } = job;
  if (ask.kind === "handoff") return ask.need === "captcha" ? `${job.mascot.name} needs you to solve a check on ${ask.site}` : `${job.mascot.name} needs you to sign in on ${ask.site}`;
  if (ask.kind === "question") return `${job.mascot.name} asks: ${ask.text}`;
  return ask.sentence;
};

// --- Signing in ---

const signIn = () => {
  const berry = DEMO.flock[0];
  return el("div", { className: "signin" },
    el("section", { className: "card" },
      el("div", { className: "perched" }, bird(berry, "rest")),
      el("h1", { textContent: "Your flock, from your phone" }),
      el("p", { className: "muted lead", textContent: "See what your birds are doing on the runner, answer when they ask, and give them a job while your computer is off." }),
      el("form", { onsubmit: (event) => { event.preventDefault(); location.search = go("list"); } },
        el("label", {}, "Email", el("input", { className: "field", type: "email", autocomplete: "username", required: true, value: "" })),
        el("label", {}, "Password", el("input", { className: "field", type: "password", autocomplete: "current-password", required: true })),
        el("button", { type: "submit", className: "button wide", textContent: "Sign in" })),
      el("p", { className: "small foot", textContent: "The same account as Blueberry’s Settings. You stay signed in on this phone until you sign out." })));
};

// --- The list ---

const jobRow = (job) => {
  const waiting = job.status === "waiting";
  return el("li", {},
    el("a", { className: "row", href: go(job.screen) },
      bird(job.mascot, MOOD_FOR[job.status], "small"),
      el("div", { className: "body" },
        el("p", { className: waiting ? "ask" : "prompt", textContent: waiting ? asked(job) : job.prompt }),
        el("p", { className: `meta ${job.status === "failed" ? "warning" : ""}` },
          el("span", { textContent: waiting ? `${job.mascot.name} · ${job.title} · ${job.when}` : `${job.mascot.name} · ${STATUS[job.status](job)}` }))),
      el("span", { className: "chev" }, icon("next"))));
};

const list = () => {
  const waiting = DEMO.jobs.filter((job) => job.status === "waiting");
  const rest = DEMO.jobs.filter((job) => job.status !== "waiting");
  const sender = DEMO.flock[0];
  return [
    top(el("span", { className: "title", textContent: "Blueberry" }), el("span", { className: "runner" }, icon("monitorOff"), "Runner ready")),
    card(
      el("div", { className: "composer-wrap" },
        el("div", { className: "perched" }, bird(sender, "rest")),
        el("a", { className: "composer", href: go("start"), ariaLabel: "Give a bird a job" },
          el("span", { className: "placeholder", textContent: "Give Berry a job" }),
          el("span", { className: "send off" }, icon("up")))),
      waiting.length ? el("h2", { textContent: "Needs you" }) : null,
      waiting.length ? el("ul", { className: "rows" }, ...waiting.map(jobRow)) : null,
      el("h2", { textContent: "On the runner" }),
      el("ul", { className: "rows" }, ...rest.map(jobRow)),
      el("div", { className: "actions" },
        el("span", { className: "small", textContent: `Signed in as ${DEMO.email}` }),
        button("Sign out", { kind: "quiet small", href: go("signin") }))),
  ];
};

// --- A job ---

const steps = (job) =>
  el("ol", { className: "steps", ariaLabel: "Steps" },
    ...job.steps.map((step, index) =>
      el("li", {},
        step.done ? footprint(index) : el("span", { className: "dot", ariaHidden: "true" }),
        el("span", { className: step.done ? "" : "now shimmer", textContent: step.text }),
        step.done ? null : el("span", { className: "sr-only", textContent: " (in progress)" }))));

// The live view, locked unless the page has been handed to the user and they've taken it over.
const liveView = (job, { yours }) => {
  const frame = el("div", { className: `live ${yours ? "yours" : ""}` }, DEMO.pages[job.page]());
  if (!yours) frame.append(el("div", { className: "lock", ariaHidden: "true" }));
  return [
    el("p", { className: "runner-head" }, icon("monitorOff"), el("b", { textContent: "On the runner" }), el("span", { className: "muted", textContent: job.live }) ),
    frame,
    yours
      ? el("div", { className: "lockline" }, icon("unlocked"), el("p", { textContent: "It’s yours. Type any code into the page itself: it goes straight to the site, never through Blueberry." }))
      : el("div", { className: "lockline" }, icon("lock"), el("p", { textContent: `Locked while ${job.mascot.name} works, so a tap can’t land in the middle of a step.` }), button("Take over", { kind: "outline" })),
  ];
};

const says = (job, { yours }) => {
  const { ask } = job;
  const sentence = el("h3", { textContent: asked(job) });
  if (ask.kind === "approval") {
    return el("section", { className: "says", ariaLabel: "Approval needed" },
      bird(job.mascot, "asking", "medium"),
      el("div", { className: "body" }, sentence,
        el("p", { className: "exactly", textContent: ask.exactly }),
        el("div", { className: "actions" }, button("Allow"), button("Don’t allow", { kind: "outline" }))));
  }
  return el("section", { className: "says", ariaLabel: "Handed to you" },
    bird(job.mascot, "asking", "medium"),
    el("div", { className: "body" }, sentence,
      el("p", { className: "note", textContent: yours ? "Do it in the page below, then press I’m done." : "Take over the page below to do it there." }),
      el("div", { className: "actions" }, yours ? button("I’m done") : button("Take over"), button("Not now", { kind: "outline" }))));
};

const jobScreen = (job, { yours = false } = {}) => {
  const going = job.status === "running" || job.status === "waiting";
  return [
    top(button("Jobs", { kind: "quiet", href: go("list") }), el("span", { className: "title" }), going ? button("Stop", { kind: "outline" }) : null),
    card(
      el("p", { className: "bubble", textContent: job.prompt }),
      el("p", { className: "who" }, job.status === "waiting" ? null : bird(job.mascot, MOOD_FOR[job.status], "medium"), el("b", { textContent: job.mascot.name }), el("span", { className: "muted", textContent: `Sent ${job.when}` })),
      job.status === "waiting" ? says(job, { yours }) : null,
      steps(job),
      job.reply ? el("p", { className: "reply", textContent: job.reply }) : null,
      ...(going ? liveView(job, { yours }) : [])),
  ];
};

// --- Starting a job ---

const start = () => {
  let chosen = DEMO.flock[1];
  const can = el("ul", { className: "can" });
  const box = el("textarea", { ariaLabel: "The job", rows: 4 });
  const showChoice = () => {
    for (const option of perch.children) option.setAttribute("aria-pressed", String(option.dataset.id === chosen.id));
    can.replaceChildren(...permissionsInWords(chosen).map(({ text, open }) => el("li", { className: open ? "open" : "", textContent: text })));
    box.placeholder = `What should ${chosen.name} do?`;
  };
  const perch = el("div", { className: "perch", role: "group", ariaLabel: "Who goes" },
    ...DEMO.flock.map((mascot) =>
      el("button", { type: "button", dataId: mascot.id, onclick: () => { chosen = mascot; showChoice(); } },
        bird(mascot, "rest"),
        el("span", { className: "name", textContent: mascot.name }))));
  showChoice();
  return [
    top(button("Cancel", { kind: "quiet", href: go("list") })),
    card(
      el("div", { className: "start" },
        el("h1", { textContent: "Who goes?" }),
        perch,
        can,
        el("div", { className: "composer" }, box),
        el("p", { className: "small foot", textContent: `Your flock as your Mac last shared it, ${DEMO.flockShared}. It runs on your runner, and asks you here before anything risky.` }),
        el("button", { type: "button", className: "button wide", textContent: "Send to the runner", onclick: () => { location.search = go("list"); } }))),
  ];
};

// --- Choosing the screen ---

const SCREENS = {
  signin: () => [signIn()],
  list,
  job: () => jobScreen(DEMO.jobs.find((job) => job.screen === "job")),
  approval: () => jobScreen(DEMO.jobs.find((job) => job.screen === "approval")),
  handoff: () => jobScreen(DEMO.jobs.find((job) => job.screen === "handoff"), { yours: true }),
  start,
};

const demoStyles = el("link", { rel: "stylesheet", href: "./demo.css" });
document.head.append(demoStyles);
const screen = new URLSearchParams(location.search).get("demo");
document.getElementById("app").replaceChildren(...(SCREENS[screen] ?? SCREENS.signin)());
