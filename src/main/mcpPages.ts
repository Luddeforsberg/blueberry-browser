import { createPageTools } from "./browserTools";
import type { Tab } from "./Tab";

// Pages read for an app over MCP, through Berry's own `read_page` tool, so an app gets exactly what Berry would: the
// same checks for a tab held for the user or in trouble, and frames the same way. Nothing here can act on a page.

export const readTabText = async (tab: Tab, offset: number): Promise<string> => {
  const read = createPageTools({
    activeTab: () => tab,
    allTabs: () => [tab],
    openTab: () => {
      throw new Error("Reading opens nothing");
    },
    closeTab: () => false,
    heldByUser: () => tab.heldForUser,
    ask: async () => null,
    canSee: () => true,
    onUse: () => {},
  }).find(({ name }) => name === "read_page");
  if (!read) throw new Error("No read_page tool");
  return read.run({ tabId: tab.id, offset });
};
