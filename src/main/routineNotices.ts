import { Notification } from "electron";
import { HANDOFF_WORDS } from "./browserTools";
import type { AskCard } from "../shared/ipc";
import type { ChatApproval, MascotLook } from "../shared/library";

const WORDS = {
  finished: { title: "finished", body: "See what it found in Routines." },
  failed: { title: "couldn’t finish", body: "See what happened in Routines." },
};

// Silent, because Berry never makes a sound. Page text and approval wording stay out of it, since they could be
// private and notifications show on a locked screen.
const notify = (title: string, body: string, onClick: () => void): void => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: true });
  notification.on("click", onClick);
  notification.show();
};

export const notifyRoutine = (name: string, kind: keyof typeof WORDS, onClick: () => void): void => {
  const { title, body } = WORDS[kind];
  notify(`${name} ${title}`, body, onClick);
};

// Never the question, the site or what's being typed, only that something is waiting and what kind of thing it is.
export const notifyNeedsYou = (name: string, { question, handoff }: ChatApproval, onClick: () => void): void => {
  const body = handoff
    ? `To ${HANDOFF_WORDS[handoff.need]}. It’s waiting in Needs you.`
    : question
      ? "It has a question waiting in Needs you."
      : "It’s waiting in Needs you, and nothing happens until you answer.";
  notify(`${name} needs you`, body, onClick);
};

// What Asking first says (DESIGN.md section 8) before deleting a routine, forgetting what a mascot remembers, or deleting
// a mascot, which shows its face.
type AskWords = Omit<AskCard, "id">;

export const deleteRoutineWords = (name: string): AskWords => ({
  question: `Delete “${name}”?`,
  detail: "This routine and its run history will be permanently removed from this computer. If it’s running, it stops.",
  action: "Delete",
  mascot: null,
});

export const clearMemoryWords = (name: string, count: number): AskWords => ({
  question: `Forget everything ${name} remembers?`,
  detail: `${count === 1 ? "The one thing it remembers goes" : `All ${count} things it remembers go`}, and it can’t be undone. Other birds aren’t affected, because they never had it.`,
  action: "Forget everything",
  mascot: null,
});

export const deleteMascotWords = (mascot: { name: string; look: MascotLook }, routines: number, published: boolean, hidden: boolean): AskWords => {
  const paused = routines === 0 ? "" : ` ${routines === 1 ? "The routine it runs pauses" : `The ${routines} routines it runs pause`}, and stay${routines === 1 ? "s" : ""} limited to what it could do.`;
  return {
    question: `Delete “${mascot.name}”?`,
    detail: `It leaves your mascots, and what it remembers is forgotten. Chats it had keep it, with the same limits.${paused}${published ? " It stays in the Gallery until you unpublish it, in Settings under Account." : ""}`,
    action: "Delete",
    mascot: { name: mascot.name, look: mascot.look, hidden },
  };
};
