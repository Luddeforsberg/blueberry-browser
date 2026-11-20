import { describe, expect, it } from "vitest";
import type { TabInfo, VisitedPage } from "@shared/ipc";
import type { Bookmark } from "@shared/library";
import { BERRY } from "@shared/mascots";
import { addressSuggestions, whenInWords, type SuggestionSources } from "./addressSuggestions";

const NOW = new Date(2026, 10, 16, 15, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

const tab = (id: string, url: string, title: string, more: Partial<TabInfo> = {}): TabInfo => ({
  id,
  title,
  url,
  favicon: null,
  isActive: false,
  isLoading: false,
  berryWorking: false,
  workingMascotId: null,
  jobChatId: null,
  canGoBack: false,
  canGoForward: false,
  zoomPercent: 100,
  page: null,
  pageParam: null,
  trouble: null,
  loadError: null,
  ...more,
});
const saved = (url: string, title: string): Bookmark => ({ id: url, url, title });
const visited = (url: string, title: string, lastVisit = NOW - 60_000, visits = 1): VisitedPage => ({
  url,
  title,
  favicon: null,
  lastVisit,
  visits,
});

const sources = (text: string, more: Partial<SuggestionSources> = {}): SuggestionSources => ({
  text,
  tabs: [],
  saved: [],
  history: [],
  ask: { name: "Berry", look: BERRY.look, hidden: false },
  complete: true,
  now: NOW,
  ...more,
});
const kinds = (text: string, more: Partial<SuggestionSources> = {}) => addressSuggestions(sources(text, more)).rows.map((row) => row.kind);
const urls = (text: string, more: Partial<SuggestionSources> = {}) =>
  addressSuggestions(sources(text, more)).rows.flatMap((row) => ("url" in row && row.kind !== "search" ? [row.url] : []));

describe("addressSuggestions", () => {
  it("offers nothing for empty text", () => {
    expect(addressSuggestions(sources("   ", { history: [visited("https://klm.com/", "KLM")] }))).toEqual({ rows: [], completion: null });
  });

  it("matches from one letter, at the start of a word only", () => {
    const history = [visited("https://klm.com/", "KLM"), visited("https://example.com/", "Pickles")];
    expect(urls("k", { history })).toEqual(["https://klm.com/"]);
  });

  it("matches a host prefix, and a word of the title", () => {
    const history = [visited("https://www.klm.com/flights", "Book a flight"), visited("https://news.site/", "KLM strike ends")];
    expect(urls("klm", { history })).toEqual(["https://www.klm.com/flights", "https://news.site/"]);
    expect(urls("flight", { history })).toEqual(["https://www.klm.com/flights"]);
    expect(urls("book fli", { history })).toEqual(["https://www.klm.com/flights"]);
  });

  it("orders tabs, then saved sites, then history, then search, then asking", () => {
    const rows = kinds("kl", {
      tabs: [tab("t1", "https://klm.com/trip", "Your trip")],
      saved: [saved("https://klm.com/flights", "KLM Flights")],
      history: [visited("https://klm.com/my-trips", "My trips")],
      complete: false,
    });
    expect(rows).toEqual(["tab", "bookmark", "history", "search", "ask"]);
  });

  it("shows a page that's both a tab and in history once, as the tab", () => {
    const rows = addressSuggestions(
      sources("klm", {
        tabs: [tab("t1", "https://klm.com/trip", "Your trip")],
        history: [visited("https://klm.com/trip#top", "Your trip")],
        complete: false,
      }),
    ).rows;
    expect(rows.map(({ kind }) => kind)).toEqual(["tab", "search", "ask"]);
  });

  it("leaves out the tab in front, a job's own tab, and our own pages unless named plainly", () => {
    const tabs = [
      tab("front", "https://klm.com/", "KLM", { isActive: true }),
      tab("job", "https://klm.com/deals", "KLM deals", { jobChatId: "chat-1" }),
      tab("settings", "blueberry://settings", "Settings", { page: "settings" }),
      tab("chat", "blueberry://chat", "Settings for my flight", { page: "chat" }),
    ];
    expect(kinds("klm", { tabs })).toEqual(["search", "ask"]);
    const settings = addressSuggestions(sources("sett", { tabs })).rows;
    expect(settings.map((row) => (row.kind === "tab" ? row.tabId : row.kind))).toEqual(["settings", "search", "ask"]);
  });

  it("never offers the page in front, as history or as a completion", () => {
    const tabs = [tab("front", "https://klm.com/", "KLM", { isActive: true })];
    const done = addressSuggestions(
      sources("kl", { tabs, history: [visited("https://klm.com/", "KLM"), visited("https://klm.com/flights", "Flights")] }),
    );
    expect(done.rows.map((row) => ("url" in row && row.kind !== "search" ? row.url : row.kind))).toEqual([
      "https://klm.com/flights",
      "search",
      "ask",
    ]);
    expect(done.completion).toBe("klm.com/flights");
  });

  it("keeps to six rows, with search and asking always there", () => {
    const history = Array.from({ length: 10 }, (_, index) => visited(`https://klm.com/${index}`, `KLM ${index}`));
    const rows = addressSuggestions(sources("klm", { history, complete: false })).rows;
    expect(rows).toHaveLength(6);
    expect(rows.slice(-2).map(({ kind }) => kind)).toEqual(["search", "ask"]);
  });

  it("puts history visited often and recently first", () => {
    const history = [
      visited("https://klm.com/old", "KLM old", NOW - 200 * DAY, 3),
      visited("https://klm.com/once", "KLM once", NOW - 1000, 1),
      visited("https://klm.com/often", "KLM often", NOW - 2 * DAY, 40),
    ];
    expect(urls("klm", { history, complete: false })).toEqual(["https://klm.com/often", "https://klm.com/once", "https://klm.com/old"]);
  });

  it("searches for words, and opens what looks like an address, as Enter does today", () => {
    const words = addressSuggestions(sources("cheap flights")).rows.find((row) => row.kind === "search");
    expect(words).toMatchObject({ opens: false, url: "https://www.google.com/search?q=cheap%20flights" });
    const address = addressSuggestions(sources("klm.com")).rows.find((row) => row.kind === "search");
    expect(address).toMatchObject({ opens: true, url: "https://klm.com" });
  });

  it("leaves asking out when there's nobody to ask", () => {
    expect(kinds("klm", { ask: null })).toEqual(["search"]);
  });

  it("completes only to a visited or saved host that starts with the text", () => {
    const history = [visited("https://www.klm.com/flights", "KLM Flights")];
    const done = addressSuggestions(sources("kl", { history }));
    expect(done.completion).toBe("klm.com/flights");
    expect(done.rows[0]).toMatchObject({ kind: "history", url: "https://www.klm.com/flights" });

    // A tab alone isn't somewhere the person has been, and a title word isn't a host.
    expect(addressSuggestions(sources("kl", { tabs: [tab("t1", "https://klm.com/", "KLM")] })).completion).toBeNull();
    expect(addressSuggestions(sources("fl", { history })).completion).toBeNull();
    expect(addressSuggestions(sources("kl", { saved: [saved("https://klm.com/", "KLM")] })).completion).toBe("klm.com");
    // Not while deleting, not for words, and not for a single letter.
    expect(addressSuggestions(sources("kl", { history, complete: false })).completion).toBeNull();
    expect(addressSuggestions(sources("kl m", { history })).completion).toBeNull();
    expect(addressSuggestions(sources("k", { history })).completion).toBeNull();
  });

  it("completes to the shortest address, and puts that page first even when it's an open tab", () => {
    const history = [visited("https://klm.com/flights", "Flights", NOW, 30), visited("https://klm.com/", "KLM", NOW - DAY, 2)];
    const tabs = [tab("t1", "https://klm.com/", "KLM home")];
    const done = addressSuggestions(sources("klm.c", { history, tabs }));
    expect(done.completion).toBe("klm.com");
    expect(done.rows[0]).toMatchObject({ kind: "tab", tabId: "t1" });
  });

  it("keeps a completed page first even past the limit", () => {
    const tabs = Array.from({ length: 6 }, (_, index) => tab(`t${index}`, `https://site${index}.com/`, `KLM ${index}`));
    const done = addressSuggestions(sources("klm", { tabs, history: [visited("https://klm.com/", "Home")] }));
    expect(done.completion).toBe("klm.com");
    expect(done.rows[0]).toMatchObject({ kind: "history", url: "https://klm.com/" });
    expect(done.rows).toHaveLength(6);
  });
});

describe("whenInWords", () => {
  it("says today, yesterday, a weekday this week, then a date", () => {
    expect(whenInWords(NOW - 60_000, NOW)).toBe("Today");
    expect(whenInWords(NOW - DAY, NOW)).toBe("Yesterday");
    expect(whenInWords(NOW - 3 * DAY, NOW)).toBe("Friday");
    expect(whenInWords(NOW - 10 * DAY, NOW)).toBe("6 Nov");
    expect(whenInWords(new Date(2025, 0, 2).getTime(), NOW)).toBe("2 Jan 2025");
  });
});
