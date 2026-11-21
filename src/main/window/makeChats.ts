import { InternalTab } from "../tabs/InternalTab";
import { WorkViews } from "./WorkViews";
import type { WindowParts } from "./WindowParts";

// The working view beside the main chat, which draws this window's tabs. The chats themselves are the app's.
export const createWorkViews = (w: WindowParts): WorkViews => {
  const workViews = new WorkViews({
    chrome: () => w.chromeView.view.webContents,
    work: (chatId) => w.app.chats.work(chatId),
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
