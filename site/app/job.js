import { followUpHistory, mascotSnapshot } from "../shared.js";
import * as api from "./api.js";
import { decide, openAsk } from "./ask.js";
import { bird, copyButton, el, grow, icon, patch, pips, replyText, stepPips, stopSquare } from "./dom.js";
import { nowStep } from "./home.js";
import { liveSlot } from "./live.js";
import { startJob } from "./start.js";
import { askOf, conversation, contextOf, finished, going, handoffWords, hooks, lasted, liveOf, mascotOf, moodOf, problemWords, saying, senderOf, sitesOf, state, stepsOf, waiting } from "./state.js";

// A job, on a sheet as a chat is: who and how it's going on top, the live page first while it goes, the conversation,
// and at the bottom either who's working with Stop, or the box to go on.

const LATEST_STEPS = 8;
// Whose earlier steps are showing while it goes.
const allSteps = new Set();

const back = (label = "Back to home", href = "#") => el("a", { className: "round", href, ariaLabel: label, dataKey: "back" }, icon("back"));

const topLine = (job) => {
  if (going(job)) return el("p", { className: "top-sub" }, icon("cloud"), el("span", { textContent: "In the cloud" }));
  if (job.status === "done") return el("p", { className: "top-sub", textContent: `Done ${finished(job.updated_at)}` });
  if (job.status === "failed") return el("p", { className: "top-sub bad", textContent: job.error || "It didn’t finish" });
  return el("p", { className: "top-sub", textContent: "Stopped" });
};

const step = (one, live = null) =>
  el("li", { className: `step ${live ? "now" : ""}` },
    el("span", { className: `mk ${live?.ask ? "ask" : ""}` }, pips(live ? live.pattern : stepPips(one).done)),
    el("span", { className: "st", textContent: live ? live.words : one.text }),
    live ? el("span", { className: "sr-only", textContent: " (now)" }) : null);

// While it goes: its latest steps as a trail, the live one last.
const trail = (job, conversationId) => {
  const steps = stepsOf(job);
  const now = nowStep(job);
  // The step it's on is the live line, which says what it's waiting for if it is.
  const live = steps.at(-1) && !steps.at(-1).done ? steps.at(-1) : null;
  const done = live ? steps.slice(0, -1) : steps;
  const open = allSteps.has(job.id);
  const shown = open ? done : done.slice(-LATEST_STEPS);
  const hidden = done.length - shown.length;
  return [
    hidden > 0
      ? el("button", { type: "button", className: "fold", dataKey: `more-${job.id}`, onclick: () => { allSteps.add(job.id); hooks.show(); } },
          pips("done"), el("span", { textContent: `${hidden} earlier step${hidden === 1 ? "" : "s"}` }), icon("down"))
      : null,
    el("ol", { className: "steps", ariaLabel: "Steps" }, ...shown.map((one) => step(one)), step(null, now)),
    // Waiting for an answer: the ask, as its card, opens the sheet again if it was put away.
    job.status === "waiting" && askOf(job)
      ? (() => {
          const entry = waiting().find((one) => one.conversation === conversationId);
          if (!entry) return null;
          const taken = entry.ask.approval_kind === "handoff" && state.taken.has(entry.ask.approval_id);
          return el("button", {
            type: "button",
            className: "askcard in-job",
            dataKey: "answer",
            onclick: () => {
              if (taken) location.hash = `#job/${conversationId}/yours`;
              else openAsk(entry);
            },
          },
          el("span", { className: "w" }, el("span", { className: "askcard-title", textContent: entry.ask.approval_kind === "handoff" ? handoffWords(entry.mascot.name, entry.ask) : entry.ask.approval_kind === "question" ? `${entry.mascot.name} has a question` : `${entry.mascot.name} wants your OK` })),
          el("span", { className: "btn sm fill", ariaHidden: "true", textContent: taken ? "Go to the page" : "Answer" }));
        })()
      : null,
  ];
};

