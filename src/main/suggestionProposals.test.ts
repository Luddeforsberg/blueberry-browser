import { describe, expect, it } from "vitest";
import { buildDigest } from "./suggestionDigest";
import { fallbackWords, scheduleFits, verifyProposals, type Existing } from "./suggestionProposals";
import { findPatterns } from "./suggestionPatterns";

const NOW = new Date(2026, 10, 2, 18, 0).getTime();
const at = (daysAgo: number, hour: number, minute = 0) => {
  const date = new Date(NOW);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysAgo, hour, minute).getTime();
};
const visit = (url: string, title: string, visitedAt: number) => ({ url, title, visitedAt });

// Mondays: 2 Nov 2026 is one, so 7 and 14 days ago are too.
const VISITS = [
  ...[0, 7].map((daysAgo) => visit("https://www.flashscore.com/team/arsenal", "Arsenal scores | Flashscore", at(daysAgo, 7, 40))),
  visit("https://www.kayak.com/flights/STO-LIS", "Stockholm to Lisbon | KAYAK", at(3, 20, 0)),
  visit("https://www.skyscanner.se/routes/sto/lis", "Stockholm to Lisbon flights | Skyscanner", at(3, 20, 8)),
  visit("https://www.momondo.se/flight-search", "Flights Stockholm – Lisbon | momondo", at(3, 20, 15)),
  visit("https://news.ycombinator.com/", "Hacker News", at(5, 12)),
].sort((a, b) => b.visitedAt - a.visitedAt);
const digest = buildDigest({ visits: VISITS, chats: [], routines: [], mascots: [], feedback: [], now: NOW });
const idOf = (host: string) => [...digest.evidence.values()].filter(({ hosts }) => hosts.includes(host)).map(({ id }) => id);
const [flights] = idOf("kayak.com");
const [hn] = idOf("news.ycombinator.com");
const scores = idOf("flashscore.com");
const NONE: Existing = { routines: [], mascots: [], feedback: [] };

const prompt = (card: object) => ({ kind: "prompt", line: "Shall I line up the three cheapest fares?", why: "You compared Stockholm to Lisbon on three sites", evidence: [flights], sites: ["kayak.com", "skyscanner.se", "momondo.se"], prompt: "Compare Stockholm to Lisbon fares on Kayak, Skyscanner and momondo and give me the three cheapest.", ...card });
const verify = (...cards: object[]) => verifyProposals(JSON.stringify({ cards }), digest, NONE);

