import { z } from "zod";
import type { PageTarget } from "./pageTarget";
import { pageTool, tabId } from "./pageTool";
import type { ToolContext } from "./toolContext";
import { isWebAddress, siteName } from "../../shared/sites";
import { NO_ACCESS, NOT_WEB } from "./toolMessages";

// The tools that move a tab or open and close one.

export const tabTools = <T extends PageTarget>(context: ToolContext<T>) => {
  const {
    openTab,
    closeTab,
    ownsEveryTab,
    attached,
    canSee,
    limits,
    allowed,
    offLimits,
    find,
    noTab,
    usedTab,
    whyCard,
    site,
    withTab,
    actorOn,
    carryOn,
    leftOff,
    whereNow,
    limitedRun,
  } = context;
  const opened = new Set<string>();

  return {
    go_back: pageTool({
      name: "go_back",
      kind: "open",
      description: "Go back one page in a tab, like the browser's back button.",
      schema: z.object({ tabId }),
      label: ({ tabId: id }) => `Went back on ${site(id)}`,
      describe: async ({ tabId: id }) => `Go back from ${find(id)?.url ?? "no page"}`,
      whyRisky: async () => null,
      run: ({ tabId: id }) =>
        withTab(id, async (tab) => {
          if (!tab.canGoBack) return "There's no earlier page in that tab, so nothing happened.";
          // History isn't a navigation the limit below gets to stop.
          const back = tab.backUrl;
          if (back && !allowed(back)) return offLimits(back).message;
          await actorOn(tab)?.say("Going back", "flying");
          if (!carryOn(tab)) return leftOff(tab);
          const outcome = await tab.agentGoBack();
          if (outcome === "refused") return `The browser didn't go back, so tab ${tab.id} is still at ${tab.url}.`;
          if (outcome === "unknown") {
            return `The browser didn't say whether it went back, so it may still go. Look at tab ${tab.id} before going back again.`;
          }
          return whereNow(tab);
        }),
    }),
    close_tab: pageTool({
      name: "close_tab",
      kind: "open",
      description: "Close a tab you opened yourself, when you're done with it. It can't close any other tab.",
      schema: z.object({ tabId: z.string().describe("The tab, from list_tabs.") }),
      label: () => "Closed a tab it opened",
      describe: async ({ tabId: id }) => `Close the tab showing ${find(id)?.url ?? "no page"}, which Berry opened`,
      whyRisky: async () => null,
      run: async ({ tabId: id }) => {
        if (!canSee()) return NO_ACCESS;
        const tab = find(id);
        if (!tab) return noTab(id);
        if (attached(id) || (!ownsEveryTab && !opened.has(id))) return "You didn't open that tab, so it stays open.";
        if (!closeTab(tab)) return "That tab stays open, because it's the last in the window or the user is looking at it.";
        opened.delete(id);
        return `Closed tab ${id}.`;
      },
    }),
    go_to: pageTool({
      name: "go_to",
      kind: "open",
      description: "Go to an address in an existing tab. The user is asked first.",
      schema: z.object({ tabId, url: z.string().max(2000) }),
      label: ({ url }) => `Went to ${siteName(url)}`,
      describe: async ({ tabId: id, url }) => `Go to ${url} in the tab showing ${find(id)?.url ?? "no page"}`,
      whyRisky: async ({ tabId: id, url }) => whyCard(url, find(id)),
      run: ({ tabId: id, url }) =>
        withTab(id, async (tab) => {
          if (!isWebAddress(url)) return NOT_WEB;
          await actorOn(tab)?.say(`Going to ${siteName(url)}`, "flying");
          if (!carryOn(tab)) return leftOff(tab);
          // A failed load is reported by `whereNow`. Anything else, like a download, still counts as not working.
          await Promise.race([
            tab.loadURL(url).catch((error) => {
              if (!tab.loadError) throw error;
            }),
            tab.settled(),
          ]);
          return whereNow(tab);
        }),
    }),
    open_tab: pageTool({
      name: "open_tab",
      kind: "open",
      description:
        "Open an address in a new tab behind the user, which never takes over their screen. It becomes the tab you're working in, and they can go to it with one click. The user is asked first when it could send something out.",
      schema: z.object({ url: z.string().max(2000) }),
      label: ({ url }) => `Opened ${siteName(url)}`,
      describe: async ({ url }) => `Open ${url} in a new tab`,
      whyRisky: async ({ url }) => whyCard(url, find()),
      run: async ({ url }) => {
        if (!canSee()) return NO_ACCESS;
        if (!isWebAddress(url)) return NOT_WEB;
        let tab: T;
        try {
          tab = await openTab(url);
        } catch (error) {
          // Only a browser in the cloud fails here, and what it says is ours, not a page's.
          console.error("Couldn't open a tab:", error);
          return `No tab was opened. ${error instanceof Error ? error.message : ""}`.trim();
        }
        opened.add(tab.id);
        usedTab(tab);
        return limits ? await limitedRun(tab, () => whereNow(tab)) : whereNow(tab);
      },
    }),
  };
};