const siteChip = (site) => {
  const tile = `t${([...site].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8) + 1}`;
  return el("a", { className: "site", href: `https://${site}/`, target: "_blank", rel: "noopener noreferrer" },
    el("span", { className: `fv ${tile}`, ariaHidden: "true", textContent: site.charAt(0).toUpperCase() }),
    el("span", { textContent: site }));
};

const runAgain = (job, problem) =>
  el("button", {
    type: "button",
    className: "ghost",
    onclick: async (event) => {
      const button = event.currentTarget;
      const mascot = senderOf(job);
      if (!mascot) {
        problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: `${mascotOf(job).name} isn’t in your mascots any more, so this can’t run again.` }));
        return;
      }
      button.disabled = true;
      try {
        await startJob(job.prompt, mascot);
      } catch (error) {
        problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
        button.disabled = false;
      }
    },
  }, icon("again"), el("span", { textContent: "Run again" }));

// A finished job: its steps folded into one line, the reply, the sites it used, Copy and Run again.
const ended = (job) => {
  const steps = stepsOf(job);
  const open = state.unfolded.has(job.id);
  const mascot = mascotOf(job);
  const problem = el("div", { className: "problem-slot" });
  const reply = typeof job.reply === "string" ? job.reply : "";
  const sites = sitesOf(job);
  const how = job.status === "failed"
    ? el("p", { className: "how bad", textContent: job.error || "It didn’t finish." })
    : job.status === "stopped"
      ? el("p", { className: "how", textContent: `You stopped this after ${steps.length} step${steps.length === 1 ? "" : "s"}.` })
      : null;
  return [
    steps.length
      ? el("button", {
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
        icon(open ? "down" : "next"))
      : null,
    open ? el("ol", { className: "steps", ariaLabel: "Steps" }, ...steps.map((one) => step(one))) : null,
    el("div", { className: "reply" },
      bird(mascot, moodOf(job), 28),
      el("div", { className: "w" },
        reply ? el("p", { className: "reply-words" }, ...replyText(reply)) : null,
        how,
        sites.length ? el("div", { className: "sites" }, ...sites.map(siteChip)) : null,
        el("div", { className: "acts" }, reply ? copyButton(reply) : null, runAgain(job, problem)),
        problem)),
  ];
};

// The box under a conversation once its newest job is over. What's sent goes as the same mascot, with the conversation
// so far as its history: the newest job's own history, then its prompt and reply. The server takes it only if that job
// is still the newest, so one sent from the computer meanwhile is read in first and the history built again, once.
const followUp = (conversationId, job) => {
  const mascot = mascotOf(job);
  const problem = el("div", { className: "problem-slot" });
  if (!senderOf(job)) return [el("p", { className: "dock-note", textContent: `${mascot.name} isn’t in your mascots any more, so this can’t go on.` })];
  const box = grow(el("textarea", { className: "follow-box", rows: 1, maxLength: 8000, ariaLabel: "Follow up", placeholder: `Ask ${mascot.name} to go on`, value: state.drafts.get(conversationId) ?? "" }));
  const send = el("button", { type: "submit", className: `send ${box.value.trim() ? "" : "off"}`, ariaLabel: "Send" }, icon("up"));
  box.addEventListener("input", () => {
    state.drafts.set(conversationId, box.value);
    send.classList.toggle("off", !box.value.trim());
  });
  const form = el("form", {
    className: "shell",
    onsubmit: async (event) => {
      event.preventDefault();
      const prompt = box.value.trim();
      if (!prompt) return box.focus();
      problem.replaceChildren();
      send.disabled = true;
      // As the conversation is now, not as it was when this was drawn: a poll doesn't draw over what's typed.
      const attempt = async () => {
        const latest = conversation(conversationId)?.latest;
        if (!latest || going(latest)) throw new api.ApiError(409);
        // Only as a mascot that's still in the flock, with its limits as they are now.
        const sender = senderOf(latest);
        if (!sender) return "gone";
        const last = await api.jobWithHistory(latest.id);
        if (!last) throw new api.ApiError(404);
        await api.rpc("start_cloud_job", { p_prompt: prompt, p_history: followUpHistory(last), p_mascot: mascotSnapshot(sender), p_action_approval: "risky", p_context_id: contextOf(), p_conversation: conversationId, p_after_job: latest.id });
      };
      try {
        let gone;
        try {
          gone = await attempt();
        } catch (error) {
          if (error?.status !== 409) throw error;
          await hooks.refresh();
          gone = await attempt();
        }
        if (gone) {
          problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: `${mascot.name} isn’t in your mascots any more, so this can’t go on.` }));
          send.disabled = false;
          return;
        }
        state.drafts.delete(conversationId);
        box.value = "";
        box.blur();
        await hooks.load();
      } catch (error) {
        problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
        send.disabled = false;
      }
    },
  }, el("div", { className: "box" }, el("span", { className: "who lone" }, bird(mascot, "rest", 28, { named: false })), box, send));
  box.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && matchMedia("(pointer: fine)").matches) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  return [problem, form];
};

