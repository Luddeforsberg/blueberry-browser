import { createMcpTools, type McpTool } from "../mcp/mcpTools";
import { readTabText } from "../mcp/mcpPages";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// What Claude and other apps can do over MCP in this window, each through the path the user's own action takes. Made
// once a window, since it remembers the routine runs it started. The server that serves them is the app's.
export const windowMcpTools = (w: WindowParts, stores: AppStores): (() => McpTool[]) => {
  let list: McpTool[] | null = null;
  return () =>
    (list ??= createMcpTools({
      mascots: () => stores.mascotStore.all(),
      startChat: (task, { mascotId, sites, from }) => w.app.chats.send(null, task, { seePage: false, mascotId, sites, from }),
      chat: (id) => w.app.chats.thread(id),
      chatsFromApps: () => stores.chatStore.summaries().filter((chat) => chat.from),
      isRunning: (id) => w.app.chats.isRunning(id),
      outcome: (id) => w.app.chats.outcome(id),
      stop: (id) => w.app.chats.stop(id),
      waiting: () => w.app.chats.waiting(),
      answer: (id, approvalId, answer) => w.app.chats.decide(id, approvalId, true, answer, { fromApp: true }),
      routines: () => w.routines.list(),
      runRoutine: (id, onStart) => w.routines.runNow(id, onStart),
      routineRuns: (id) => w.routines.runs(id),
      stopRoutineRun: (runId) => w.routines.stop(runId),
      cancelRoutineRequest: (id) => w.routines.cancelRequest(id),
      tabs: () =>
        w.tabs.allTabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          active: tab.id === w.tabs.activeId,
          working: tab.berryWorking,
          heldForUser: tab.heldForUser,
        })),
      readTab: (tabId, offset) => {
        const tab = w.tabs.allTabs.find(({ id }) => id === tabId);
        return tab ? readTabText(tab, offset) : Promise.resolve(`There is no web page in tab ${tabId}.`);
      },
      searchHistory: (query, limit) => stores.history.search({ query, limit }).entries,
      recentHistory: (limit) => stores.history.recent(limit),
      bookmarks: () => ({ bookmarks: stores.bookmarkStore.bookmarks, pinned: stores.bookmarkStore.pinned }),
      facts: () => stores.mascotStore.all().flatMap(({ id }) => w.app.memory.factsOf(id)),
      clean: (text) => w.app.chats.withoutCodes(text),
    }));
};
