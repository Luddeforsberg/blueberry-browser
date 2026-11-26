import { followUpHistory, leftAfterSend, mascotSnapshot } from "../shared.js";
import * as api from "./api.js";
import { drawMascot, el, grow, icon, sendsOnEnter, submitsOnce } from "./dom.js";
import { contextOf, conversation, going, hooks, mascotOf, problemWords, senderOf, state } from "./state.js";

/** @import { PhoneJob } from "../shared.js" */

// The box under a conversation once its newest job is over. What's sent goes as the same mascot, with the conversation
// so far as its history: the newest job's own history, then its prompt and reply. The server takes it only if that job
// is still the newest, so one sent from the computer meanwhile is read in first and the history built again, once.
/** @param {string} conversationId @param {PhoneJob} job */
export const followUp = (conversationId, job) => {
  const mascot = mascotOf(job);
  const problem = el("div", { className: "problem-slot" });
  if (!senderOf(job))
    return [el("p", { className: "dock-note", textContent: `${mascot.name} isn’t in your mascots any more, so this can’t go on.` })];
  const box = grow(
    el("textarea", {
      className: "follow-box",
      rows: 1,
      maxLength: 8000,
      ariaLabel: "Follow up",
      placeholder: `Ask ${mascot.name} to go on`,
      value: state.drafts.get(conversationId) ?? "",
    }),
  );
  const send = el("button", { type: "submit", className: `send ${box.value.trim() ? "" : "off"}`, ariaLabel: "Send" }, icon("up"));
  box.addEventListener("input", () => {
    state.drafts.set(conversationId, box.value);
    send.classList.toggle("off", !box.value.trim());
  });
  const form = el(
    "form",
    { className: "shell" },
    el("div", { className: "box" }, el("span", { className: "who lone" }, drawMascot(mascot, "rest", 28, { named: false })), box, send),
  );
  submitsOnce(form, async () => {
    const written = box.value;
    const prompt = written.trim();
    if (!prompt) return box.focus();
    const as = api.asAccount();
    problem.replaceChildren();
    send.disabled = true;
    // As the conversation is now, not as it was when this was drawn: a poll doesn't draw over what's typed. Says
    // "gone" when the mascot it would go as is.
    /** @returns {Promise<"gone" | null>} */
    const attempt = async () => {
      const latest = conversation(conversationId)?.latest;
      if (!latest || going(latest)) throw new api.ApiError(409);
      // Only as a mascot the phone still has, with its limits as they are now.
      const sender = senderOf(latest);
      if (!sender) return "gone";
      const last = await as.jobWithHistory(latest.id);
      if (!last) throw new api.ApiError(404);
      await as.rpc("start_cloud_job", {
        p_prompt: prompt,
        p_history: followUpHistory(last),
        p_mascot: mascotSnapshot(sender),
        p_action_approval: "risky",
        p_context_id: contextOf(),
        p_conversation: conversationId,
        p_after_job: latest.id,
      });
      return null;
    };
    try {
      let gone;
      try {
        gone = await attempt();
      } catch (error) {
        if (!(error instanceof api.ApiError && error.status === 409)) throw error;
        await hooks.refresh();
        gone = await attempt();
      }
      if (gone) {
        problem.replaceChildren(
          el("p", {
            className: "problem",
            role: "alert",
            textContent: `${mascot.name} isn’t in your mascots any more, so this can’t go on.`,
          }),
        );
        send.disabled = false;
        return;
      }
      box.value = leftAfterSend(box.value, written);
      if (box.value) state.drafts.set(conversationId, box.value);
      else {
        state.drafts.delete(conversationId);
        box.blur();
      }
      await hooks.load();
    } catch (error) {
      if (error instanceof api.AccountGone) return;
      problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: problemWords(error) }));
      send.disabled = false;
    }
  });
  sendsOnEnter(box, form);
  return [problem, form];
};
