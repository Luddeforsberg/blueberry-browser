import { describe, expect, it } from "vitest";
import { buildDigest, searchQuery, type DigestInput } from "./suggestionDigest";

const NOW = new Date(2026, 10, 2, 18, 0).getTime();
const at = (daysAgo: number, hour: number, minute = 0) => {
  const date = new Date(NOW);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysAgo, hour, minute).getTime();
};
const visit = (url: string, title: string, visitedAt: number) => ({ url, title, visitedAt });
const digestOf = (input: Partial<DigestInput>) =>
  buildDigest({ visits: [], chats: [], routines: [], mascots: [], feedback: [], now: NOW, ...input, ...(input.visits ? { visits: [...input.visits].sort((a, b) => b.visitedAt - a.visitedAt) } : {}) });
const data = (input: Partial<DigestInput>) => digestOf(input).data as Record<string, Array<Record<string, unknown>>>;

describe("sessions", () => {
  it("splits at a gap of half an hour, newest first, with the pages in order", () => {
    const { sessions } = data({
      visits: [
        visit("https://www.kayak.com/flights", "Flights | KAYAK", at(1, 20, 0)),
        visit("https://www.skyscanner.se/", "Skyscanner", at(1, 20, 10)),
        visit("https://www.momondo.se/", "momondo", at(1, 20, 39)),
        visit("https://news.ycombinator.com/", "Hacker News", at(1, 21, 15)),
      ],
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: "s1", pages: [{ site: "news.ycombinator.com", title: "Hacker News" }] });
    expect(sessions[1]).toMatchObject({ id: "s2", minutes: 39, pages: [{ site: "kayak.com" }, { site: "skyscanner.se" }, { site: "momondo.se" }] });
  });

  it("counts the same page again rather than listing it twice", () => {
    const { sessions } = data({ visits: [0, 1, 2].map((minute) => visit("https://news.ycombinator.com/", "Hacker News", at(1, 8, minute))) });
    expect(sessions[0].pages).toEqual([{ site: "news.ycombinator.com", title: "Hacker News", times: 3 }]);
  });

  it("leaves out anything older than two weeks", () => {
    expect(data({ visits: [visit("https://news.ycombinator.com/", "Hacker News", at(15, 8))] }).sessions).toEqual([]);
  });

  it("gives each session's sites to its evidence", () => {
    const digest = digestOf({ visits: [visit("https://www.kayak.com/a", "KAYAK", at(1, 8)), visit("https://github.com/", "GitHub", at(1, 8, 5))] });
    expect(digest.evidence.get("s1")?.hosts).toEqual(["kayak.com", "github.com"]);
    expect(digest.evidence.get("s1")?.sources).toEqual(["site:kayak.com", "site:github.com"]);
  });
});

describe("exclusions", () => {
  it("never holds banks, mail, local addresses or tokens", () => {
    const sent = JSON.stringify(
      data({
        visits: [
          visit("https://mail.google.com/mail/u/0/#inbox", "Inbox (3) - me@example.com - Gmail", at(1, 8)),
          visit("https://internbank.swedbank.se/app", "Swedbank Internetbanken", at(1, 8, 1)),
          visit("http://localhost:5173/", "acme dev", at(1, 8, 2)),
          visit("https://example.com/reset?token=abc", "Reset", at(1, 8, 3)),
          visit("https://example.com/a/9f8e7d6c5b4a39281706f5e4d3c2b1a0", "Shared doc", at(1, 8, 4)),
        ],
      })
    );
    ["Inbox", "Swedbank", "localhost", "token", "Shared doc"].forEach((word) => expect(sent).not.toContain(word));
  });

  it("keeps the site but not the title of an address with a query", () => {
    const { sessions } = data({ visits: [visit("https://shop.example/order?id=55", "Order 55 for Mira", at(1, 8))] });
    expect(sessions[0].pages).toEqual([{ site: "shop.example" }]);
  });

  it("leaves out a private chat title", () => {
    const { chats } = data({ chats: [{ id: "a", title: "My bank password", updatedAt: at(1, 8), outcome: "done" }] });
    expect(chats).toEqual([]);
  });
});

