import { app, session, shell } from "electron";
import { join } from "path";
import { SettingsStore } from "../settings/SettingsStore";
import { BookmarkStore } from "../library/BookmarkStore";
import { ChatStore } from "../chats/ChatStore";
import { RoutineStore } from "../routines/RoutineStore";
import { MascotStore } from "../mascots/MascotStore";
import { addStarters } from "../mascots/starters";
import { Downloads } from "../library/Downloads";
import { SitePermissions } from "../settings/SitePermissions";
import { installSessionHandlers } from "../settings/sessionHandlers";
import { HistoryStore } from "../library/HistoryStore";
import { SessionStore } from "../tabs/Session";
import type { AiKey } from "../settings/AiKey";
import { openStore, type StoreProblem } from "../library/database";
import { appAiKey } from "./makeAccount";

// Every file the app keeps in the user data folder has one store, opened once, whatever windows come and go.
export interface AppStores {
  settingsStore: SettingsStore;
  chatStore: ChatStore;
  // Pinned sites and bookmarks, both.
  bookmarkStore: BookmarkStore;
  mascotStore: MascotStore;
  history: HistoryStore;
  sessionStore: SessionStore;
  routineStore: RoutineStore;
  downloads: Downloads;
  sitePermissions: SitePermissions;
  aiKey: AiKey;
}

// What to tell the user about a database that couldn't be used, said once the window is open.
export type StoreNotice = (what: string, isAre: "is" | "are") => (problem: StoreProblem) => void;

export const openAppStores = (folder: string, notice: StoreNotice): AppStores => {
  const settingsStore = new SettingsStore(join(folder, "settings.json"));
  const mascotStore = new MascotStore(join(folder, "mascots.json"));
  try {
    addStarters(mascotStore, settingsStore);
  } catch (error) {
    // Tried again on the next launch, since it was never marked done.
    console.error("Failed to add the starter mascots:", error);
  }
  const downloads = new Downloads(join(folder, "downloads.json"), {
    settings: () => settingsStore.get(),
    systemFolder: () => app.getPath("downloads"),
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path),
  });
  const sitePermissions = new SitePermissions(join(folder, "site-permissions.json"));
  installSessionHandlers(session.defaultSession, sitePermissions, downloads);
  return {
    settingsStore,
    chatStore: openStore(join(folder, "chats.db"), (file) => new ChatStore(file), notice("Your saved chats", "are")),
    bookmarkStore: new BookmarkStore(folder),
    mascotStore,
    history: openStore(join(folder, "history.db"), (file) => new HistoryStore(file), notice("Your browsing history", "is")),
    sessionStore: new SessionStore(join(folder, "session.json")),
    routineStore: openStore(
      join(folder, "routines.db"),
      (file, recovered) => new RoutineStore(file, recovered),
      notice("Your routines", "are"),
    ),
    downloads,
    sitePermissions,
    aiKey: appAiKey(folder),
  };
};
