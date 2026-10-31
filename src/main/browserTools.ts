import { z } from "zod";
import type { Tab } from "./Tab";

const MAX_READ_LENGTH = 20_000;
const MAX_MATCHES = 10;
const MATCH_CONTEXT_LENGTH = 150;
// A page that never finishes loading would otherwise hold its script, and the reply, forever.
const READ_TIMEOUT_MS = 10_000;

// Plain data, so this file doesn't load LangChain at startup. `agent.ts` turns these into its tools.
export interface PageTool {
  name: string;
  description: string;
  schema: z.ZodObject;
  // What the chat shows for this call. It goes back to the model in later messages as Berry's own words,
  // so nothing a page could have written goes in it: no titles, and no search text.
  label: (args: unknown) => string;
  run: (args: unknown) => Promise<string>;
}

const pageTool = <S extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: S;
  label: (args: z.infer<S>) => string;
  run: (args: z.infer<S>) => Promise<string>;
}): PageTool => ({
  ...tool,
  label: (args) => tool.label(tool.schema.parse(args)),
  run: (args) => tool.run(tool.schema.parse(args)),
});

const siteOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
};

const readText = async (tab: Tab): Promise<string | null> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([tab.getTabText(), timeout]);
  } catch (error) {
    console.error("Failed to read a page for a tool:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const NO_ACCESS = "The user has turned off page access, so nothing can be read.";

const tabId = z.string().optional().describe("The tab, from list_tabs. Leave out for the tab the user is on.");

export interface PageToolAccess {
  activeTab: () => Tab | null;
  allTabs: () => Tab[];
  // Checked on every call, because "Can see" can be switched off while a reply runs.
  canSee: () => boolean;
}

export const createPageTools = ({ activeTab, allTabs, canSee }: PageToolAccess): PageTool[] => {
  const find = (id?: string) => (id ? allTabs().find((tab) => tab.id === id) : activeTab()) ?? null;
  const site = (id?: string) => {
    const tab = canSee() ? find(id) : null;
    return tab ? siteOf(tab.url) : "a tab";
  };

  // Everything these tools return is the page's words, so the system prompt tells the model not to obey them.
  const withText = async (id: string | undefined, format: (tab: Tab, text: string) => string) => {
    if (!canSee()) return NO_ACCESS;
    const tab = find(id);
    if (!tab) return id ? `There is no web page in tab ${id}.` : "The user's current tab has no web page.";
    const text = await readText(tab);
    if (!canSee()) return NO_ACCESS;
    return text === null ? `The page at ${tab.url} could not be read.` : format(tab, text);
  };

  return [
    pageTool({
      name: "list_tabs",
      description: "List the web pages open in the browser, with each tab's id, title and address.",
      schema: z.object({}),
      label: () => "Checked your open tabs",
      run: async () => {
        if (!canSee()) return NO_ACCESS;
        const active = activeTab();
        const tabs = allTabs().map(({ id, title, url }) => ({ id, title, url, active: id === active?.id }));
        return JSON.stringify(tabs);
      },
    }),
    pageTool({
      name: "read_page",
      description: `Read the text of a page, up to ${MAX_READ_LENGTH} characters at a time. To continue, call again with the offset it gives you.`,
      schema: z.object({
        tabId,
        offset: z.number().int().min(0).optional().describe("Where to start reading, in characters."),
      }),
      label: ({ tabId: id }) => `Read ${site(id)}`,
      run: ({ tabId: id, offset = 0 }) =>
        withText(id, (tab, text) => {
          const end = offset + MAX_READ_LENGTH;
          const more = end < text.length ? `Continue with offset ${end}.` : "This is the end of the page.";
          return `${tab.url}, characters ${offset} to ${Math.min(end, text.length)} of ${text.length}. ${more}\n\n${text.slice(offset, end)}`;
        }),
    }),
    pageTool({
      name: "find_in_page",
      description: "Find text on a page, ignoring case. Gives each match with the text around it.",
      schema: z.object({ query: z.string().min(1).max(100), tabId }),
      label: ({ tabId: id }) => `Searched ${site(id)}`,
      run: ({ query, tabId: id }) =>
        withText(id, (tab, text) => {
          const haystack = text.toLowerCase();
          const needle = query.toLowerCase();
          const matches: string[] = [];
          let total = 0;
          for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
            total++;
            if (matches.length < MAX_MATCHES) {
              const start = Math.max(0, at - MATCH_CONTEXT_LENGTH);
              matches.push(`At ${at}: ${text.slice(start, at + needle.length + MATCH_CONTEXT_LENGTH)}`);
            }
          }
          if (total === 0) return `No matches on ${tab.url}.`;
          return `${total} matches on ${tab.url}, showing ${matches.length}.\n\n${matches.join("\n\n")}`;
        }),
    }),
  ];
};
