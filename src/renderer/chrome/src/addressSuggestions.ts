import type { AddressSuggestion, InternalPage, TabInfo, VisitedPage } from "@shared/ipc";
import type { Bookmark, MascotLook } from "@shared/library";
import { looksLikeUrl, toUrl } from "@common/lib/url";

// What the address field offers while it's being edited: open tabs, saved sites, history, a search, and asking a
// mascot, in that order. Everything comes from this computer, and nothing here leaves it.

const MAX_ROWS = 6;
// One letter would complete to nearly anything, so it takes two.
const MIN_COMPLETION = 2;

export interface SuggestionSources {
  text: string;
  tabs: TabInfo[];
  // Favourites and bookmarks, both.
  saved: Bookmark[];
  history: VisitedPage[];
  // Who Ctrl or ⌘ Enter asks. Null leaves the row out.
  ask: { name: string; look: MascotLook; hidden: boolean } | null;
  // False while the person is deleting, so the field never fills back in what they just took out.
  complete: boolean;
  now: number;
}

export interface AddressSuggestions {
  rows: AddressSuggestion[];
  // The address the field completes to, as it's shown, when the first row is a page whose host starts with the text.
  completion: string | null;
}

// Our own pages are only offered by a name that's plainly theirs.
const OWN_PAGES: Partial<Record<InternalPage, string>> = {
  settings: "Settings",
  history: "History",
  downloads: "Downloads",
  routines: "Routines",
  mascots: "Your mascots",
  "needs-you": "Needs you",
  "mascot-gallery": "Gallery",
};

// An address as it's shown and matched: no scheme, no `www.`, no fragment, and no slash on its own at the end.
export const shownAddress = (url: string): string => {
  try {
    const { hostname, port, pathname, search } = new URL(url);
    const path = pathname === "/" ? "" : pathname;
    return `${hostname.replace(/^www\./, "")}${port ? `:${port}` : ""}${path}${search}`;
  } catch {
    return url;
  }
};

const sameKey = (url: string) => shownAddress(url).toLowerCase().replace(/\/$/, "");

// A word matches where a word starts: at the beginning, or after anything that isn't a letter or digit.
const startsWord = (haystack: string, word: string): boolean => {
  let at = haystack.indexOf(word);
  while (at !== -1) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(haystack.charAt(at - 1))) return true;
    at = haystack.indexOf(word, at + 1);
  }
  return false;
};

const matches = (words: string[], title: string, url: string): boolean => {
  const name = title.toLowerCase();
  const address = shownAddress(url).toLowerCase();
  return words.every((word) => startsWord(name, word) || startsWord(address, word));
};

const hostStarts = (text: string, url: string) => shownAddress(url).toLowerCase().startsWith(text);

// Often and recently: a page from today counts for most, and each doubling of visits adds as much again.
const DAY = 24 * 60 * 60 * 1000;
const recency = (age: number) => (age < DAY ? 1 : age < 4 * DAY ? 0.8 : age < 14 * DAY ? 0.6 : age < 90 * DAY ? 0.35 : 0.1);
const frecency = (page: VisitedPage, now: number) => recency(now - page.lastVisit) * (1 + Math.log2(Math.max(page.visits, 1)));

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

// "Today", "Yesterday", a weekday within the week, or a date, with its year only when it isn't this one.
export const whenInWords = (time: number, now: number): string => {
  const day = startOfDay(time);
  const today = startOfDay(now);
  if (day >= today) return "Today";
  // From the calendar rather than by counting hours, because a day can have 23 or 25 of them.
  const daysAgo = (back: number) => new Date(today).setDate(new Date(today).getDate() - back);
  if (day >= daysAgo(1)) return "Yesterday";
  // The app is in English, whatever language the system is in.
  if (day > daysAgo(7)) return new Date(time).toLocaleDateString("en-GB", { weekday: "long" });
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
};

type PageRow = Extract<AddressSuggestion, { kind: "tab" | "bookmark" | "history" }>;

