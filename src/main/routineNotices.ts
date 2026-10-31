import { dialog, Notification, type BaseWindow } from "electron";

const WORDS = {
  finished: { title: "finished", body: "See what it found in Routines." },
  failed: { title: "couldn’t finish", body: "See what happened in Routines." },
  "needs-approval": { title: "needs your OK", body: "It’s waiting in Routines, and nothing happens until you answer." },
};

// Silent, because Berry never makes a sound. Page text and approval wording stay out of it, since they could be
// private and notifications show on a locked screen.
export const notifyRoutine = (name: string, kind: keyof typeof WORDS, onClick: () => void): void => {
  if (!Notification.isSupported()) return;
  const { title, body } = WORDS[kind];
  const notification = new Notification({ title: `${name} ${title}`, body, silent: true });
  notification.on("click", onClick);
  notification.show();
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