const working = (job) => {
  const mascot = mascotOf(job);
  const stop = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api.rpc("stop_cloud_job", { p_job: job.id });
      saying(`Stopping ${mascot.name}.`);
    } catch (error) {
      state.problem = problemWords(error);
      button.disabled = false;
    }
    await hooks.load();
  };
  const words = askOf(job) ? `${mascot.name} is waiting for you` : job.status === "queued" ? `${mascot.name} is about to start` : `${mascot.name} is working`;
  return [
    el("div", { className: "shell" },
      el("div", { className: "box work" },
        bird(mascot, moodOf(job), 28, { named: false }),
        el("div", { className: "w" },
          el("p", { className: "work-title", textContent: words }),
          el("p", { className: "work-sub" }, el("span", { className: "mono", dataSince: job.created_at, textContent: lasted(job.created_at) }), " so far")),
        el("button", { type: "button", className: "btn sm raised", dataKey: "stop", onclick: stop }, stopSquare(), "Stop"))),
  ];
};

export const mountJob = (app, id) => {
  const top = el("header", { className: "top" });
  const live = el("div", { className: "live-area" });
  const scroll = el("div", { className: "scroll", dataClip: "" });
  const talk = el("div", { className: "talk" });
  scroll.append(talk);
  const bottom = el("div", { className: "dock flat" });
  app.replaceChildren(el("main", { className: "screen job", dataLayer: "1" }, top, live, scroll, bottom));
  let first = true;
  return (force) => {
    const found = conversation(id);
    if (!found) {
      patch(top, "none", () => [back()], { force });
      patch(talk, String(state.jobs === null), () => [el("p", { className: "empty", textContent: state.jobs === null ? "Loading.." : "This job isn’t on your account any more." })], { force });
      live.replaceChildren();
      bottom.replaceChildren();
      return;
    }
    const job = found.latest;
    const mascot = mascotOf(job);
    const url = liveOf(job);
    const ask = askOf(job);
    const yours = !!ask && ask.approval_kind === "handoff" && state.taken.has(ask.approval_id);
    patch(top, JSON.stringify([mascot, moodOf(job), job.status, job.error, job.updated_at]), () => [
      back(),
      bird(mascot, moodOf(job), 32, { named: false }),
      el("div", { className: "w" }, el("h1", { className: "top-name", textContent: mascot.name }), topLine(job)),
    ], { force });
    patch(live, JSON.stringify([going(job), url, yours, mascot.name, job.status === "queued"]), () =>
      going(job) ? [liveSlot(url, "job", { name: mascot.name, conversation: id, yours, empty: "It starts as soon as the cloud takes it." })] : [], { force });
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
    const drew = patch(talk, JSON.stringify([found.jobs, [...state.unfolded], [...allSteps].includes(job.id), state.said, state.problem, state.flock.map((one) => one.id), waiting().map((one) => one.ask.approval_id), [...state.taken]]), () => [
      ...found.jobs.flatMap((one) => [
        el("p", { className: "bubble", textContent: one.prompt }),
        one === job && going(one) ? trail(one, id) : ended(one),
      ]),
      state.said ? el("p", { className: "said", role: "status", textContent: state.said }) : null,
      state.problem ? el("p", { className: "problem", role: "alert", textContent: state.problem }) : null,
    ], { force });
    patch(bottom, JSON.stringify([going(job), job.status, job.created_at, mascot, !!senderOf(job)]), () => (going(job) ? working(job) : followUp(id, job)), { force });
    if (drew && (first || atBottom)) scroll.scrollTop = scroll.scrollHeight;
    first = false;
  };
};

