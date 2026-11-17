import { BERRY_ID } from "../shared.js";
import * as api from "./api.js";
import { openAsk } from "./ask.js";
import { bird, el, icon, patch, pips, stepPips } from "./dom.js";
import { openSettings } from "./settings.js";
import { openStart, startJob } from "./start.js";
import { ago, askOf, asked, choose, chosen, conversations, going, greeting, hooks, lasted, moodOf, mascotOf, NOT_SET_UP, problemWords, SET_UP, senderOf, state, stepsOf, waiting } from "./state.js";

// Home, on the ground: the greeting and what's going on, the flock, what needs you, what's working and what's done,
// and the box at the bottom. With nothing going on it's the flock standing together over the greeting.

const sep = () => el("span", { className: "sep", ariaHidden: "true" });

// How each mascot is now: asking if a job of its is waiting, working if one is going, at rest otherwise.
const moodOfMascot = (mascot) => {
  let mood = "rest";
  for (const { latest } of conversations()) {
    const id = latest.mascot?.id;
    if (id !== mascot.id && !(mascot.id === BERRY_ID && id === BERRY_ID)) continue;
    const now = moodOf(latest);
    if (now === "asking") return "asking";
    if (now === "fetching") mood = "fetching";
  }
  return mood;
};

const initial = () => {
  const email = api.signedIn()?.email ?? "";
  return el("button", { type: "button", className: "me", ariaLabel: "Settings", dataKey: "me", onclick: openSettings }, el("span", { textContent: (email.charAt(0) || "?").toUpperCase() }));
};

// The line under the greeting: what needs you and what's working, or why nothing can run.
const statusLine = (asks, working) => {
  if (state.problem) return el("p", { className: "status problem", role: "alert", textContent: state.problem });
  if (state.linked === false) return el("p", { className: "status", textContent: NOT_SET_UP });
  const parts = [];
  if (asks) parts.push(el("span", { className: "askc", textContent: `${asks} need${asks === 1 ? "s" : ""} you` }));
  if (working) parts.push(el("span", { textContent: `${working} working` }));
  return parts.length ? el("p", { className: "status" }, ...parts.flatMap((part, at) => (at ? [sep(), part] : [part]))) : null;
};

const pick = (mascot) => {
  choose(mascot);
  hooks.show();
};

// The flock in one row, each in the mood it's in. Tapping one chooses who the box talks to.
const flockRow = () => {
  const current = chosen();
  return el("div", { className: "flock home-flock", role: "radiogroup", ariaLabel: "Who the box talks to" },
    ...state.flock.map((mascot) =>
      el("button", { type: "button", className: "face", role: "radio", ariaChecked: String(mascot.id === current.id), dataKey: `face-${mascot.id}`, onclick: () => pick(mascot) },
        el("span", { className: "ring" }, bird(mascot, moodOfMascot(mascot), 48)),
        el("span", { className: "face-name", ariaHidden: "true", textContent: mascot.name }))));
};

// The flock standing together, the chosen one in front and up to two either side of it.
const stage = () => {
  const current = chosen();
  const others = state.flock.filter((mascot) => mascot.id !== current.id).slice(0, 4);
  const left = others.filter((_, at) => at % 2 === 1).reverse();
  const right = others.filter((_, at) => at % 2 === 0);
  const side = (mascot, at, edge) =>
    el("button", { type: "button", className: `stand side ${edge ? "edge" : ""}`, ariaLabel: `Choose ${mascot.name}`, dataKey: `stand-${mascot.id}`, onclick: () => pick(mascot) }, bird(mascot, "rest", 52, { named: false }));
  return el("div", { className: "stage" },
    ...left.map((mascot, at) => side(mascot, at, at === 0 && left.length === 2)),
    el("span", { className: "stand front" }, bird(current, "rest", 96)),
    ...right.map((mascot, at) => side(mascot, at, at === 1)));
};

// One ask, as a card: anywhere on it opens the ask.
const askCard = (entry) =>
  el("button", { type: "button", className: "askcard", dataKey: `ask-${entry.ask.approval_id}`, onclick: () => openAsk(entry) },
    bird(entry.mascot, "asking", 40, { named: false }),
    el("span", { className: "w" },
      el("span", { className: "askcard-title", textContent: asked(entry.mascot.name, entry.ask) }),
      el("span", { className: "row-sub mono", textContent: ago(entry.ask.approval_asked_at) })),
    el("span", { className: "btn sm fill", ariaHidden: "true", textContent: "Answer" }));

// What a going job is doing now: its live step with its pips, or what it's waiting for.
export const nowStep = (job) => {
  const last = stepsOf(job).at(-1);
  if (job.status === "queued") return { pattern: "think", words: "Waiting to start.." };
  if (askOf(job)) return { pattern: "waiting", words: "Waiting for you..", ask: true };
  if (last && !last.done) return { pattern: stepPips(last).live, words: last.text };
  return { pattern: "think", words: "Thinking.." };
};

const workingRow = ({ id, latest }) => {
  const now = nowStep(latest);
  return el("a", { className: "row", href: `#job/${id}`, dataKey: `row-${id}` },
    bird(mascotOf(latest), moodOf(latest), 40),
    el("span", { className: "w" },
      el("span", { className: "row-title", textContent: latest.prompt }),
      el("span", { className: "row-sub now" }, pips(now.pattern, now.ask ? "ask" : ""), el("span", { className: "row-step", textContent: now.words }))),
    el("span", { className: "t", dataSince: latest.created_at, textContent: lasted(latest.created_at) }));
};

