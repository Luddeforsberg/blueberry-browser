import { app } from "electron";
import { join } from "path";
import { Account } from "../account/Account";
import type { GalleryServer } from "../account/galleryServer";
import { AiKey } from "../settings/AiKey";
import { Gallery } from "../mascots/Gallery";
import { TelegramChannel } from "../phone/TelegramChannel";
import { Phone } from "../phone/Phone";
import { setSavedKeyReader } from "../chats/agent";
import { sendToRenderer } from "./ipc";
import type { WindowParts, WindowStores } from "./WindowParts";

// The user's own things the window keeps in main and wires to it: the account, the AI key, the Gallery and the phone.
// Each is made in its turn by the window's constructor, and reaches the rest of the window only when it's called.

export const createAccount = (w: WindowParts, server: GalleryServer | null): Account =>
  new Account(server, join(app.getPath("userData"), "account.json"), () => {
    w.broadcast("account:updated", w.account.state);
    w.runnerJobs?.accountChanged();
    w.macJobs?.sync();
  });

export const createAiKey = (w: WindowParts): AiKey => {
  // Only the service and the last four characters go to the chrome. The key itself goes to the model and nowhere else.
  const aiKey = new AiKey(join(app.getPath("userData"), "ai-key.json"), () => {
    sendToRenderer(w.chromeView.view.webContents, "ai-key:updated", w.aiKey.state);
    if (w.aiKey.inUse) w.settingsChanges.firstJobDone("key");
  });
  setSavedKeyReader(() => w.aiKey.inUse, { ownAddressOnly: app.isPackaged });
  return aiKey;
};

export const createGallery = (w: WindowParts, server: GalleryServer | null, stores: WindowStores): Gallery =>
  new Gallery(server, w.account, stores.mascotStore, join(app.getPath("userData"), "gallery.json"), process.env.BLUEBERRY_SITE_URL, () => {
    w.broadcast("library:updated", w.library.librarySnapshot);
  });

export const createTelegram = (w: WindowParts): TelegramChannel =>
  new TelegramChannel(join(app.getPath("userData"), "phone.json"), () => {
    sendToRenderer(w.chromeView.view.webContents, "phone:updated", w.telegram.state);
    w.phone.sync();
  });

export const createPhone = (w: WindowParts): Phone =>
  new Phone(w.telegram, {
    // The runner's are answered in this window only, so the phone isn't offered them.
    waiting: () => w.library.needsYou.filter(({ id }) => !w.runnerJobs.has(id)),
    nameOf: ({ mascotId }) => w.library.mascotName(mascotId),
    away: () => w.library.userIsAway,
    decide: (id, approvalId, allow, answer) => w.chats.decide(id, approvalId, allow, answer, { fromPhone: true }),
    enterCode: (id, approvalId, code) => w.chats.enterCode(id, approvalId, code),
    onAnswered: (approvalId, said) => sendToRenderer(w.chromeView.view.webContents, "phone:answered", { approvalId, said }),
  });
