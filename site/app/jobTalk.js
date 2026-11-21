import { openAsk } from "./ask.js";
import { copyButton, drawMascot, el, icon, pips, replyText, stepPips } from "./dom.js";
import { nowStep } from "./home.js";
import { startJob } from "./start.js";
import { askOf, handoffWords, hooks, lasted, mascotOf, moodOf, problemWords, senderOf, sitesOf, state, waiting } from "./state.js";

/** @import { PhoneJob, PhoneStep } from "../shared.js" */
/** @import { NowStep } from "./home.js" */

// A conversation on a job's sheet: each prompt, then the trail of steps while it goes, or what it came to once it's over.

const LATEST_STEPS = 8;

/** @param {PhoneStep} one */
const step = (one) =>
  el(
    "li",
    { className: "step" },
    el("span", { className: "mk" }, pips(stepPips(one).done)),
    el("span", { className: "st", textContent: one.text }),
  );

/** The step it's on now, last in the trail. @param {NowStep} now */
const nowLine = (now) =>
  el(
    "li",
    { className: "step now" },
    el("span", { className: `mk ${now.ask ? "ask" : ""}` }, pips(now.pattern)),
    el("span", { className: "st", textContent: now.words }),
    el("span", { className: "sr-only", textContent: " (now)" }),
  );

// While it goes: its latest steps as a trail, the live one last.
/** @param {PhoneJob} job @param {string} conversationId */
export const trail = (job, conversationId) => {
  const { steps } = job;
  // The step it's on is the live line, which says what it's waiting for if it is.
  const done = steps.at(-1)?.done === false ? steps.slice(0, -1) : steps;
  const open = state.allSteps.has(job.id);
  const shown = open ? done : done.slice(-LATEST_STEPS);
  const hidden = done.length - shown.length;
  return [
    hidden > 0
      ? el(
          "button",
          {
            type: "button",
            className: "fold",
            dataKey: `more-${job.id}`,
            onclick: () => {
              state.allSteps.add(job.id);
              hooks.show();
            },
          },
          pips("done"),
          el("span", { textContent: `${hidden} earlier step${hidden === 1 ? "" : "s"}` }),
          icon("down"),
        )
      : null,
    el("ol", { className: "steps", ariaLabel: "Steps" }, ...shown.map(step), nowLine(nowStep(job))),
    // Waiting for an answer: the ask, as its card, opens the sheet again if it was put away.
    job.status === "waiting" && askOf(job)
      ? (() => {
          const entry = waiting().find((one) => one.conversation === conversationId);
          if (!entry) return null;
          const taken = entry.ask.approval_kind === "handoff" && state.taken.has(entry.ask.approval_id);
          return el(
            "button",
            {
              type: "button",
              className: "askcard in-job",
              dataKey: "answer",
              onclick: () => {
                if (taken) location.hash = `#job/${conversationId}/yours`;
                else openAsk(entry);
              },
            },
            el(
              "span",
              { className: "w" },
              el("span", {
                className: "askcard-title",
                textContent:
                  entry.ask.approval_kind === "handoff"
                    ? handoffWords(entry.mascot.name, entry.ask)
                    : entry.ask.approval_kind === "question"
                      ? `${entry.mascot.name} has a question`
                      : `${entry.mascot.name} wants your OK`,
              }),
            ),
            el("span", { className: "btn sm fill", ariaHidden: "true", textContent: taken ? "Go to the page" : "Answer" }),
          );
        })()
      : null,
  ];
};

/** @param {string} site */
const siteChip = (site) => {
  const tile = `t${([...site].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8) + 1}`;
  return el(
    "a",
    { className: "site", href: `https://${site}/`, target: "_blank", rel: "noopener noreferrer" },
    el("span", { className: `fv ${tile}`, ariaHidden: "true", textContent: site.charAt(0).toUpperCase() }),
    el("span", { textContent: site }),
  );
};

/** @param {PhoneJob} job @param {HTMLElement} problem */
const runAgain = (job, problem) => {
  const button = el("button", { type: "button", className: "ghost" }, icon("again"), el("span", { textContent: "Run again" }));
  const again = async () => {
    const mascot = senderOf(job);
    if (!mascot) {
      problem.replaceChildren(
        el("p", {
          className: "problem",
          role: "alert",
          textContent: `${mascotOf(job).name} isn’t in your mascots any more, so this can’t run again.`,
        }),
      );
      return;
    }
    button.disabled = true;
    try {
      await startJob(job.prompt, mascot);
    } catch (error) {
      problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
      button.disabled = false;
    }
  };
  button.onclick = () => void again();
  return button;
};

// A finished job: its steps folded into one line, the reply, the sites it used, Copy and Run again.
/** @param {PhoneJob} job */
export const ended = (job) => {
  const { steps, reply } = job;
  const open = state.unfolded.has(job.id);
  const mascot = mascotOf(job);
  const problem = el("div", { className: "problem-slot" });
  const sites = sitesOf(job);
  const how =
    job.status === "failed"
      ? el("p", { className: "how bad", textContent: job.error || "It didn’t finish." })
      : job.status === "stopped"
        ? el("p", { className: "how", textContent: `You stopped this after ${steps.length} step${steps.length === 1 ? "" : "s"}.` })
        : null;
  return [
    steps.length
      ? el(
          "button",
          {
            type: "button",
            className: "fold",
            ariaExpanded: String(open),
            dataKey: `fold-${job.id}`,
            onclick: () => {
              if (state.unfolded.has(job.id)) state.unfolded.delete(job.id);
              else state.unfolded.add(job.id);
              hooks.show();
            },
          },
          pips("done"),
          el("span", { textContent: `${steps.length} step${steps.length === 1 ? "" : "s"}` }),
          el("span", { className: "sep", ariaHidden: "true" }),
          el("span", { textContent: lasted(job.created_at, job.updated_at) }),
          icon(open ? "down" : "next"),
        )
      : null,
    open ? el("ol", { className: "steps", ariaLabel: "Steps" }, ...steps.map(step)) : null,
    el(
      "div",
      { className: "reply" },
      drawMascot(mascot, moodOf(job), 28),
      el(
        "div",
        { className: "w" },
        reply ? el("p", { className: "reply-words" }, ...replyText(reply)) : null,
        how,
        sites.length ? el("div", { className: "sites" }, ...sites.map(siteChip)) : null,
        el("div", { className: "acts" }, reply ? copyButton(reply) : null, runAgain(job, problem)),
        problem,
      ),
    ),
  ];
};
