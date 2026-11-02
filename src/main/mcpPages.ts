import { createPageTools } from "./browserTools";
import type { Tab } from "./Tab";

// Pages read for an app over MCP, through Berry's own `read_page` tool, so an app gets exactly what Berry would: the
// same checks for a tab held for the user or in trouble, and frames the same way. Nothing here can act on a page.

const LOAD_WAIT_MS = 15_000;
const LOAD_POLL_MS = 100;

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

// Opens the address behind the user's tab, reads it once it has loaded, and closes it again.
export const readAddress = async (url: string, offset: number, open: (url: string) => Tab, close: (tab: Tab) => void): Promise<string> => {
  const tab = open(url);
  try {
    const until = Date.now() + LOAD_WAIT_MS;
    while (Date.now() < until && (!tab.hasLoaded || tab.isLoading) && !tab.loadError) {
      await new Promise((resolve) => setTimeout(resolve, LOAD_POLL_MS));
    }
    if (tab.loadError) return `${url} couldn't be loaded.`;
    return await readTabText(tab, offset);
  } finally {
    close(tab);
  }
};
