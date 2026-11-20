import { app } from "electron";
import { join } from "path";
import { InternalTab } from "../tabs/InternalTab";
import { Chats } from "../chats/Chats";
import { generateTitle, hasModel, streamReply, writeWithCheapModel } from "../chats/agent";
import { MemoryStore } from "../memory/MemoryStore";
import { WorkViews } from "./WorkViews";
import { sendToRenderer } from "./ipc";
import { BERRY } from "../../shared/mascots";
import type { WindowParts, WindowStores } from "./WindowParts";

// Chats, what a mascot remembers and the working view, wired to the window. Each is made in its turn by the window's
// constructor, and reaches the rest of the window only when it's called.

export const createMemory = (w: WindowParts): MemoryStore =>
  new MemoryStore(join(app.getPath("userData"), "memory.json"), {
    onChanged: () => w.library.publishLibrary(),
    enabled: () => w.settings.memoryOffers,
    hasModel,
    write: (system, data) => writeWithCheapModel(system, w.chats.withoutCodes(data)),
    isClean: (text) => w.chats.withoutCodes(text) === text,
  });

export const createChats = (w: WindowParts, stores: WindowStores): Chats =>
  new Chats(
    stores.chatStore,
    streamReply,
    generateTitle,
    {
      activeTab: () => w.tabs.activeTab,
      allTabs: () => w.tabs.allTabs,
      openBackgroundTab: (url) => w.tabs.createBackgroundTab(url),
      // The window closes with its last tab, so Berry never takes that one, or the one the user is looking at.
      closeTab: (tabId) => w.tabs.tabCount > 1 && tabId !== w.tabs.activeId && w.tabs.closeTab(tabId, false),
      giveToUser: (tabId) => w.tabs.giveToUser(tabId),
      actionApproval: () => w.settings.actionApproval,
      assistantName: () => (w.settings.showBerry ? BERRY.name : "Assistant"),
      chatInFront: (chatId) => w.panels.isChatInFront(chatId),
    },
    {
      onChunk: (chatId, content) => sendToRenderer(w.chromeView.view.webContents, "chat:chunk", { chatId, content }),
      onThread: (thread) => {
        w.tabs.syncChatTabTitle(thread);
        sendToRenderer(w.chromeView.view.webContents, "chat:updated", thread);
        w.workViews.sync();
      },
      onListChanged: () => w.library.publishLibrary(),
      onDecided: (approvalId, allow) => w.phone.noteDecided(approvalId, allow),
      onWorkingTabs: (working, mascots) => {
        // A reply stopped by the window closing ends after the window has gone.
        if (w.baseWindow.isDestroyed()) return;
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
    (id) => stores.mascotStore.resolve(id),
    w.memory,
    w.cloud,
    w.runnerJobs,
  );

export const createWorkViews = (w: WindowParts): WorkViews => {
  const workViews = new WorkViews({
    chrome: () => w.chromeView.view.webContents,
    work: (chatId) => w.chats.work(chatId),
    onScreen: (chatId) => {
      const entry = w.tabs.activeEntry;
      return entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId && w.windowShowing;
    },
    pageWidth: () => w.panels.layout.page.width,
  });
  const syncWork = () => w.workViews.sync();
  w.baseWindow.on("minimize", syncWork);
  w.baseWindow.on("restore", syncWork);
  w.baseWindow.on("hide", syncWork);
  w.baseWindow.on("show", syncWork);
  return workViews;
};
