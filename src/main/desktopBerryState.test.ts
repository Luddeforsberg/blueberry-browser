import { describe, expect, it } from "vitest";
import { desktopFace, firstLine, readingTime, type DesktopFacts } from "./desktopBerryState";
import type { MascotProfile, NeedsYouItem } from "../shared/library";
import { BERRY } from "../shared/mascots";

const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout" };

const facts = (over: Partial<DesktopFacts> = {}): DesktopFacts => ({
  needsYou: [],
  results: [],
  running: [],
  chosen: BERRY,
  mascot: (id) => (id === SCOUT.id ? SCOUT : BERRY),
  nameOf: ({ name }) => name,
  ...over,
});

const asking = (id: string, kind: Partial<NeedsYouItem["approval"]> = {}): NeedsYouItem =>
  ({ id: "chat", mascotId: SCOUT.id, approval: { id, text: "Click Place order on shop.example", ...kind } }) as NeedsYouItem;

describe("firstLine", () => {
  it("has nothing to say about nothing", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("  \n ")).toBe("");
    expect(firstLine("```\ncode\n```")).toBe("");
  });

  it("takes the first sentence, as plain words", () => {
    expect(firstLine("Found **three** flights under €2.50. The cheapest leaves at 05:40.")).toBe("Found three flights under €2.50.");
    expect(firstLine("## Results\n\n- See [the list](https://example.com/a?b=c) for more\n- Another")).toBe("See the list for more");
    expect(firstLine("| a | b |\n|---|---|\nNo table here")).toBe("No table here");
  });

  it("only cuts past the limit, and at a word", () => {
    expect(firstLine("a".repeat(90))).toHaveLength(90);
    expect(firstLine("a".repeat(91))).toBe(`${"a".repeat(89)}…`);
    expect(firstLine(`${"word ".repeat(30)}`)).toMatch(/word…$/);
    expect(firstLine(`${"word ".repeat(30)}`).length).toBeLessThanOrEqual(90);
  });

  it("goes past a line that only leads in to a list", () => {
    expect(firstLine("Here are the top stories:\n\n1. Rust 2.0 is out\n2. Another")).toBe("Rust 2.0 is out");
    expect(firstLine("Here's what I found:")).toBe("Here's what I found:");
  });

  it("doesn't end a sentence early or leave markup behind", () => {
    expect(firstLine("Use e.g. the red one, which costs 2.50. Then stop.")).toBe("Use e.g. the red one, which costs 2.50.");
    expect(firstLine("See `snake_case` and __this__ on https://www.example.com/a/b?c=d today")).toBe("See snake_case and this on example.com today");
    expect(firstLine("*One* thing<br>and **two**")).toBe("One thing and two");
    expect(firstLine("~~Old~~ price")).toBe("Old price");
  });

  it("doesn't end a cut on a stray comma or dash", () => {
    expect(firstLine(`${"a".repeat(40)} ${"b".repeat(40)}, ${"c".repeat(40)}`)).toBe(`${"a".repeat(40)} ${"b".repeat(40)}…`);
  });
});

describe("readingTime", () => {
  it("is long enough for a few words, and has an end", () => {
    expect(readingTime("")).toBe(5000);
    expect(readingTime("Done.")).toBe(5000);
    expect(readingTime("a".repeat(90))).toBe(9300);
    expect(readingTime("a".repeat(500))).toBe(12000);
  });
});

describe("desktopFace", () => {
  it("rests as whoever the next job goes to", () => {
    expect(desktopFace(facts({ chosen: SCOUT }))).toMatchObject({ mood: "rest", name: "Scout", line: null, target: null });
  });

  it("flies while something is working, and is whoever is working", () => {
    expect(desktopFace(facts({ running: [{ chatId: "c", mascotId: SCOUT.id, title: "Flights" }] }))).toMatchObject({ mood: "fetching", name: "Scout", sign: "working", announce: null, target: { page: "chat", chatId: "c" } });
    expect(desktopFace(facts({ running: [{ chatId: null, mascotId: SCOUT.id, title: "A routine" }] }))).toMatchObject({ target: null });
  });

  it("says who finished, and asking comes first", () => {
    const results = [
      { chatId: "a", mascotId: BERRY.id, text: "First.", failed: false },
      { chatId: "b", mascotId: SCOUT.id, text: "Second.", failed: false },
    ];
    expect(desktopFace(facts({ results }))).toMatchObject({ mood: "delivered", name: "Scout", target: { page: "chat", chatId: "b" }, line: "Second. And 1 more finished.", sign: null });
    expect(desktopFace(facts({ results, needsYou: [asking("x")] }))).toMatchObject({ mood: "asking", target: { page: "needs-you", approvalId: "x" }, sign: "waiting", announce: "asking:x" });
  });

  it("shows a failure as one", () => {
    expect(desktopFace(facts({ results: [{ chatId: "a", mascotId: BERRY.id, text: "Couldn't reach the model.", failed: true }] }))).toMatchObject({ mood: "oops" });
  });

  it("says who and what kind of thing it waits for, never the exact words", () => {
    const words = (item: NeedsYouItem, more: NeedsYouItem[] = []) => desktopFace(facts({ needsYou: [item, ...more] })).line;
    expect(words(asking("x"))).toBe("Scout needs your OK.");
    expect(words(asking("x", { question: true }))).toBe("Scout has a question for you.");
    expect(words(asking("x", { handoff: { need: "sign-in", tabId: "t", site: "github.com" } }))).toBe("Scout needs you to sign in.");
    expect(words(asking("x"), [asking("y")])).toBe("Scout needs your OK. And 1 more is waiting.");
    expect(words(asking("x"), [asking("y"), asking("z")])).toBe("Scout needs your OK. And 2 more are waiting.");
  });
});
