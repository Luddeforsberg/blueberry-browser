import { plausibleCode, withSiteNames } from "../shared.js";
import * as api from "./api.js";
import { drawMascot, el, grow, submitsOnce, typing } from "./dom.js";
import { liveSlot, placeLive } from "./live.js";
import { closeSheet, openSheet, sheetBody, sheetKind } from "./sheet.js";
import { asked, handoffWords, hooks, liveOf, problemWords, state, waiting, wanted } from "./state.js";

// Being asked: a sheet that rises by itself when the page opens with an ask waiting and when one arrives, but never
// over something being typed, where it waits as its card on home. One ask at a time, the oldest first. After an answer
// it says what happened, then shows the next or goes.

const SAID_MS = 1_500;

// Which ask is up, and whether it's saying what just happened.
let up = null;

// Answers on their way, by approval id. An ask takes one answer, and until it's back the ask stays as it is.
const deciding = new Set();

// Writes an answer as the user. What to say about it, what went wrong in words, or null if this ask has an answer on
// its way or written already.
export const decide = async (entry, allow, answer, said) => {
  const { ask } = entry;
  if (deciding.has(ask.approval_id) || state.answered.has(ask.approval_id)) return null;
  deciding.add(ask.approval_id);
  try {
    const written = await api.asAccount().rpc("decide_cloud_approval", { p_approval: ask.approval_id, p_allow: allow, p_answer: answer });
    state.answered.add(ask.approval_id);
    return { words: written ? said : "That was already answered." };
  } catch (error) {
    return error instanceof api.AccountGone ? null : problemWords(error);
  } finally {
    deciding.delete(ask.approval_id);
  }
};

// The answers to one ask go off together while one is on its way, and come back if it didn't go.
export const hold = (row, on) => {
  for (const button of row.querySelectorAll("button")) button.disabled = on;
};

// What happened to the ask that's up, said in its place for a moment, then the next oldest or nothing. Only in the
// sheet showing that ask: one put away meanwhile, or another sheet, is left alone.
const say = (id, mascot, words) => {
  if (sheetKind() !== "ask" || up?.id !== id) return;
  up = { id, saying: true };
  sheetBody().replaceChildren(
    el(
      "div",
      { className: "ask-said", role: "status" },
      drawMascot(mascot, "rest", 72, { named: false }),
      el("p", { className: "ask-title", textContent: words }),
    ),
  );
  placeLive();
  setTimeout(() => {
    if (sheetKind() !== "ask" || up?.id !== id || !up.saying) return;
    const [next] = waiting();
    if (next) draw(next);
    else closeSheet();
  }, SAID_MS);
};

// After an answer: whether it went.
const answered = (entry, result, problem) => {
  if (result === null) return false;
  if (typeof result === "string") {
    problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: result }));
    return false;
  }
  say(entry.ask.approval_id, entry.mascot, result.words);
  void hooks.load();
  return true;
};

const buttons = (...children) => el("div", { className: "two" }, ...children);
// A button that answers.
const answering = (entry, problem, allow, said) => async (event) => {
  const row = event.currentTarget.closest(".two");
  hold(row, true);
  if (!answered(entry, await decide(entry, allow, null, said), problem)) hold(row, false);
};
const big = (text, kind, onClick, type = "button") =>
  el("button", { type, className: `btn big ${kind}`, textContent: text, onclick: onClick });

const approval = (entry, problem) => {
  const { job, ask, mascot } = entry;
  const url = liveOf(job);
  return [
    el("p", { className: "ask-lead", textContent: `${mascot.name} wants to` }),
    el("h2", { className: "ask-title", id: "ask-title", textContent: wanted(ask) }),
    url ? liveSlot(url, "ask", { name: mascot.name, conversation: entry.conversation }) : null,
    // Exactly what will happen, in full, never cut: this is what's being allowed.
    el("p", { className: "exact", textContent: ask.approval_text }),
    problem,
    buttons(
      big("Allow", "fill wider", answering(entry, problem, true, `Allowed. ${mascot.name} carries on.`)),
      big("Don’t allow", "raised", answering(entry, problem, false, `Not allowed. ${mascot.name} carries on without it.`)),
    ),
  ];
};

