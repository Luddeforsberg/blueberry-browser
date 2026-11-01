import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { Suggestions } from "./Suggestions";

const MINUTE = 60_000;
const NOW = new Date(2026, 9, 31, 18, 0).getTime();
const VISITS = [1, 2, 3].map((daysAgo) => ({ url: "https://news.ycombinator.com/", title: "Hacker News", visitedAt: NOW - daysAgo * 1440 * MINUTE }));
const CARD = JSON.stringify({ cards: [{ id: "p1", title: "Five stories picked by 8:15", name: "Morning stories", instructions: "Read the front page and list five stories." }] });

const setup = () => {
  const file = join(mkdtempSync(join(tmpdir(), "blueberry-suggestions-")), "suggestions.json");
  let now = NOW;
  let visits = VISITS;
  const write = vi.fn<(system: string, data: string) => Promise<string>>();
  const suggestions = new Suggestions(file, {
    enabled: () => true,
    visits: () => visits,
    chats: () => [],
    routines: () => [],
    mascots: () => [],
    hasModel: () => true,
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
  return { file, write, newTabAt, addSite, suggestions };
};

describe("asking the model for suggestions", () => {
  it("doesn't count a try that gave no cards, and tries again after a short wait", async () => {
    const { file, write, newTabAt } = setup();
    write.mockResolvedValueOnce("NONE");
    await newTabAt(0);
    expect(write).toHaveBeenCalledTimes(1);

    // One new tab after another doesn't call it again, up to the last moment of the wait.
    await newTabAt(1);
    await newTabAt(4.99);
    expect(write).toHaveBeenCalledTimes(1);

    write.mockResolvedValueOnce(CARD);
    await newTabAt(5);
    expect(write).toHaveBeenCalledTimes(2);
    expect(await newTabAt(5.01)).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8")).askedAt).toBe(NOW + 5 * MINUTE);
  });

  it("treats a failed call like an empty one, and saves nothing that would block a relaunch", async () => {
    const { file, write, newTabAt } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockRejectedValueOnce(new Error("offline"));
    await newTabAt(0);
    await newTabAt(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(() => readFileSync(file, "utf8")).toThrow();
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
