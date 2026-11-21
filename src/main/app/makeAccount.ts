import { app } from "electron";
import { join } from "path";
import { Account } from "../account/Account";
import { AiKey } from "../settings/AiKey";
import { Gallery } from "../mascots/Gallery";
import { TelegramChannel } from "../phone/TelegramChannel";
import { setSavedKeyReader } from "../chats/agent";
import { sendToRenderer } from "../window/ipc";
import type { AppServices } from "./AppServices";

// The user's own things the app keeps in main: the account, the AI key, the Gallery and the phone's bot. Each tells the
// window that's open, if one is, when it changes.

export const createAccount = (s: AppServices): Account =>
  new Account(s.server, join(s.folder, "account.json"), () => {
    s.window?.broadcast("account:updated", s.account.state);
    s.runnerJobs?.accountChanged();
    s.window?.macJobs.sync();
  });

// The key itself goes to the model and nowhere else.
export const appAiKey = (folder: string): AiKey => {
  const aiKey = new AiKey(join(folder, "ai-key.json"));
  setSavedKeyReader(() => aiKey.inUse, { ownAddressOnly: app.isPackaged });
  return aiKey;
};

export const createGallery = (s: AppServices): Gallery =>
  new Gallery(s.server, s.account, s.stores.mascotStore, join(s.folder, "gallery.json"), process.env.BLUEBERRY_SITE_URL, () => {
    const w = s.window;
    w?.broadcast("library:updated", w.library.librarySnapshot);
  });

export const createTelegram = (s: AppServices): TelegramChannel =>
  new TelegramChannel(join(s.folder, "phone.json"), () => {
    const w = s.window;
    if (!w) return;
    sendToRenderer(w.chromeView.view.webContents, "phone:updated", s.telegram.state);
    w.phone.sync();
  });