// The live page full screen: locked while the mascot works, or the user's to type in once they've taken it over.
export const mountFull = (app, id, taking) => {
  const top = el("header", { className: "yours-top" });
  const live = el("div", { className: "live-area full" });
  const under = el("div", { className: "hand" });
  app.replaceChildren(el("main", { className: "screen full", dataLayer: "1" }, top, live, under));
  return (force) => {
    const found = conversation(id);
    const job = found?.latest;
    const ask = job ? askOf(job) : null;
    const url = job ? liveOf(job) : null;
    const yours = taking && !!ask && ask.approval_kind === "handoff" && state.taken.has(ask.approval_id);
    // Nothing to show here any more: back to the job.
    if (!job || !going(job) || (taking && !yours) || (!taking && !url)) {
      location.replace(`#job/${id}`);
      return;
    }
    const mascot = mascotOf(job);
    patch(top, JSON.stringify([yours, ask?.approval_site, mascot.name]), () => [
      el("a", { className: "round", href: `#job/${id}`, ariaLabel: yours ? "Back to the job. The page stays yours" : "Back to the job", dataKey: "back" }, icon("close")),
      yours
        ? el("p", { className: "addr" }, icon("unlocked"), el("span", { className: "addr-site", textContent: ask.approval_site || "The page" }), el("em", { textContent: "It’s yours" }))
        : el("p", { className: "addr" }, icon("lock"), el("span", { className: "addr-site", textContent: `Locked while ${mascot.name} works` })),
    ], { force });
    patch(live, JSON.stringify([url, yours, mascot.name]), () => [liveSlot(url, "full", { name: mascot.name, conversation: id, yours, empty: "The page shows here as soon as the cloud has it." })], { force });
    patch(under, JSON.stringify([yours, ask?.approval_id, mascot.name]), () => {
      if (!yours) return [];
      const problem = el("div", { className: "problem-slot" });
      const answer = async (event, allow, said) => {
        const button = event.currentTarget;
        button.disabled = true;
        const result = await decide({ ask }, allow, null, said);
        if (typeof result === "string") {
          problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: result }));
          button.disabled = false;
          return;
        }
        saying(result.words);
        location.hash = `#job/${id}`;
        await hooks.load();
      };
      return [
        el("div", { className: "handrow" },
          bird(mascot, "asking", 40, { named: false }),
          el("div", { className: "w" },
            el("p", { className: "hand-title", textContent: handoffWords(mascot.name, ask) }),
            el("p", { className: "hand-sub", textContent: "Type it in the page above. It goes straight to the site, never through Blueberry." }))),
        problem,
        el("div", { className: "two" },
          el("button", { type: "button", className: "btn big fill wider", textContent: "I’m done", onclick: (event) => answer(event, true, `${mascot.name} has the page back.`) }),
          el("button", { type: "button", className: "btn big raised", textContent: "Not now", onclick: (event) => answer(event, false, `Not now. ${mascot.name} goes on without it.`) })),
      ];
    }, { force });
  };
};