const earlierRow = ({ id, latest }) => {
  const failed = latest.status === "failed";
  const how = latest.status === "done" ? "Done" : failed ? latest.error || "Didn’t finish" : "Stopped";
  return el("a", { className: "row dim", href: `#job/${id}`, dataKey: `row-${id}` },
    bird(mascotOf(latest), moodOf(latest), 40),
    el("span", { className: "w" },
      el("span", { className: "row-title", textContent: latest.prompt }),
      el("span", { className: `row-sub ${failed ? "bad" : ""}` }, el("span", { className: "row-how", textContent: how }), sep(), el("span", { className: "mono", textContent: ago(latest.updated_at) }))));
};

const label = (words, count, ask = false) => el("h2", { className: `lab ${ask ? "ask" : ""}` }, words, count ? el("span", { textContent: String(count) }) : null);

// Jobs sent before, newest first, as chips that put their words back in the box, as their mascot. Never sent from here.
const CHIPS = 6;
const chips = () => {
  const seen = new Set();
  const list = [];
  for (const job of state.jobs ?? []) {
    const words = typeof job.prompt === "string" ? job.prompt.trim() : "";
    const mascot = senderOf(job);
    if (!words || !mascot || seen.has(words)) continue;
    seen.add(words);
    list.push({ words, mascot });
    if (list.length === CHIPS) break;
  }
  return list;
};

const send = async (button, problem) => {
  const prompt = (state.drafts.get("") ?? "").trim();
  if (!prompt || state.linked === false) return openStart();
  button.disabled = true;
  try {
    await startJob(prompt, chosen());
    state.drafts.delete("");
  } catch (error) {
    problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
    button.disabled = false;
  }
};

const dock = () => {
  const mascot = chosen();
  const draft = (state.drafts.get("") ?? "").trim();
  const ready = !!draft && state.linked !== false;
  const problem = el("div", { className: "problem-slot" });
  const sendButton = el("button", { type: "button", className: `send ${ready ? "" : "off"}`, ariaLabel: "Send", dataKey: "send", onclick: (event) => send(event.currentTarget, problem) }, icon("up"));
  return [
    el("div", { className: "chips", role: "list", ariaLabel: "Jobs you sent before" },
      ...chips().map(({ words, mascot: who }) =>
        el("span", { role: "listitem" },
          el("button", {
            type: "button",
            className: "chip",
            ariaLabel: `Put “${words}” in the box, for ${who.name}`,
            dataKey: `chip-${words}`,
            onclick: () => {
              state.drafts.set("", words);
              choose(who);
              hooks.show();
            },
          }, icon("again"), el("span", { className: "chip-words", textContent: words }))))),
    problem,
    el("div", { className: "shell" },
      el("div", { className: "box" },
        el("button", { type: "button", className: "who", ariaLabel: `Who goes: ${mascot.name}. Choose`, dataKey: "who", onclick: openStart }, bird(mascot, "rest", 28, { named: false }), icon("down")),
        el("button", { type: "button", className: `box-words ${draft ? "typed" : ""}`, dataKey: "box", onclick: openStart, textContent: draft || `Give ${mascot.name} a job` }),
        sendButton)),
    state.linked === false ? el("p", { className: "dock-note", textContent: SET_UP }) : null,
  ];
};

export const mountHome = (app) => {
  const top = el("div", { className: "home-top" });
  const bottom = el("div", { className: "dock" });
  app.replaceChildren(el("main", { className: "screen home", dataLayer: "1" }, el("div", { className: "dots", ariaHidden: "true" }), top, bottom));
  return (force) => {
    const all = conversations();
    const asks = waiting();
    const working = all.filter(({ id, latest }) => going(latest) && !asks.some((entry) => entry.conversation === id));
    const earlier = all.filter(({ latest }) => !going(latest));
    const quiet = !asks.length && !working.length;
    const mascot = chosen();
    const signature = JSON.stringify([
      greeting(), quiet, state.problem, state.linked, mascot.id, state.flock, state.jobs === null,
      asks.map(({ ask, mascot: who }) => [ask, who.name]),
      working.map(({ id, latest }) => [id, latest.prompt, latest.status, stepsOf(latest).at(-1), latest.mascot?.id]),
      earlier.map(({ id, latest }) => [id, latest.prompt, latest.status, latest.error, latest.updated_at, latest.mascot?.id]),
      // Times like "12m" move on.
      Math.floor(Date.now() / 60_000),
    ]);
    patch(top, signature, () => {
      if (quiet) {
        return [
          el("header", { className: "hello bare" }, initial()),
          el("div", { className: `quiet ${earlier.length ? "" : "alone"}` },
            stage(),
            el("h1", { textContent: greeting() }),
            state.problem || state.linked === false
              ? statusLine(0, 0)
              : el("p", { className: "status", textContent: state.jobs === null ? "" : `Nothing’s running. Give ${mascot.name} a job and it keeps going with your computer off.` })),
          earlier.length ? [label("Earlier"), el("div", { className: "rows" }, ...earlier.map(earlierRow))] : null,
        ];
      }
      return [
        el("header", { className: "hello" }, el("div", { className: "w" }, el("h1", { textContent: greeting() }), statusLine(asks.length, working.length)), initial()),
        flockRow(),
        asks.length ? [label("Needs you", asks.length, true), el("div", { className: "cards" }, ...asks.map(askCard))] : null,
        working.length ? [label("Working", working.length), el("div", { className: "rows" }, ...working.map(workingRow))] : null,
        earlier.length ? [label("Earlier"), el("div", { className: "rows" }, ...earlier.map(earlierRow))] : null,
      ];
    }, { force });
    patch(bottom, JSON.stringify([mascot.id, state.drafts.get("") ?? "", state.linked, chips().map(({ words, mascot: who }) => [words, who.id, who.name])]), dock, { force });
  };
};
