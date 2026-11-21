import { z } from "zod";
import type { Bookmark, MascotProfile } from "../../shared/library";
import { at, clip, count, failed, fromWeb, json, UNTRUSTED_NOTE } from "./mcpResults";
import type { McpHost, McpTool } from "./mcpTools";
import { siteName, siteOf } from "../../shared/sites";

// The tools that only read what's in the user's Blueberry: open tabs, a page that's open already, history, bookmarks and
// what the mascots remember.

const MAX_LIST = 100;
const DEFAULT_LIST = 20;

// The same page however it's written, such as with a capital in the host. Only http and https are pages here.
const sameAddress = (a: string, b: string) => {
  try {
    const [first, second] = [new URL(a), new URL(b)];
    return /^https?:$/.test(first.protocol) && first.href === second.href;
  } catch {
    return false;
  }
};

// Page text goes in a tag a page can't close early, so where it ends is never up to the page.
const pageContent = (url: string, text: string): string =>
  `${UNTRUSTED_NOTE}\n\n<untrusted-page-content url="${url.replace(/"/g, "%22")}">\n${text.replace(/<\/?untrusted-page-content/gi, "[tag removed]")}\n</untrusted-page-content>`;

export const browsingTools = (host: McpHost, liveMascots: () => MascotProfile[]): McpTool[] => [
  {
    name: "get_open_tabs",
    title: "Open tabs",
    description: "The tabs open in the user's Blueberry right now, with each one's id for read_page.",
    shape: {},
    readOnly: true,
    run: async () => {
      const tabs = host.tabs().map((tab) =>
        tab.heldForUser
          ? {
              id: tab.id,
              site: siteOf(tab.url),
              active: tab.active,
              note: "The user is signing in or entering a code here, so it can't be read.",
            }
          : {
              id: tab.id,
              title: host.clean(tab.title),
              url: host.clean(tab.url),
              active: tab.active,
              ...(tab.working ? { aJobIsWorkingHere: true } : {}),
            },
      );
      return { text: fromWeb(tabs), summary: count(tabs.length, "tab") };
    },
  },
  {
    name: "read_page",
    title: "Read a page",
    description:
      "Read the text of a page open in the user's browser, with their logins. Give `tabId` from get_open_tabs, or the `url` of a tab that's open. To go somewhere new, use run_browser_task, which asks the user before anything that could send data. Long pages come in parts: call again with the offset it gives.",
    shape: {
      tabId: z.string().optional(),
      url: z.string().optional(),
      offset: z.number().int().min(0).optional(),
    },
    readOnly: true,
    run: async ({ tabId, url, offset }) => {
      const from = typeof offset === "number" ? offset : 0;
      // Only a page that's open already. Opening an address is going there, which may send whatever is in it, so that
      // goes through a job and its approvals instead.
      const tab =
        typeof tabId === "string" && tabId
          ? host.tabs().find(({ id }) => id === tabId)
          : typeof url === "string"
            ? host.tabs().find((open) => sameAddress(open.url, url))
            : undefined;
      if (typeof tabId === "string" && tabId && !tab) return failed(`There's no tab ${tabId}. get_open_tabs names them.`, "No such tab");
      if (typeof url === "string" && url && !tab) {
        return failed(
          `No open tab is at ${url}. read_page only reads pages that are open already. To open it, use run_browser_task, which asks the user before anything that could send data.`,
          `Refused: ${siteName(url)} not open`,
        );
      }
      if (tab) {
        if (tab.heldForUser)
          return failed(
            "The user is signing in or entering a code in that tab, so it can't be read.",
            `Refused: ${siteName(tab.url)} held`,
          );
        return {
          text: pageContent(host.clean(tab.url), host.clean(await host.readTab(tab.id, from))),
          summary: `Read ${siteName(tab.url)}`,
        };
      }
      return failed("Give a tabId, or the url of an open tab.", "Nothing to read");
    },
  },
  {
    name: "search_history",
    title: "Search history",
    description: "Search the user's browsing history in Blueberry by words in the title or address, newest first.",
    shape: { query: z.string(), limit: z.number().int().min(1).max(MAX_LIST).optional() },
    readOnly: true,
    run: async ({ query, limit }) => {
      const visits = host
        .searchHistory(String(query), typeof limit === "number" ? limit : DEFAULT_LIST)
        .map(({ title, url, visitedAt }) => ({ title: host.clean(title), url: host.clean(url), visitedAt: at(visitedAt) }));
      return { text: fromWeb(visits), summary: `${count(visits.length, "visit")} for “${clip(String(query), 30)}”` };
    },
  },
  {
    name: "get_recent_activity",
    title: "Recent activity",
    description: "The pages the user visited most recently in Blueberry, each once, newest first.",
    shape: { limit: z.number().int().min(1).max(MAX_LIST).optional() },
    readOnly: true,
    run: async ({ limit }) => {
      const visits = host
        .recentHistory(typeof limit === "number" ? limit : DEFAULT_LIST)
        .map(({ title, url, visitedAt }) => ({ title: host.clean(title), url: host.clean(url), visitedAt: at(visitedAt) }));
      return { text: fromWeb(visits), summary: `${count(visits.length, "recent page")}` };
    },
  },
  {
    name: "get_bookmarks",
    title: "Bookmarks",
    description: "The user's bookmarks and pinned sites in Blueberry.",
    shape: {},
    readOnly: true,
    run: async () => {
      const { bookmarks, pinned } = host.bookmarks();
      const plain = ({ title, url }: Bookmark) => ({ title: host.clean(title), url: host.clean(url) });
      return {
        text: fromWeb({ pinned: pinned.map(plain), bookmarks: bookmarks.map(plain) }),
        summary: count(bookmarks.length + pinned.length, "saved site"),
      };
    },
  },
  {
    name: "get_user_profile",
    title: "What the mascots remember",
    description:
      "What the user chose to let their mascots remember about how they like things done, by mascot. The user wrote or approved every word. Read-only.",
    shape: {},
    readOnly: true,
    run: async () => {
      const facts = host.facts();
      const byAgent = liveMascots()
        .map((mascot) => ({
          agent: mascot.name,
          remembers: facts.filter((fact) => fact.mascotId === mascot.id).map(({ text, site }) => ({ text, ...(site ? { site } : {}) })),
        }))
        .filter(({ remembers }) => remembers.length > 0);
      return { text: json(byAgent), summary: `${count(facts.length, "thing")} remembered` };
    },
  },
];
