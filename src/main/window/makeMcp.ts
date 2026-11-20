import { app } from "electron";
import { join } from "path";
import { McpConnector } from "../mcp/McpConnector";
import { createMcpTools, type McpTool } from "../mcp/mcpTools";
import { readTabText } from "../mcp/mcpPages";
import { sendToRenderer } from "./ipc";
import type { WindowParts, WindowStores } from "./WindowParts";

// Claude Code, Claude Desktop and other apps on this computer using Blueberry over MCP, wired to the window.
export const createMcp = (w: WindowParts, stores: WindowStores): McpConnector => {
  // What Claude and other apps can do over MCP, each through the path the user's own action takes. Made once, since it
  // remembers the routine runs it started.
  let mcpToolList: McpTool[] | null = null;
  const mcpTools = (): McpTool[] =>
    (mcpToolList ??= createMcpTools({
      mascots: () => stores.mascotStore.all(),
      startChat: (task, { mascotId, sites, from }) => w.chats.send(null, task, { seePage: false, mascotId, sites, from }),
      chat: (id) => w.chats.thread(id),
      chatsFromApps: () => stores.chatStore.summaries().filter((chat) => chat.from),
      isRunning: (id) => w.chats.isRunning(id),
      outcome: (id) => w.chats.outcome(id),
      stop: (id) => w.chats.stop(id),
      waiting: () => w.chats.waiting(),
      answer: (id, approvalId, answer) => w.chats.decide(id, approvalId, true, answer, { fromApp: true }),
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
      facts: () => stores.mascotStore.all().flatMap(({ id }) => w.memory.factsOf(id)),
      clean: (text) => w.chats.withoutCodes(text),
    }));
  return new McpConnector(join(app.getPath("userData"), "mcp.json"), mcpTools, () =>
    sendToRenderer(w.chromeView.view.webContents, "mcp:updated", w.mcp.state),
  );
};
