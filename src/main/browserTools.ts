import { z } from "zod";
import { clickElement, describeElement, listElements, scrollPage, typeIntoElement } from "./pageScripts";
import type { Tab } from "./Tab";

const MAX_READ_LENGTH = 20_000;
const MAX_ELEMENTS = 200;
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
  // Set on anything that changes something. Says exactly what will happen, for the user to allow. It's worked
  // out again just before the tool runs, and a different answer means nothing happens.
  describe?: (args: unknown) => Promise<string>;
}

const pageTool = <S extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: S;
  label: (args: z.infer<S>) => string;
  run: (args: z.infer<S>) => Promise<string>;
  describe?: (args: z.infer<S>) => Promise<string>;
}): PageTool => {
  const { describe } = tool;
  return {
    ...tool,
    label: (args) => tool.label(tool.schema.parse(args)),
    run: (args) => tool.run(tool.schema.parse(args)),
    describe: describe && ((args) => describe(tool.schema.parse(args))),
  };
};

const siteOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "a local file";
  } catch {
    return "a page";
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

const isWebAddress = (url: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

interface ElementInfo {
  role: string;
  name: string;
  // Where a link or form goes, which a page can change while the user decides.
  target: string | null;
}

const NOT_WEB = "Only http and https addresses can be opened.";
const STALE_ELEMENT = "That element is no longer on the page. Call list_elements and try again.";

const NO_ACCESS = "The user has turned off page access, so nothing can be read.";

const tabId = z.string().optional().describe("The tab, from list_tabs. Leave out for the tab the user is on.");

export interface PageToolAccess {
  activeTab: () => Tab | null;
  allTabs: () => Tab[];
  openTab: (url: string) => Tab;
  // Checked on every call, because "Can see" can be switched off while a reply runs.
  canSee: () => boolean;
}

export const createPageTools = ({ activeTab, allTabs, openTab, canSee }: PageToolAccess): PageTool[] => {
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

  const withTab = async (id: string | undefined, act: (tab: Tab) => Promise<string>) => {
    if (!canSee()) return NO_ACCESS;
    const tab = find(id);
    if (!tab) return id ? `There is no web page in tab ${id}.` : "The user's current tab has no web page.";
    try {
      return await act(tab);
    } catch (error) {
      console.error("A page tool failed:", error);
      return canSee() ? `That didn't work on ${tab.url}.` : NO_ACCESS;
    }
  };

  const whereNow = async (tab: Tab) => {
    await tab.settled();
    if (!canSee()) return NO_ACCESS;
    return `Done. Tab ${tab.id} is now at ${tab.url}, titled ${tab.title}.`;
  };

  const element = (id: string | undefined, ref: string) => {
    const tab = canSee() ? find(id) : null;
    if (!tab) return Promise.resolve(null);
    return tab.runInPage<ElementInfo | null>(describeElement(ref)).catch(() => null);
  };

  const describeOn = async (id: string | undefined, ref: string, say: (info: ElementInfo) => string) => {
    const info = await element(id, ref);
    const tab = find(id);
    if (!info || !tab) return `Act on element ${ref}, which is no longer on the page`;
    return `${say(info)} on ${tab.url}${info.target ? `, which goes to ${info.target}` : ""}`;
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
    pageTool({
      name: "list_elements",
      description: `List what can be clicked or filled in on a page, each with a ref for click and type_text. Shows up to ${MAX_ELEMENTS}, so use query to narrow by name. Refs stop working when the page changes address.`,
      schema: z.object({ tabId, query: z.string().max(100).optional().describe("Only elements with this in their name.") }),
      label: ({ tabId: id }) => `Looked over ${site(id)}`,
      run: ({ tabId: id, query }) =>
        withTab(id, async (tab) => {
          const result = await tab.runInPage(listElements(query, MAX_ELEMENTS));
          return canSee() ? JSON.stringify(result) : NO_ACCESS;
        }),
    }),
    pageTool({
      name: "scroll_page",
      description: "Scroll a page by about one screen, to load more of it or bring something into view.",
      schema: z.object({ tabId, direction: z.enum(["up", "down"]) }),
      label: ({ tabId: id }) => `Scrolled ${site(id)}`,
      run: ({ tabId: id, direction }) =>
        withTab(id, async (tab) => JSON.stringify(await tab.runInPage(scrollPage(direction)))),
    }),
    pageTool({
      name: "click",
      description: "Click an element from list_elements. The user is asked first.",
      schema: z.object({ tabId, ref: z.string().max(20) }),
      label: ({ tabId: id }) => `Clicked something on ${site(id)}`,
      describe: ({ tabId: id, ref }) => describeOn(id, ref, ({ role, name }) => `Click the ${role} “${name}”`),
      run: ({ tabId: id, ref }) =>
        withTab(id, async (tab) => {
          const result = await tab.runInPage<string | null>(clickElement(ref));
          if (result === null) return STALE_ELEMENT;
          if (result === "disabled") return "That element is disabled, so nothing happened.";
          return whereNow(tab);
        }),
    }),
    pageTool({
      name: "type_text",
      description: "Replace what's in a field from list_elements with this text, and optionally submit it. The user is asked first.",
      schema: z.object({
        tabId,
        ref: z.string().max(20),
        text: z.string().max(5000),
        submit: z.boolean().optional().describe("Press Enter after typing."),
      }),
      label: ({ tabId: id }) => `Typed into a field on ${site(id)}`,
      describe: ({ tabId: id, ref, text, submit }) =>
        describeOn(
          id,
          ref,
          ({ role, name }) => `Type “${text}” into the ${role} “${name}”${submit ? " and submit it" : ""}`
        ),
      run: ({ tabId: id, ref, text, submit = false }) =>
        withTab(id, async (tab) => {
          const result = await tab.runInPage<string | null>(typeIntoElement(ref, text, submit));
          if (result === null) return STALE_ELEMENT;
          if (result !== "done") return "That element can't be typed into, so nothing happened.";
          return whereNow(tab);
        }),
    }),
    pageTool({
      name: "go_to",
      description: "Go to an address in an existing tab. The user is asked first.",
      schema: z.object({ tabId, url: z.string().max(2000) }),
      label: ({ url }) => `Went to ${siteOf(url)}`,
      describe: async ({ tabId: id, url }) => `Go to ${url} in the tab showing ${find(id)?.url ?? "no page"}`,
      run: ({ tabId: id, url }) =>
        withTab(id, async (tab) => {
          if (!isWebAddress(url)) return NOT_WEB;
          const loading = tab.loadURL(url).catch((error) => console.error("A page failed to load:", error));
          await Promise.race([loading, tab.settled()]);
          return whereNow(tab);
        }),
    }),
    pageTool({
      name: "open_tab",
      description: "Open an address in a new tab, which becomes the current tab. The user is asked first.",
      schema: z.object({ url: z.string().max(2000) }),
      label: ({ url }) => `Opened ${siteOf(url)}`,
      describe: async ({ url }) => `Open ${url} in a new tab`,
      run: async ({ url }) => {
        if (!canSee()) return NO_ACCESS;
        if (!isWebAddress(url)) return NOT_WEB;
        return whereNow(openTab(url));
      },
    }),
  ];
};
