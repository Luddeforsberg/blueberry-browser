import { dialog, Notification, type BaseWindow } from "electron";
import { HANDOFF_WORDS } from "./browserTools";
import type { ChatApproval } from "../shared/library";

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

export const confirmDeleteRoutine = async (window: BaseWindow, name: string): Promise<boolean> => {
  const { response } = await dialog.showMessageBox(window, {
    type: "warning",
    message: `Delete “${name}”?`,
    detail: "This routine and its run history will be permanently removed from this computer. If it’s running, it stops.",
    buttons: ["Delete", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
};

export const confirmDeleteMascot = async (window: BaseWindow, name: string, routines: number): Promise<boolean> => {
  const paused = routines === 0 ? "" : ` ${routines === 1 ? "The routine it runs pauses" : `The ${routines} routines it runs pause`}, and stay${routines === 1 ? "s" : ""} limited to what it could do.`;
  const { response } = await dialog.showMessageBox(window, {
    type: "warning",
    message: `Delete “${name}”?`,
    detail: `It leaves your flock. Chats it had keep it, with the same limits.${paused}`,
    buttons: ["Delete", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
};
