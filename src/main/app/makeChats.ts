import { join } from "path";
import { Chats } from "../chats/Chats";
import { generateTitle, hasModel, streamReply, writeWithCheapModel } from "../chats/agent";
import { MemoryStore } from "../memory/MemoryStore";
import { sendToRenderer } from "../window/ipc";
import { BERRY } from "../../shared/mascots";
import type { AppServices } from "./AppServices";

// Chats and what a mascot remembers. A chat reaches tabs only in the window that's open, and with none it has no page to
// work in, as on the runner. Replies, approvals and the runner's chats carry on whatever window comes or goes.

const NO_WINDOW = "Blueberry has no window open.";

export const createMemory = (s: AppServices): MemoryStore =>
  new MemoryStore(join(s.folder, "memory.json"), {
    onChanged: () => s.window?.library.publishLibrary(),
    enabled: () => s.settings.memoryOffers,
    hasModel,
    write: (system, data) => writeWithCheapModel(system, s.chats.withoutCodes(data)),
    isClean: (text) => s.chats.withoutCodes(text) === text,
  });

export const createChats = (s: AppServices): Chats =>
  new Chats(
    s.stores.chatStore,
    streamReply,
    generateTitle,
    {
      activeTab: () => s.window?.tabs.activeTab ?? null,
      allTabs: () => s.window?.tabs.allTabs ?? [],
      openBackgroundTab: (url) => {
        if (!s.window) throw new Error(NO_WINDOW);
        return s.window.tabs.createBackgroundTab(url);
      },
      // The window closes with its last tab, so Berry never takes that one, or the one the user is looking at.
      closeTab: (tabId) => {
        const tabs = s.window?.tabs;
        return !!tabs && tabs.tabCount > 1 && tabId !== tabs.activeId && tabs.closeTab(tabId, false);
      },
      giveToUser: (tabId) => s.window?.tabs.giveToUser(tabId),
      actionApproval: () => s.settings.actionApproval,
      assistantName: () => (s.settings.showBerry ? BERRY.name : "Assistant"),
      chatInFront: (chatId) => s.window?.panels.isChatInFront(chatId) ?? false,
    },
    {
      onChunk: (chatId, content) => {
        const w = s.window;
        if (w) sendToRenderer(w.chromeView.view.webContents, "chat:chunk", { chatId, content });
      },
      onThread: (thread) => {
        const w = s.window;
        if (!w) return;
        w.tabs.syncChatTabTitle(thread);
        sendToRenderer(w.chromeView.view.webContents, "chat:updated", thread);
        w.workViews.sync();
      },
      onListChanged: () => s.window?.library.publishLibrary(),
      onDecided: (approvalId, allow) => s.window?.phone.noteDecided(approvalId, allow),
      onWorkingTabs: (working, mascots) => {
        const w = s.window;
        // A reply stopped by the window closing ends after the window has gone.
        if (!w || w.baseWindow.isDestroyed()) return;
        const { layout } = w.panels;
        w.tabs.allTabs.forEach((tab) => {
          tab.setBerryWorking(working.has(tab));
          tab.workingMascotId = mascots.get(tab) ?? null;
          w.panels.placeTab(tab, layout);
        });
        w.tabs.notifyTabs();
        w.workViews.sync();
      },
    },
    (id) => s.stores.mascotStore.resolve(id),
    s.memory,
    s.cloud,
    s.runnerJobs,
  );
