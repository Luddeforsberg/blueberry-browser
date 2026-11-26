import { decide, hold } from "./ask.js";
import { drawMascot, el, icon, patch } from "./dom.js";
import { liveSlot } from "./live.js";
import { askOf, conversation, going, handoffWords, hooks, liveOf, mascotOf, saying, state } from "./state.js";

// The live page full screen: locked while the mascot works, or the user's to type in once they've taken it over.
/** @param {HTMLElement} app @param {string} id @param {boolean} taking */
export const mountFull = (app, id, taking) => {
  const top = el("header", { className: "yours-top" });
  const live = el("div", { className: "live-area full" });
  const under = el("div", { className: "hand" });
  app.replaceChildren(el("main", { className: "screen full", dataLayer: "1" }, top, live, under));
  return (force = false) => {
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
    patch(
      top,
      JSON.stringify([yours, ask?.approval_site, mascot.name]),
      () => [
        el(
          "a",
          {
            className: "round",
            href: `#job/${id}`,
            ariaLabel: yours ? "Back to the job. The page stays yours" : "Back to the job",
            dataKey: "back",
          },
          icon("close"),
        ),
        yours
          ? el(
              "p",
              { className: "addr" },
              icon("unlocked"),
              el("span", { className: "addr-site", textContent: ask.approval_site || "The page" }),
              el("em", { textContent: "It’s yours" }),
            )
          : el(
              "p",
              { className: "addr" },
              icon("lock"),
              el("span", { className: "addr-site", textContent: `Locked while ${mascot.name} works` }),
            ),
      ],
      { force },
    );
    patch(
      live,
      JSON.stringify([url, yours, mascot.name]),
      () => [
        liveSlot(url, "full", { name: mascot.name, conversation: id, yours, empty: "The page shows here as soon as the cloud has it." }),
      ],
      { force },
    );
    patch(
      under,
      JSON.stringify([yours, ask?.approval_id, mascot.name]),
      () => {
        if (!yours) return [];
        const problem = el("div", { className: "problem-slot" });
        const done = el("button", { type: "button", className: "btn big fill wider", textContent: "I’m done" });
        const notNow = el("button", { type: "button", className: "btn big raised", textContent: "Not now" });
        const row = el("div", { className: "two" }, done, notNow);
        /** @param {boolean} allow @param {string} said */
        const answer = async (allow, said) => {
          hold(row, true);
          const result = await decide({ ask }, allow, null, said);
          if (result === null || typeof result === "string") {
            if (result) problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: result }));
            hold(row, false);
            return;
          }
          saying(result.words);
          location.hash = `#job/${id}`;
          await hooks.load();
        };
        done.onclick = () => void answer(true, `${mascot.name} has the page back.`);
        notNow.onclick = () => void answer(false, `Not now. ${mascot.name} goes on without it.`);
        return [
          el(
            "div",
            { className: "handrow" },
            drawMascot(mascot, "asking", 40, { named: false }),
            el(
              "div",
              { className: "w" },
              el("p", { className: "hand-title", textContent: handoffWords(mascot.name, ask) }),
              el("p", {
                className: "hand-sub",
                textContent: "Type it in the page above. It goes straight to the site, never through Blueberry.",
              }),
            ),
          ),
          problem,
          row,
        ];
      },
      { force },
    );
  };
};
