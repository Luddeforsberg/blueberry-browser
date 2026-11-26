import * as api from "./api.js";
import { drawMascot, el, icon, patch, stopSquare } from "./dom.js";
import { followUp } from "./followUp.js";
import { ended, trail } from "./jobTalk.js";
import { liveSlot } from "./live.js";
import {
  askOf,
  conversation,
  finished,
  going,
  hooks,
  lasted,
  liveOf,
  mascotOf,
  moodOf,
  problemWords,
  saying,
  senderOf,
  state,
  waiting,
} from "./state.js";

/** @import { PhoneJob } from "../shared.js" */

// A job, on a sheet as a chat is: who and how it's going on top, the live page first while it goes, the conversation,
// and at the bottom either who's working with Stop, or the box to go on.

const back = (label = "Back to home", href = "#") => el("a", { className: "round", href, ariaLabel: label, dataKey: "back" }, icon("back"));

/** @param {PhoneJob} job */
const topLine = (job) => {
  if (going(job)) return el("p", { className: "top-sub" }, icon("cloud"), el("span", { textContent: "In the cloud" }));
  if (job.status === "done") return el("p", { className: "top-sub", textContent: `Done ${finished(job.updated_at)}` });
  if (job.status === "failed") return el("p", { className: "top-sub bad", textContent: job.error || "It didn’t finish" });
  return el("p", { className: "top-sub", textContent: "Stopped" });
};

/** @param {PhoneJob} job */
const working = (job) => {
  const mascot = mascotOf(job);
  const button = el("button", { type: "button", className: "btn sm raised", dataKey: "stop" }, stopSquare(), "Stop");
  const stop = async () => {
    button.disabled = true;
    try {
      // False when it had already ended, which the read below shows.
      if ((await api.asAccount().rpc("stop_cloud_job", { p_job: job.id })) === true) saying(`Stopping ${mascot.name}.`);
    } catch (error) {
      if (error instanceof api.AccountGone) return;
      state.problem = problemWords(error);
      button.disabled = false;
    }
    await hooks.load();
  };
  button.onclick = () => void stop();
  const words = askOf(job)
    ? `${mascot.name} is waiting for you`
    : job.status === "queued"
      ? `${mascot.name} is about to start`
      : `${mascot.name} is working`;
  return [
    el(
      "div",
      { className: "shell" },
      el(
        "div",
        { className: "box work" },
        drawMascot(mascot, moodOf(job), 28, { named: false }),
        el(
          "div",
          { className: "w" },
          el("p", { className: "work-title", textContent: words }),
          el(
            "p",
            { className: "work-sub" },
            el("span", { className: "mono", dataSince: job.created_at, textContent: lasted(job.created_at) }),
            " so far",
          ),
        ),
        button,
      ),
    ),
  ];
};

/** @param {HTMLElement} app @param {string} id */
export const mountJob = (app, id) => {
  const top = el("header", { className: "top" });
  const live = el("div", { className: "live-area" });
  const scroll = el("div", { className: "scroll", dataClip: "" });
  const talk = el("div", { className: "talk" });
  scroll.append(talk);
  const bottom = el("div", { className: "dock flat" });
  app.replaceChildren(el("main", { className: "screen job", dataLayer: "1" }, top, live, scroll, bottom));
  let first = true;
  return (force = false) => {
    const found = conversation(id);
    if (!found) {
      patch(top, "none", () => [back()], { force });
      patch(
        talk,
        String(state.jobs === null),
        () => [
          el("p", { className: "empty", textContent: state.jobs === null ? "Loading.." : "This job isn’t on your account any more." }),
        ],
        { force },
      );
      live.replaceChildren();
      bottom.replaceChildren();
      return;
    }
    const job = found.latest;
    const mascot = mascotOf(job);
    const url = liveOf(job);
    const ask = askOf(job);
    const yours = !!ask && ask.approval_kind === "handoff" && state.taken.has(ask.approval_id);
    patch(
      top,
      JSON.stringify([mascot, moodOf(job), job.status, job.error, job.updated_at]),
      () => [
        back(),
        drawMascot(mascot, moodOf(job), 32, { named: false }),
        el("div", { className: "w" }, el("h1", { className: "top-name", textContent: mascot.name }), topLine(job)),
      ],
      { force },
    );
    patch(
      live,
      JSON.stringify([going(job), url, yours, mascot.name, job.status === "queued"]),
      () =>
        going(job)
          ? [liveSlot(url, "job", { name: mascot.name, conversation: id, yours, empty: "It starts as soon as the cloud takes it." })]
          : [],
      { force },
    );
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
    const drew = patch(
      talk,
      JSON.stringify([
        found.jobs,
        [...state.unfolded],
        [...state.allSteps].includes(job.id),
        state.said,
        state.problem,
        state.mascots.map((one) => one.id),
        waiting().map((one) => one.ask.approval_id),
        [...state.taken],
      ]),
      () => [
        ...found.jobs.flatMap((one) => [
          el("p", { className: "bubble", textContent: one.prompt }),
          one === job && going(one) ? trail(one, id) : ended(one),
        ]),
        state.said ? el("p", { className: "said", role: "status", textContent: state.said }) : null,
        state.problem ? el("p", { className: "problem", role: "alert", textContent: state.problem }) : null,
      ],
      { force },
    );
    patch(
      bottom,
      JSON.stringify([going(job), job.status, job.created_at, mascot, !!senderOf(job)]),
      () => (going(job) ? working(job) : followUp(id, job)),
      { force },
    );
    if (drew && (first || atBottom)) scroll.scrollTop = scroll.scrollHeight;
    first = false;
  };
};
