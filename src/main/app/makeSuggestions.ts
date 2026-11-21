import { join } from "path";
import { McpConnector } from "../mcp/McpConnector";
import { Suggestions } from "../suggestions/Suggestions";
import { PATTERN_WINDOW_MS } from "../suggestions/suggestionPatterns";
import { hasModel, writeWithCheapModel } from "../chats/agent";
import { scheduleLabel } from "../routines/routineSchedule";
import { sendToRenderer } from "../window/ipc";
import type { AppServices } from "./AppServices";

// Plenty for a habit to show, and few enough to look through on every new tab.
const MAX_SUGGESTION_VISITS = 5000;
const MAX_SUGGESTION_CHATS = 100;

// What the mascots on the new tab say. A model's answer can come after the window that asked has closed, and it's kept all
// the same, as the next window shows it.
export const createSuggestions = (s: AppServices): Suggestions =>
  new Suggestions(join(s.folder, "suggestions.json"), {
    enabled: () => s.settings.suggestions,
    // Both newest first.
    visits: () => s.stores.history.since(Date.now() - PATTERN_WINDOW_MS, MAX_SUGGESTION_VISITS),
    chats: () =>
      s.stores.chatStore.firstMessages(MAX_SUGGESTION_CHATS).map((chat) => {
        // Failed and stopped are only known for replies since launch.
        const outcome = s.chats.outcome(chat.id);
        return { ...chat, outcome: outcome === "failed" || outcome === "stopped" ? outcome : chat.replied ? "done" : "no reply" };
      }),
    routines: () =>
      s.stores.routineStore
        .routines()
        .map(({ id, name, instructions, schedule, sites }) => ({ id, name, instructions, schedule: scheduleLabel(schedule), sites })),
    runs: (routineId) => s.stores.routineStore.runs(routineId),
    mascots: () => s.stores.mascotStore.all(),
    hasModel,
    // Page titles go in this, and a careless page may have put a code from the phone in its title.
    write: (system, data) => writeWithCheapModel(system, s.chats.withoutCodes(data)),
    onChanged: () => s.window?.library.publishSuggestions(),
  });

// Claude Code, Claude Desktop and other apps on this computer using Blueberry over MCP. It listens only while a window is
// open, with that window's tools.
export const createMcp = (s: AppServices): McpConnector =>
  new McpConnector(
    join(s.folder, "mcp.json"),
    () => s.window?.mcpTools() ?? [],
    () => {
      const w = s.window;
      if (w) sendToRenderer(w.chromeView.view.webContents, "mcp:updated", s.mcp.state);
    },
  );