export const addressSuggestions = ({ text, tabs, saved, history, ask, complete, now }: SuggestionSources): AddressSuggestions => {
  const typed = text.trim();
  if (!typed) return { rows: [], completion: null };
  const lower = typed.toLowerCase();
  const words = lower.split(/\s+/);
  // A host prefix comes before a match further in, and otherwise each list keeps its own order.
  const hostFirst = <T extends { url: string }>(list: T[]) => [
    ...list.filter(({ url }) => hostStarts(lower, url)),
    ...list.filter(({ url }) => !hostStarts(lower, url)),
  ];

  // The page in front is where the field already is, so it's never offered.
  const front = tabs.find((tab) => tab.isActive && !tab.page);
  const here = front ? sameKey(front.url) : null;
  const seen = new Set<string>(here ? [here] : []);
  const fresh = (url: string) => {
    const key = sameKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  // Not the tab in front, and not one a job opened for itself, which the sidebar keeps under its chat.
  const openTabs = tabs.filter((tab) => !tab.isActive && !tab.jobChatId);
  const ownPages: PageRow[] = openTabs.flatMap((tab) => {
    const name = tab.page ? OWN_PAGES[tab.page] : undefined;
    return name && words.every((word) => startsWord(name.toLowerCase(), word))
      ? [{ kind: "tab" as const, tabId: tab.id, title: name, url: "", favicon: null }]
      : [];
  });
  const webTabs: PageRow[] = hostFirst(openTabs.filter((tab) => !tab.page && matches(words, tab.title, tab.url)))
    .filter(({ url }) => fresh(url))
    .map(({ id, title, url, favicon }) => ({ kind: "tab", tabId: id, title: title || shownAddress(url), url, favicon }));
  const savedRows: PageRow[] = hostFirst(saved.filter(({ title, url }) => matches(words, title, url)))
    .filter(({ url }) => fresh(url))
    .map(({ title, url, favicon }) => ({ kind: "bookmark", title: title || shownAddress(url), url, favicon: favicon ?? null }));
  const visitedRows: PageRow[] = hostFirst(
    history.filter(({ title, url }) => matches(words, title, url)).sort((a, b) => frecency(b, now) - frecency(a, now)),
  )
    .filter(({ url }) => fresh(url))
    .map(({ title, url, favicon, lastVisit }) => ({
      kind: "history",
      title: title || shownAddress(url),
      url,
      favicon,
      when: whenInWords(lastVisit, now),
    }));
  let pages = [...ownPages, ...webTabs, ...savedRows, ...visitedRows];

  // Only to an address the person has been to or saved, whose host starts with what they typed, and never for words.
  const canComplete = complete && typed.length >= MIN_COMPLETION && !/\s/.test(typed) && !typed.includes("://");
  // Typed with `www.`, it completes with it, so the field still starts with exactly what was typed.
  const www = lower.startsWith("www.") ? "www." : "";
  const bare = lower.slice(www.length);
  // It has to add something: the exact address typed in full goes where Enter takes it today.
  const target = canComplete
    ? [...saved.map(({ url }) => url), ...history.map(({ url }) => url)]
        .filter((url) => {
          const shown = shownAddress(url).toLowerCase();
          return shown.startsWith(bare) && shown.length > bare.length && sameKey(url) !== here;
        })
        .sort((a, b) => shownAddress(a).length - shownAddress(b).length)[0]
    : undefined;
  let completion: string | null = null;
  if (target) {
    const first = pages.find(({ url }) => url && sameKey(url) === sameKey(target));
    if (first) {
      completion = www + shownAddress(target);
      pages = [first, ...pages.filter((row) => row !== first)];
    }
  }

  const opens = looksLikeUrl(typed);
  const search: AddressSuggestion = { kind: "search", text: typed, url: toUrl(typed), opens };
  const asking: AddressSuggestion[] = ask ? [{ kind: "ask", text: typed, ...ask }] : [];
  const room = MAX_ROWS - 1 - asking.length;
  return { rows: [...pages.slice(0, room), search, ...asking], completion };
};