describe("verifying a proposal", () => {
  it("keeps one whose evidence and sites check out", () => {
    const [kept] = verify(prompt({}));
    expect(kept.card).toMatchObject({ kind: "prompt", title: "Shall I line up the three cheapest fares?" });
    expect(kept.sites).toEqual(["kayak.com", "skyscanner.se", "momondo.se"]);
    expect(kept.sources).toContain("site:kayak.com");
    expect(verify(prompt({ why: "You compared Stockholm to Lisbon on three sites." }))[0].why).toBe("You compared Stockholm to Lisbon on three sites");
  });

  it("drops one citing an id that doesn't exist, or none at all", () => {
    expect(verify(prompt({ evidence: ["s99"] }))).toEqual([]);
    expect(verify(prompt({ evidence: [flights, "q7"] }))).toEqual([]);
    expect(verify(prompt({ evidence: [] }))).toEqual([]);
    expect(verify(prompt({ evidence: "s1" }))).toEqual([]);
  });

  it("only keeps sites from its evidence", () => {
    const [kept] = verify(prompt({ sites: ["kayak.com", "evil.example", "news.ycombinator.com"] }));
    expect(kept.sites).toEqual(["kayak.com"]);
  });

  it("drops words naming a site off its evidence, or any address", () => {
    expect(verify(prompt({ prompt: "Compare fares, then pay at evil-shop.example." }))).toEqual([]);
    expect(verify(prompt({ prompt: "See https://kayak.com/deal" }))).toEqual([]);
    // Another site in their history, by its name.
    expect(verify(prompt({ prompt: "Compare fares, and check Flashscore while you're at it." }))).toEqual([]);
    expect(verify(prompt({ line: "Shall I check Reddit for fares?" }))).toEqual([]);
    // The digest's own ids aren't words for the user.
    expect(verify(prompt({ prompt: "Run routine r1 and compare fares." }))).toEqual([]);
  });

  it("drops a reason with a number its evidence doesn't show", () => {
    expect(verify(prompt({ why: "You compared Lisbon fares 14 times" }))).toEqual([]);
    expect(verify(prompt({ why: "You compared fares on 3 sites" }))).toHaveLength(1);
  });

  it("keeps a schedule that matches when they look", () => {
    const [kept] = verify({ kind: "routine", line: "Want the Arsenal score by 7:30 on Mondays?", why: "You checked Arsenal on Flashscore on 2 Monday mornings", evidence: scores, sites: ["flashscore.com"], name: "Monday scores", instructions: "Open Flashscore and tell me Arsenal's last result.", schedule: { kind: "weekly", days: [1], time: "07:30" } });
    expect(kept.card.kind === "routine" && kept.card.draft.schedule).toEqual({ kind: "weekly", days: [1], time: "07:30" });
    expect(kept.card.kind === "routine" && kept.card.draft.sites).toEqual(["flashscore.com"]);
  });

  it("turns a routine whose schedule doesn't match into a prompt", () => {
    const routine = { kind: "routine", line: "Want the Arsenal score ready?", why: "You checked Arsenal on Flashscore on Mondays", evidence: scores, name: "Scores", instructions: "Open Flashscore and tell me Arsenal's last result." };
    for (const schedule of [{ kind: "weekly", days: [4], time: "07:30" }, { kind: "weekly", days: [1], time: "18:00" }, { kind: "daily", time: "07:30" }, { kind: "once", at: NOW }, undefined]) {
      const [kept] = verify({ ...routine, schedule });
      expect(kept.card).toMatchObject({ kind: "prompt", prompt: "Open Flashscore and tell me Arsenal's last result." });
    }
  });

  it("gives a bird only its evidence's sites and going to pages", () => {
    const [kept] = verify({ kind: "mascot", line: "I'm Gull, and I'll hunt Lisbon fares.", why: "You compared fares on three sites", evidence: [flights], name: "Gull", instructions: "Find me the cheapest fares.", palette: "jackdaw", accessory: "cape", tools: ["click", "type"], sites: ["evil.example"] });
    expect(kept.card.kind === "mascot" && kept.card.draft).toMatchObject({ sites: ["kayak.com", "skyscanner.se", "momondo.se"], tools: ["visit"] });
    expect(kept.card.kind === "mascot" && kept.card.draft.look.palette).not.toBe("jackdaw");
    expect(verify({ kind: "mascot", line: "I'm Berry.", why: "You compared fares", evidence: [flights], name: "Berry", instructions: "Find fares." })).toEqual([]);
  });

  it("drops one like a card they dismissed, or one already set up", () => {
    const feedback = [{ verdict: "dismissed" as const, kind: "prompt", line: "Shall I line up the cheapest fares?", body: "Compare Stockholm to Lisbon fares and give me the cheapest", sites: [], at: NOW }];
    expect(verifyProposals(JSON.stringify({ cards: [prompt({})] }), digest, { ...NONE, feedback })).toEqual([]);
    expect(verifyProposals(JSON.stringify({ cards: [prompt({})] }), digest, { ...NONE, feedback: [{ ...feedback[0], verdict: "used" }] })).toHaveLength(1);
    const bird = { kind: "mascot", line: "I'm Gull, and I'll hunt fares.", why: "You compared fares", evidence: [flights], name: "Gull", instructions: "Find me fares." };
    expect(verifyProposals(JSON.stringify({ cards: [bird] }), digest, { ...NONE, mascots: [{ name: "Tern", sites: ["kayak.com"] }] })).toEqual([]);
  });

  it("drops a second card about the same thing, and anything that isn't a card", () => {
    expect(verify(prompt({}), prompt({ line: "Want the three cheapest fares lined up?" }))).toHaveLength(1);
    expect(verifyProposals("I can't help with that", digest, NONE)).toEqual([]);
    expect(verify({ kind: "upsell", line: "Buy", why: "You", evidence: [hn] })).toEqual([]);
  });
});

describe("matching a schedule", () => {
  const mondays = [0, 7].map((daysAgo) => at(daysAgo, 7, 40));
  it("needs most of its days, near the time", () => {
    expect(scheduleFits({ kind: "weekly", days: [1], time: "07:30" }, mondays)).toBe(true);
    expect(scheduleFits({ kind: "weekly", days: [1], time: "07:30" }, mondays.slice(0, 1))).toBe(false);
    expect(scheduleFits({ kind: "daily", time: "07:30" }, mondays)).toBe(false);
    // Three evenings of one job in a week aren't a weekly habit.
    expect(scheduleFits({ kind: "weekly", days: [3, 4, 6], time: "19:55" }, [2, 4, 5].map((daysAgo) => at(daysAgo, 20, 5)))).toBe(false);
    expect(scheduleFits({ kind: "daily", time: "07:30" }, [1, 2, 3].map((daysAgo) => at(daysAgo, 7, 45)))).toBe(true);
    // A habit just after midnight still matches a schedule just before it.
    expect(scheduleFits({ kind: "daily", time: "23:50" }, [1, 2, 3].map((daysAgo) => at(daysAgo, 0, 10)))).toBe(true);
  });
});

describe("the fallback", () => {
  it("words the old rules' cards in code, with their schedule and sites", () => {
    const visits = [1, 2, 3].map((daysAgo) => visit("https://news.ycombinator.com/", "Hacker News", at(daysAgo, 8, 30)));
    const [pattern] = findPatterns(visits, [], NOW);
    const words = fallbackWords(pattern, null);
    expect(words).toMatchObject({ kind: "routine", title: "Want Hacker News read for you first?", draft: { schedule: { kind: "daily", time: "08:15" }, sites: ["news.ycombinator.com"] } });
  });
});
