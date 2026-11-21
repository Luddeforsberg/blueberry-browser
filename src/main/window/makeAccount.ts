import { Phone } from "../phone/Phone";
import { sendToRenderer } from "./ipc";
import type { WindowParts } from "./WindowParts";

// The user's own things, as this window shows them: the AI key and answering from the phone. The key, the account and
// the bot itself are the app's.

// Only the service and the last four characters go to the chrome. The key itself goes to the model and nowhere else.
// The window stops listening once it has closed.
export const listenToAiKey = (w: WindowParts): void => {
  const { aiKey } = w.stores;
  const stop = aiKey.onChange(() => {
    sendToRenderer(w.chromeView.view.webContents, "ai-key:updated", aiKey.state);
    if (aiKey.inUse) w.settingsChanges.firstJobDone("key");
  });
  w.baseWindow.once("closed", stop);
};

export const createPhone = (w: WindowParts): Phone =>
  new Phone(w.app.telegram, {
    // The runner's are answered in this window only, so the phone isn't offered them.
    waiting: () => w.library.needsYou.filter(({ id }) => !w.app.runnerJobs.has(id)),
    nameOf: ({ mascotId }) => w.library.mascotName(mascotId),
    away: () => w.library.userIsAway,
    decide: (id, approvalId, allow, answer) => w.app.chats.decide(id, approvalId, allow, answer, { fromPhone: true }),
    enterCode: (id, approvalId, code) => w.app.chats.enterCode(id, approvalId, code),
    onAnswered: (approvalId, said) => sendToRenderer(w.chromeView.view.webContents, "phone:answered", { approvalId, said }),
  });
