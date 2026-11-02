import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { Suggestions } from "./Suggestions";

const MINUTE = 60_000;
const NOW = new Date(2026, 9, 31, 18, 0).getTime();
const VISITS = [1, 2, 3].map((daysAgo) => ({ url: "https://news.ycombinator.com/", title: "Hacker News", visitedAt: NOW - daysAgo * 1440 * MINUTE }));
const CARD = JSON.stringify({ cards: [{ kind: "prompt", line: "Shall I pick five stories for you?", why: "You read Hacker News most days", evidence: ["s1"], sites: ["news.ycombinator.com"], prompt: "Read the Hacker News front page and pick five stories for me." }] });

const setup = () => {
  const file = join(mkdtempSync(join(tmpdir(), "blueberry-suggestions-")), "suggestions.json");
  let now = NOW;
  let visits = VISITS;
  let hasModel = true;
  const write = vi.fn<(system: string, data: string) => Promise<string>>();
  const suggestions = new Suggestions(file, {
    enabled: () => true,
    visits: () => visits,
    chats: () => [],
    routines: () => [],
    runs: () => [],
    mascots: () => [],
    hasModel: () => hasModel,
    write,
    onChanged: () => {},
    now: () => now,
  });
  // `list` doesn't wait for the model, so this lets a try end before the next.
  const newTabAt = async (minutes: number) => {
    now = NOW + minutes * MINUTE;
    const cards = suggestions.list();
    await vi.waitFor(() => expect(write.mock.results.every(({ type }) => type !== "incomplete")).toBe(true));
    await new Promise((resolve) => setImmediate(resolve));
    return cards;
  };
  const addSite = (host: string) => {
    visits = [...visits, ...VISITS.map((visit) => ({ ...visit, url: `https://${host}/`, title: host }))];
  };
  return { file, write, newTabAt, addSite, suggestions, noModel: () => (hasModel = false) };
};

describe("asking the model for suggestions", () => {
  it("shows the old rules' cards until the model's check out, and then the model's", async () => {
    const { write, newTabAt } = setup();
    write.mockResolvedValueOnce(CARD);
    const before = await newTabAt(0);
    expect(before).toEqual([expect.objectContaining({ kind: "routine", why: expect.stringContaining("Hacker News") })]);
    expect(write.mock.calls[0][1]).toMatch(/^<browsing_digest>\n\{.*\}\n<\/browsing_digest>$/s);
    expect(await newTabAt(1)).toEqual([expect.objectContaining({ kind: "prompt", title: "Shall I pick five stories for you?", why: "You read Hacker News most days" })]);
  });

  it("keeps the old rules' cards when the model gives nothing that checks out, and counts that for the hour", async () => {
    const { write, newTabAt } = setup();
    write.mockResolvedValueOnce(JSON.stringify({ cards: [{ kind: "prompt", line: "Hi", why: "You", evidence: ["s42"], prompt: "Do it" }] }));
    await newTabAt(0);
    expect(await newTabAt(1)).toEqual([expect.objectContaining({ kind: "routine" })]);
    await newTabAt(59);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("has the old rules' cards with no model at all", async () => {
    const { write, newTabAt, noModel } = setup();
    noModel();
    expect(await newTabAt(0)).toEqual([expect.objectContaining({ kind: "routine", title: "Want Hacker News read for you first?" })]);
    expect(write).not.toHaveBeenCalled();
  });

  it("treats a failed call as offline, tries again after a short wait, and saves nothing that would block a relaunch", async () => {
    const { file, write, newTabAt } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockRejectedValueOnce(new Error("offline"));
    expect(await newTabAt(0)).toHaveLength(1);
    await newTabAt(4.99);
    expect(write).toHaveBeenCalledTimes(1);
    expect(() => readFileSync(file, "utf8")).toThrow();
    write.mockResolvedValueOnce(CARD);
    await newTabAt(5);
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(file, "utf8")).askedAt).toBe(NOW + 5 * MINUTE);
    vi.restoreAllMocks();
  });

  it("lets one try through after an import, and holds the limit before and after it", async () => {
    const { write, newTabAt, addSite, suggestions } = setup();
    write.mockResolvedValue(CARD);
    await newTabAt(0);
    expect(write).toHaveBeenCalledTimes(1);

    // New to go on, but inside the hour.
    addSite("lobste.rs");
    await newTabAt(10);
    expect(write).toHaveBeenCalledTimes(1);

    suggestions.historyImported();
    await newTabAt(11);
    expect(write).toHaveBeenCalledTimes(2);

    addSite("tildes.net");
    await newTabAt(12);
    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe("what the user did with a card", () => {
  it("tells the model what was dismissed and used, and a dismissed card stays gone", async () => {
    const { write, newTabAt, suggestions } = setup();
    write.mockResolvedValueOnce(CARD);
    await newTabAt(0);
    const [card] = await newTabAt(1);
    suggestions.dismiss(card.id);
    // The model's card is gone, and so is the old rules' card on the same site.
    expect(await newTabAt(2)).toEqual([]);

    write.mockResolvedValueOnce(CARD);
    suggestions.historyImported();
    await newTabAt(3);
    const sent = write.mock.calls[1][1];
    expect(sent).toContain('"dismissed":true');
    expect(sent).toContain("Shall I pick five stories for you?");
    // The same card again doesn't get past the check.
    expect(await newTabAt(4)).toEqual([]);
  });

  it("records a used card apart from a dismissed one", async () => {
    const { file, write, newTabAt, suggestions } = setup();
    write.mockResolvedValueOnce(CARD);
    await newTabAt(0);
    const [card] = await newTabAt(1);
    suggestions.used(card.id);
    expect(JSON.parse(readFileSync(file, "utf8")).feedback).toEqual([expect.objectContaining({ verdict: "used", line: card.title })]);
  });

  it("drops a card once its history is gone", async () => {
    const { write, newTabAt } = setup();
    write.mockResolvedValueOnce(CARD);
    await newTabAt(0);
    expect(await newTabAt(1)).toEqual([expect.objectContaining({ kind: "prompt" })]);
    // Two weeks on, nothing it cited is in the digest.
    expect(await newTabAt(15 * 1440)).toEqual([]);
  });
});
