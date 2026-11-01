import { describe, expect, it } from "vitest";
import { desktopFace, firstLine, type DesktopFacts } from "./desktopBerryState";
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
});

describe("desktopFace", () => {
  it("rests as whoever the next job goes to", () => {
    expect(desktopFace(facts({ chosen: SCOUT }))).toMatchObject({ mood: "rest", name: "Scout", line: null, target: null });
  });

  it("flies while something is working, and is whoever is working", () => {
    expect(desktopFace(facts({ running: [{ mascotId: SCOUT.id, title: "Flights" }] }))).toMatchObject({ mood: "fetching", name: "Scout", target: null, line: { lasting: false } });
  });

  it("says who finished, and asking comes first", () => {
    const results = [
      { chatId: "a", mascotId: BERRY.id, text: "First.", failed: false },
      { chatId: "b", mascotId: SCOUT.id, text: "Second.", failed: false },
    ];
    expect(desktopFace(facts({ results }))).toMatchObject({ mood: "delivered", name: "Scout", target: { page: "chat", chatId: "b" }, line: { text: "Second. And 1 more finished." } });
    expect(desktopFace(facts({ results, needsYou: [asking("x")] }))).toMatchObject({ mood: "asking", target: { page: "needs-you", approvalId: "x" }, line: { lasting: true } });
  });

  it("shows a failure as one", () => {
    expect(desktopFace(facts({ results: [{ chatId: "a", mascotId: BERRY.id, text: "Couldn't reach the model.", failed: true }] }))).toMatchObject({ mood: "oops" });
  });

  it("says who and what kind of thing it waits for, never the exact words", () => {
    const words = (item: NeedsYouItem, more: NeedsYouItem[] = []) => desktopFace(facts({ needsYou: [item, ...more] })).line?.text;
    expect(words(asking("x"))).toBe("Scout needs your OK.");
    expect(words(asking("x", { question: true }))).toBe("Scout has a question for you.");
    expect(words(asking("x", { handoff: { need: "sign-in", tabId: "t", site: "github.com" } }))).toBe("Scout needs you to sign in.");
    expect(words(asking("x"), [asking("y")])).toBe("Scout needs your OK. And 1 more is waiting.");
    expect(words(asking("x"), [asking("y"), asking("z")])).toBe("Scout needs your OK. And 2 more are waiting.");
  });
});
