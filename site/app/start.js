import { isUuid, mascotSnapshot, permissionsInWords } from "../shared.js";
import * as api from "./api.js";
import { bird, el, grow, icon } from "./dom.js";
import { closeSheet, openSheet } from "./sheet.js";
import { choose, chosen, contextOf, hooks, NOT_SET_UP, problemWords, state } from "./state.js";

// Starting a job has no page of its own: the box rises as a sheet over home, with who goes and what that mascot may
// do, in the app's own words. Putting it away keeps what was typed.

// A new conversation, under the job's own id, as `mascot`, which is in the flock as it is now.
export const startJob = async (prompt, mascot) => {
  const id = await api.rpc("start_cloud_job", {
    p_prompt: prompt,
    p_history: [],
    p_mascot: mascotSnapshot(mascot),
    p_action_approval: "risky",
    p_context_id: contextOf(),
  });
  await hooks.load();
  location.hash = isUuid(String(id)) ? `#job/${id}` : "";
};

// What a mascot may do, in words, each line with what it means: a lock for a limit, a tick for what it can do, and a
// bell for asking first, which every job from here does.
const mayDo = (mascot) =>
  el(
    "ul",
    { className: "can" },
    ...permissionsInWords(mascot).map(({ text, open }) => el("li", {}, icon(open ? "tick" : "lock"), el("span", { textContent: text }))),
    el("li", {}, icon("bell"), el("span", { textContent: "Asks you first before anything risky" })),
  );

// The flock as faces to choose from, the chosen one ringed.
const faces = (size, onChoose, current = chosen()) =>
  el(
    "div",
    { className: "flock", role: "radiogroup", ariaLabel: "Who goes" },
    ...state.flock.map((mascot) =>
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
        el("span", { className: "ring" }, bird(mascot, "rest", size, { named: false })),
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
  const form = el(
    "form",
    {
      className: "shell",
      onsubmit: async (event) => {
        event.preventDefault();
        const prompt = box.value.trim();
        if (!prompt) return box.focus();
        if (state.linked === false) {
          problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: NOT_SET_UP }));
          return;
        }
        send.disabled = true;
        problem.replaceChildren();
        try {
          await startJob(prompt, chosen());
          state.drafts.delete("");
          closeSheet({ instant: true });
        } catch (error) {
          problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
          send.disabled = false;
        }
      },
    },
    el("div", { className: "box tall" }, box, send),
  );
  box.addEventListener("keydown", (event) => {
    // Enter sends on a computer's keyboard; a phone's return key makes a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && matchMedia("(pointer: fine)").matches) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  body.append(
    ...[
      el("h2", { className: "lab", textContent: "Who goes" }),
      who,
      can,
      state.flock.length === 1
        ? el("p", { className: "note", textContent: "Your other mascots show here once Blueberry on your computer shares them." })
        : null,
      state.linked === false ? el("p", { className: "problem", textContent: NOT_SET_UP }) : null,
      form,
      problem,
    ].filter(Boolean),
  );
  show();
  box.focus({ preventScroll: true });
};
