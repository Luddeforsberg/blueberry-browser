import { InternalTab } from "../tabs/InternalTab";
import type { CloudTabsHooks } from "../cloud/CloudTabs";
import { confirmCloudLogin } from "../cloud/cloudLoginAccess";
import { MacJobs } from "../remoteJobs/MacJobs";
import { BERRY } from "../../shared/mascots";
import type { WindowParts } from "./WindowParts";

// The window's part of the work that runs away from it. The cloud browser and the runner's jobs are the app's.

// What the app's cloud shows and asks in this window: its tabs, its chrome and its confirm. Attached while it's open.
export const cloudHooks = (w: WindowParts): CloudTabsHooks => ({
  chrome: () => w.chromeView.view.webContents,
  openTab: (title) => w.tabs.openCloudTab(title),
  updateTab: (id, title) => {
    const tab = w.tabs.find(id);
    if (!(tab instanceof InternalTab) || tab.title === title) return;
    tab.title = title;
    w.tabs.notifyTabs();
  },
  closeTab: (id) => {
    if (w.tabs.has(id) && w.tabs.tabCount > 1) w.tabs.closeTab(id, false);
    else w.app.cloud.tabClosed(id);
  },
  takenOver: (id) => w.app.chats.releaseTab(id),
  showTab: (id) => w.tabs.switchActiveTab(id),
  confirmLogin: (site) => confirmCloudLogin(w.baseWindow, site),
  confirmForget: () =>
    w.menus.ask({
      question: "Forget the cloud key?",
      detail:
        "What Blueberry couldn’t read goes too. Sessions started with an old key can’t be ended from here, and Browserbase stops them within 6 hours.",
      action: "Forget key",
      mascot: null,
    }),
});

// Relay jobs on this Mac, while this window is open, run as an MCP job is: no page, a `from`, and every limit and
// approval of the chat.
export const createMacJobs = (w: WindowParts): MacJobs =>
  new MacJobs(w.app.server, w.app.account, {
    enabled: () => w.settings.relayOnMac,
    linked: () => w.app.runnerJobs.available(),
    // The mascot from the row only narrows the one here with its id, and one that isn't here doesn't start.
    start: (prompt, { mascot, askAtLeast, from }, onEnd) => {
      const clean = (text: string) => w.app.chats.withoutCodes(text);
      const sent = w.app.chats.send(null, prompt, {
        seePage: false,
        mascotId: mascot.id === BERRY.id ? null : mascot.id,
        sites: mascot.sites,
        tools: mascot.tools,
        askAtLeast,
        from,
        onEnd: (ended) =>
          onEnd({
            ...ended,
            reply: clean(ended.reply),
            steps: ended.steps.map((step) => ({ ...step, text: clean(step.text) })),
            error: ended.error && clean(ended.error),
          }),
      });
      return sent?.id ?? null;
    },
    progress: (chatId) => {
      const chat = w.app.chats.thread(chatId);
      if (!chat) return null;
      const clean = (text: string) => w.app.chats.withoutCodes(text);
      return {
        reply: clean(chat.partial ?? ""),
        steps: chat.steps.map((step) => ({ ...step, text: clean(step.text) })),
        waiting: w.app.chats.waiting().some(({ id }) => id === chatId),
      };
    },
    stop: (chatId) => w.app.chats.stop(chatId),
  });
