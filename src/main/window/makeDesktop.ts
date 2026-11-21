import { systemPreferences } from "electron";
import { InternalTab } from "../tabs/InternalTab";
import { DesktopBerry } from "../desktop/DesktopBerry";
import { BERRY } from "../../shared/mascots";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// Jobs sent before, as chips over the desktop's prompt box.
const DESKTOP_RECENT_JOBS = 3;

// The mascot behind the edge of the screen, wired to the window. All it can do is send a chat with no page and open
// Blueberry.
export const createDesktopBerry = (w: WindowParts, stores: AppStores): DesktopBerry =>
  new DesktopBerry({
    settings: () => w.settings,
    update: (patch) => w.settingsChanges.updateSettings(patch),
    library: () => w.library.librarySnapshot,
    mascot: (id) => stores.mascotStore.resolve(id),
    nameOf: (mascotId) => w.library.mascotName(mascotId),
    inFront: () => w.baseWindow.isFocused() && w.windowShowing,
    stillMotion: () => systemPreferences.getAnimationSettings().prefersReducedMotion,
    theme: () => w.theme,
    ended: (chatId) => {
      const chat = w.app.chats.thread(chatId);
      if (!chat || w.app.chats.outcome(chatId) === "stopped") return null;
      const last = chat.messages.at(-1);
      return {
        mascotId: chat.mascotId ?? BERRY.id,
        title: chat.title,
        error: chat.error,
        text: last?.role === "assistant" ? last.content : "",
      };
    },
    chatOnScreen: (chatId) => {
      const entry = w.tabs.activeEntry;
      return w.baseWindow.isFocused() && w.windowShowing && entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId;
    },
    progress: (chatId) => {
      const chat = w.app.chats.thread(chatId);
      return { step: chat?.steps.at(-1)?.text ?? chat?.statusLine ?? null, since: chat?.startedAt ?? null };
    },
    // The user's own chats, newest first, each sent once, however many times it was asked.
    recentJobs: () =>
      [...new Map(stores.chatStore.firstMessages(DESKTOP_RECENT_JOBS * 4).map((chat) => [chat.firstMessage, chat])).values()]
        .slice(0, DESKTOP_RECENT_JOBS)
        .map(({ title, firstMessage }) => ({ label: title, prompt: firstMessage })),
    cloud: () => ({ runner: w.app.runnerJobs.available(), cloud: w.app.cloud.state.status !== "off" }),
    send: (text, mascotId, { runner, cloud }) => w.app.chats.send(null, text, { seePage: false, mascotId, runner, cloud }) !== null,
    decide: (chatId, approvalId, allow, answer) => w.app.chats.decide(chatId, approvalId, allow, answer),
    open: (target) => {
      w.bringForward();
      if (target.page === "chat") w.tabs.openPage("chat", { param: target.chatId });
      else w.tabs.openPage("routines");
    },
    seePage: (item) => {
      w.bringForward();
      const tabId = item.approval.handoff?.tabId ?? item.tabId;
      if (tabId && w.tabs.getTab(tabId)) w.tabs.switchActiveTab(tabId);
      else if (item.routineId) w.tabs.openPage("routines");
      else w.tabs.openPage("chat", { param: item.id });
    },
    showBlueberry: () => w.bringForward(),
  });
