import { isUuid, leftAfterSend, mascotSnapshot, permissionsInWords } from "../shared.js";
import * as api from "./api.js";
import { drawMascot, el, grow, icon, isDrawn, sendsOnEnter, submitsOnce } from "./dom.js";
import { closeSheet, openSheet, sheetKind } from "./sheet.js";
import { choose, chosen, contextOf, hooks, NOT_SET_UP, problemWords, state } from "./state.js";

/** @import { MascotProfile } from "../shared.js" */

// Starting a job has no page of its own: the box rises as a sheet over home, with who goes and what that mascot may
// do, in the app's own words. Putting it away keeps what was typed.

// A new conversation, under the job's own id, as `mascot`, as the phone has it now. `written` is the box as it was sent,
// so whatever was typed on after it stays for the next job.
/** @param {string} written @param {MascotProfile} mascot */
export const startJob = async (written, mascot) => {
  const as = api.asAccount();
  const id = await as.rpc("start_cloud_job", {
    p_prompt: written.trim(),
    p_history: [],
    p_mascot: mascotSnapshot(mascot),
    p_action_approval: "risky",
    p_context_id: contextOf(),
  });
  const left = leftAfterSend(state.drafts.get("") ?? "", written);
  if (left) state.drafts.set("", left);
  else state.drafts.delete("");
  await hooks.load();
  if (!as.still()) throw new api.AccountGone();
  location.hash = isUuid(id) ? `#job/${id}` : "";
};

// What a mascot may do, in words, each line with what it means: a lock for a limit, a tick for what it can do, and a
// bell for asking first, which every job from here does.
/** @param {MascotProfile} mascot */
const mayDo = (mascot) =>
  el(
    "ul",
    { className: "can" },
    ...permissionsInWords(mascot).map(({ text, open }) => el("li", {}, icon(open ? "tick" : "lock"), el("span", { textContent: text }))),
    el("li", {}, icon("bell"), el("span", { textContent: "Asks you first before anything risky" })),
  );

// The mascots as faces to choose from, the chosen one ringed.
/** @param {number} size @param {(mascot: MascotProfile) => void} onChoose */
const faces = (size, onChoose, current = chosen()) =>
  el(
    "div",
    { className: "mascots", role: "radiogroup", ariaLabel: "Who goes" },
    ...state.mascots.map((mascot) =>
      el(
        "button",
        {
          type: "button",
          className: "face",
          role: "radio",
          ariaChecked: String(mascot.id === current.id),
          dataKey: `face-${mascot.id}`,
          onclick: () => onChoose(mascot),
        },
        el("span", { className: "ring" }, drawMascot(mascot, "rest", size, { named: false })),
        el("span", { className: "face-name", textContent: mascot.name }),
      ),
    ),
  );

export const openStart = () => {
  const { body } = openSheet({ kind: "start", label: "Give a mascot a job", onClose: () => hooks.show() });
  const problem = el("div", { className: "problem-slot" });
  const box = grow(
    el("textarea", { className: "start-box", rows: 3, maxLength: 8000, ariaLabel: "The job", value: state.drafts.get("") ?? "" }),
  );
  const send = el("button", { type: "submit", className: "send", ariaLabel: "Send" }, icon("up"));
  const who = el("div");
  const can = el("div");
  const show = () => {
    const mascot = chosen();
    who.replaceChildren(
      faces(
        52,
        (picked) => {
          choose(picked);
          show();
          hooks.show();
        },
        mascot,
      ),
    );
    can.replaceChildren(mayDo(mascot));
    box.placeholder = `What should ${mascot.name} do?`;
    send.classList.toggle("off", !box.value.trim() || state.linked === false);
  };
  box.addEventListener("input", () => {
    state.drafts.set("", box.value);
    send.classList.toggle("off", !box.value.trim() || state.linked === false);
  });
  const form = submitsOnce(el("form", { className: "shell" }, el("div", { className: "box tall" }, box, send)), async () => {
    const written = box.value;
    if (!written.trim()) return box.focus();
    if (state.linked === false) {
      problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: NOT_SET_UP }));
      return;
    }
    send.disabled = true;
    problem.replaceChildren();
    try {
      await startJob(written, chosen());
      if (sheetKind() === "start") closeSheet({ instant: true });
    } catch (error) {
      if (error instanceof api.AccountGone) return;
      problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
      send.disabled = false;
    }
  });
  sendsOnEnter(box, form);
  body.append(
    ...[
      el("h2", { className: "lab", textContent: "Who goes" }),
      who,
      can,
      state.mascots.length === 1
        ? el("p", { className: "note", textContent: "Your other mascots show here once Blueberry on your computer shares them." })
        : null,
      state.linked === false ? el("p", { className: "problem", textContent: NOT_SET_UP }) : null,
      form,
      problem,
    ].filter(isDrawn),
  );
  show();
  box.focus({ preventScroll: true });
};
