import type { MascotTool } from "../../shared/library";
import { siteAllowed } from "../../shared/mascots";
import type { PageTarget } from "./pageTarget";
import type { PageTool } from "./pageTool";
import type { ToolContext } from "./toolContext";

// What refuses a call before it asks or runs: a tab the user took over, and a mascot's limits, which only take tools and
// sites away.

// What each tool needs from a mascot. "reading" and "asking" are every mascot's. A tool that isn't listed here is
// nobody's, so a new tool can't reach a limited mascot by being forgotten.
const TOOL_NEEDS: Record<string, MascotTool | "reading" | "asking"> = {
  list_tabs: "reading",
  read_page: "reading",
  find_in_page: "reading",
  list_elements: "reading",
  scroll_page: "reading",
  hover: "reading",
  screenshot: "reading",
  wait: "asking",
  ask_user: "asking",
  hand_to_user: "asking",
  go_to: "visit",
  open_tab: "visit",
  go_back: "visit",
  close_tab: "visit",
  click: "click",
  double_click: "click",
  drag: "click",
  choose_option: "click",
  type_text: "type",
  press_key: "type",
  web_search: "visit",
  // It reaches an address the mascot isn't on, as opening a tab does, so it needs the same.
  fetch_page: "visit",
};

// Their results lead anywhere, so a mascot limited to sites doesn't get them.
const OFF_ITS_SITES = ["web_search"];

// These can happen wherever the tab is, so where it is doesn't matter to them.
// Handing a tab over goes here too, because the limit it runs under would stop the user going where they need to.
const ANY_TAB = ["list_tabs", "wait", "ask_user", "hand_to_user", "close_tab", "open_tab", "web_search", "fetch_page"];

// These don't reach into any tab.
const NOT_ON_A_TAB = ["list_tabs", "wait", "ask_user", "open_tab", "web_search", "fetch_page"];

// Whether a picture of this page could show a frame from a site outside `sites`. The browser's own frame tree says,
// whether or not the frame looks to be on screen, since a page can hide one from any script, as in a shadow root.
export const showsFrameOffLimits = (tab: PageTarget, sites: readonly string[]): boolean =>
  sites.length > 0 && tab.foreignFrames.some((frame) => !siteAllowed(frame.origin, sites));

export const withLimits = <T extends PageTarget>(context: ToolContext<T>, tools: PageTool[]): PageTool[] => {
  const { activeTab, limits, allowed, offLimits, frameOf, tookOver, find, limitedRun } = context;

  // A call into a tab the user took over gets no card, because there's nothing left for them to allow.
  const refusedAsTaken = (tool: PageTool, args: unknown) => {
    if (NOT_ON_A_TAB.includes(tool.name)) return null;
    const message = tookOver((args as { tabId?: string } | null)?.tabId ?? activeTab()?.id);
    return message ? { label: "Left the tab you took over", message } : null;
  };

  if (!limits) return tools.map((tool) => ({ ...tool, refuses: async (args: unknown) => refusedAsTaken(tool, args) }));

  // Where this call would reach: the tab, then any frame or address it names.
  const refuses = (tool: PageTool) => async (args: unknown) => {
    const taken = refusedAsTaken(tool, args);
    if (taken) return taken;
    const { tabId: id, url, ref, toRef } = (args ?? {}) as { tabId?: string; url?: string; ref?: string; toRef?: string };
    if (typeof url === "string" && !allowed(url)) return offLimits(url);
    if (ANY_TAB.includes(tool.name)) return null;
    const tab = find(id);
    if (!tab) return null;
    if (!allowed(tab.url)) return offLimits(tab.url);
    for (const named of [ref, toRef]) {
      const frame = typeof named === "string" ? frameOf(tab, named) : null;
      if (frame && frame !== "gone" && !allowed(frame.origin)) return offLimits(frame.origin);
    }
    return null;
  };

  return tools
    .filter(({ name }) => {
      const need = TOOL_NEEDS[name];
      if (OFF_ITS_SITES.includes(name) && limits.sites.length > 0) return false;
      return need === "reading" || need === "asking" || (need !== undefined && limits.tools.includes(need));
    })
    .map((tool) => {
      const refused = refuses(tool);
      return {
        ...tool,
        refuses: refused,
        // `agent.ts` asks this too, but only `run` can't be got around: whatever calls a tool, this is what acts.
        run: async (args: unknown) => {
          const refusal = await refused(args);
          if (refusal) return refusal.message;
          const tab = ANY_TAB.includes(tool.name) ? null : find((args as { tabId?: string } | null)?.tabId);
          return tab ? limitedRun(tab, () => tool.run(args)) : tool.run(args);
        },
      };
    });
};