describe("search queries", () => {
  it("come only from known search engines", () => {
    expect(searchQuery("https://www.google.com/search?q=best+usb-c+hub&sxsrf=x")).toBe("best usb-c hub");
    expect(searchQuery("https://www.google.se/search?q=Best%20USB-C%20hub")).toBe("best usb-c hub");
    expect(searchQuery("https://www.bing.com/search?q=lisbon+weather")).toBe("lisbon weather");
    expect(searchQuery("https://duckduckgo.com/?q=rust+lifetimes")).toBe("rust lifetimes");
    expect(searchQuery("https://www.ecosia.org/search?q=oat+milk")).toBe("oat milk");
    expect(searchQuery("https://search.yahoo.com/search?p=train+times")).toBe("train times");
    expect(searchQuery("https://shop.example/search?q=usb-c+hub")).toBeNull();
    expect(searchQuery("https://www.google.com/maps?q=cafe")).toBeNull();
  });

  it("leave out anything private-looking", () => {
    expect(searchQuery("https://www.google.com/search?q=sore+throat+three+weeks")).toBeNull();
    expect(searchQuery("https://www.google.com/search?q=mira%40example.com")).toBeNull();
    expect(searchQuery("https://www.google.com/search?q=order+12345678")).toBeNull();
    expect(searchQuery("https://www.google.com/search?q=nordea+login")).toBeNull();
    expect(searchQuery("https://www.google.com/search?q=")).toBeNull();
  });

  it("are counted with when, and shown in their session, without the search engine as a site", () => {
    const digest = digestOf({
      visits: [1, 4, 6].map((daysAgo) => visit("https://www.google.com/search?q=best+usb-c+hub", "best usb-c hub - Google Search", at(daysAgo, 21))),
    });
    const { searches, sessions } = digest.data as Record<string, Array<Record<string, unknown>>>;
    expect(searches).toEqual([expect.objectContaining({ id: "q1", query: "best usb-c hub", times: 3, days: 3 })]);
    expect(sessions[0].pages).toEqual([{ searched: "best usb-c hub" }]);
    expect(digest.evidence.get("q1")?.hosts).toEqual([]);
    expect(digest.allHosts).toEqual([]);
  });
});

describe("chats, routines, the flock and feedback", () => {
  it("say how each went, with ids", () => {
    const { chats, routines, flock, feedback } = data({
      chats: [
        { id: "a", title: "Cheap flights to Lisbon", updatedAt: at(1, 9), outcome: "failed" },
        { id: "b", title: "Summarise the report", updatedAt: at(2, 9), outcome: "done" },
      ],
      routines: [{ id: "r", name: "Price watch", schedule: "Every day at 07:00", sites: ["prisjakt.nu"], runs: [{ status: "failed", startedAt: at(1, 7) }, { status: "failed", startedAt: at(2, 7) }] }],
      mascots: [{ name: "Ada", sites: ["github.com"] }],
      feedback: [{ verdict: "dismissed", kind: "prompt", line: "Shall I read Hacker News?", body: "Read it", sites: ["news.ycombinator.com"], at: at(1, 9) }],
    });
    expect(chats).toEqual([expect.objectContaining({ id: "c1", title: "Cheap flights to Lisbon", outcome: "failed" }), expect.not.objectContaining({ outcome: expect.anything() })]);
    expect(routines[0]).toMatchObject({ id: "r1", name: "Price watch", lastRuns: [{ result: "failed" }, { result: "failed" }] });
    expect(flock).toEqual([{ id: "m1", name: "Ada", sites: ["github.com"] }]);
    expect(feedback[0]).toMatchObject({ id: "f1", dismissed: true, line: "Shall I read Hacker News?" });
  });
});