const question = (entry, problem) => {
  const { ask, mascot } = entry;
  const box = grow(
    el("textarea", {
      className: "field answer",
      rows: 1,
      maxLength: 2000,
      autocomplete: "off",
      ariaLabel: "Your answer",
      placeholder: "Your answer",
    }),
  );
  const form = el(
    "form",
    { className: "ask-form" },
    box,
    problem,
    buttons(
      big("Answer", "fill wider", undefined, "submit"),
      big("Skip", "raised", answering(entry, problem, false, `Skipped. ${mascot.name} carries on.`)),
    ),
  );
  submitsOnce(form, async () => {
    const words = box.value.trim();
    if (!words) return box.focus();
    // A code only ever goes into the page itself, so nothing shaped like one is sent from here.
    if (plausibleCode(words)) {
      box.value = "";
      problem.replaceChildren(
        el("p", {
          className: "problem",
          role: "alert",
          textContent: "That looks like a code, so it wasn’t sent. Codes only go into the page itself, never through Blueberry.",
        }),
      );
      return;
    }
    const row = form.querySelector(".two");
    hold(row, true);
    if (!answered(entry, await decide(entry, true, words, `Answered. ${mascot.name} carries on.`), problem)) hold(row, false);
  });
  return [
    el("p", { className: "ask-lead", textContent: `${mascot.name} asks` }),
    el("h2", { className: "ask-title", id: "ask-title", textContent: withSiteNames(ask.approval_text) }),
    form,
  ];
};

const handoff = (entry, problem) => {
  const { ask, mascot } = entry;
  return [
    el("h2", { className: "ask-title", id: "ask-title", textContent: handoffWords(mascot.name, ask) }),
    el("p", {
      className: "ask-note",
      textContent: `${mascot.name} has stepped back from the page. Take it over to do it there: what you type goes straight to the site, never through Blueberry.`,
    }),
    problem,
    buttons(
      big("Take over", "fill wider", () => {
        state.taken.add(ask.approval_id);
        closeSheet();
        location.hash = `#job/${entry.conversation}/yours`;
      }),
      big("Not now", "raised", answering(entry, problem, false, `Not now. ${mascot.name} goes on without it.`)),
    ),
  ];
};

const draw = (entry) => {
  const body = sheetBody();
  if (!body) return;
  const all = waiting();
  const at = all.findIndex((one) => one.ask.approval_id === entry.ask.approval_id);
  up = { id: entry.ask.approval_id, saying: false, signature: signatureOf(entry), mascot: entry.mascot };
  state.seen.add(entry.ask.approval_id);
  const problem = el("div", { className: "problem-slot" });
  const hadKeyboard = body.contains(document.activeElement);
  const kind = entry.ask.approval_kind;
  const content = kind === "question" ? question(entry, problem) : kind === "handoff" ? handoff(entry, problem) : approval(entry, problem);
  body.replaceChildren(
    ...[
      all.length > 1 ? el("p", { className: "ask-count", textContent: `${at + 1} of ${all.length}` }) : null,
      el("div", { className: "asker" }, drawMascot(entry.mascot, "asking", 72, { named: false })),
      ...content,
      // What job it's for, which opens it.
      el("a", { className: "ask-for", href: `#job/${entry.conversation}`, textContent: `For “${entry.job.prompt}”` }),
    ].filter(Boolean),
  );
  body.closest("[role=dialog]")?.setAttribute("aria-label", asked(entry.mascot.name, entry.ask));
  body.scrollTop = 0;
  if (hadKeyboard) body.closest("[role=dialog]")?.focus({ preventScroll: true });
  placeLive();
};

// What the sheet shows of an ask, so a poll draws it again only when that has changed.
const signatureOf = (entry) => JSON.stringify([entry.ask, liveOf(entry.job), entry.job.prompt, entry.mascot.name, waiting().length]);

export const openAsk = (entry) => {
  openSheet({
    kind: "ask",
    label: asked(entry.mascot.name, entry.ask),
    onClose: () => {
      // Put away without an answer: it stays under Needs you, and nothing waiting now comes up again by itself.
      for (const one of waiting()) state.seen.add(one.ask.approval_id);
      up = null;
      hooks.show();
    },
  });
  draw(entry);
};

// Whether an ask may rise by itself now: not over another sheet, not over anything being typed, and not while the
// user is on a page they've taken over.
const mayRise = () => !sheetKind() && !typing() && !/\/(yours|live)$/.test(location.hash) && document.visibilityState === "visible";

// After every draw: keep the sheet in step with what's waiting, and raise one that's new.
export const refreshAsk = () => {
  const all = waiting();
  if (sheetKind() === "ask") {
    if (!up || up.saying || deciding.has(up.id)) return;
    const still = all.find((one) => one.ask.approval_id === up.id);
    if (!still) {
      // Answered somewhere else, or the job ended. It says so before the next one comes, so the next ask's buttons
      // never arrive under a finger that was on this one's.
      say(up.id, up.mascot, "This isn’t waiting any more. It was answered somewhere else, or its job ended.");
      return;
    }
    // Never over an answer being typed.
    if (signatureOf(still) !== up.signature && !(sheetBody()?.contains(document.activeElement) && typing())) draw(still);
    return;
  }
  if (!mayRise()) return;
  const fresh = all.find((one) => !state.seen.has(one.ask.approval_id));
  if (fresh) openAsk(fresh);
};
