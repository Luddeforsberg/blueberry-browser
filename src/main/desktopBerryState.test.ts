import { describe, expect, it } from "vitest";
import {
  checkDecision,
  desktopAsk,
  desktopCloud,
  desktopDrop,
  desktopTray,
  desktopWhere,
  firstLine,
  readingTime,
  type DesktopFacts,
  type DesktopRunning,
  type ShownAsk,
  type TrayTarget,
} from "./desktopBerryState";
import type { MascotProfile, NeedsYouItem } from "../shared/library";
import { BERRY } from "../shared/mascots";

const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout", look: { palette: "robin", accessory: "none" } };

const facts = (over: Partial<DesktopFacts> = {}): DesktopFacts => ({
  needsYou: [],
  results: [],
  running: [],
  finishedToday: [],
  chosen: BERRY,
  mascot: (id) => (id === SCOUT.id ? SCOUT : BERRY),
  nameOf: ({ name }) => name,
  ...over,
});

const asking = (id: string, kind: Partial<NeedsYouItem["approval"]> = {}): NeedsYouItem =>
  ({ id: "chat", mascotId: SCOUT.id, job: "A job", approval: { id, text: "Click Place order on shop.example", ...kind } }) as NeedsYouItem;

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

describe("desktopDrop", () => {
  const working = (chatId: string, mascotId = SCOUT.id, title = "Flights"): DesktopRunning => ({ chatId, routineId: null, mascotId, title, since: 1000 });
  const result = (chatId: string, mascotId = BERRY.id, failed = false) => ({ chatId, mascotId, text: `Reply from ${chatId}.`, failed });
  const drop = (over: Partial<DesktopFacts>, how: Partial<{ pointed: boolean; announcing: string | null; shortcut: boolean }> = {}) =>
    desktopDrop(facts(over), { pointed: false, announcing: null, shortcut: true, ...how });

  it("rests small as whoever the next job goes to, and says nothing until pointed at", () => {
    expect(drop({ chosen: SCOUT })).toEqual({ faces: [{ name: "Scout", look: SCOUT.look, mood: "rest" }], working: false, says: { kind: "rest" } });
    expect(drop({ chosen: SCOUT }, { pointed: true }).says).toEqual({ kind: "job", shortcut: true });
    expect(drop({}, { pointed: true, shortcut: false }).says).toEqual({ kind: "job", shortcut: false });
  });

  it("works with its pips and says nothing more by itself, and pointed at, only the job's name and how long", () => {
    expect(drop({ running: [working("c")] })).toMatchObject({ faces: [{ name: "Scout", mood: "fetching" }], working: true, says: { kind: "rest" } });
    expect(drop({ running: [working("c")] }, { pointed: true }).says).toEqual({ kind: "working", title: "Flights", since: 1000 });
  });

  it("comes out by itself for an ask, saying who and what kind of thing, never the words or the site", () => {
    const ask = asking("x", { text: "Click Place order on https://shop.example/cart?secret=1" });
    const { says, faces } = drop({ needsYou: [ask], running: [working("c", BERRY.id)] });
    expect(says).toEqual({ kind: "asking", words: "Scout needs your OK" });
    expect(faces[0]).toMatchObject({ name: "Scout", mood: "asking" });
    expect(JSON.stringify(says)).not.toMatch(/shop|Place order|secret/);
    expect(drop({ needsYou: [asking("x", { question: true })] }).says).toEqual({ kind: "asking", words: "Scout has a question for you" });
    const handoff = drop({ needsYou: [asking("x", { handoff: { need: "sign-in", tabId: "t", site: "github.com" } })] }).says;
    expect(handoff).toEqual({ kind: "asking", words: "Scout needs you to sign in" });
  });

  it("says a job that waits for you once, as asking, and not as working too", () => {
    const waiting = asking("x");
    const view = drop({ needsYou: [waiting], running: [working(waiting.id)] }, { pointed: true });
    expect(view.faces.map(({ mood }) => mood)).toEqual(["asking"]);
    expect(view.working).toBe(false);
    const routine = { ...asking("y"), id: "run-1", routineId: "routine-1" } as NeedsYouItem;
    expect(drop({ needsYou: [routine], running: [{ chatId: null, routineId: "routine-1", mascotId: SCOUT.id, title: "Morning" }] }).faces).toHaveLength(1);
    expect(desktopTray(facts({ needsYou: [waiting], running: [working(waiting.id)] }), [SCOUT], () => "k").working).toEqual([]);
  });

  it("says a finished reply's first sentence only while it's come out, and asking comes first", () => {
    const results = [result("a"), result("b", SCOUT.id)];
    expect(drop({ results }, { announcing: "b" }).says).toEqual({ kind: "finished", text: "Reply from b." });
    expect(drop({ results }).says).toEqual({ kind: "rest" });
    expect(drop({ results, needsYou: [asking("x")] }, { announcing: "b" }).says.kind).toBe("asking");
    // One that has been seen or dismissed isn't there to say.
    expect(drop({ results: [result("a")] }, { announcing: "gone" }).says).toEqual({ kind: "rest" });
  });

  it("stacks up to three faces, asking, then finished, then working, and counts them when pointed at", () => {
    const several = { needsYou: [], results: [result("a", BERRY.id, true)], running: [working("c"), working("d", BERRY.id), working("e")] };
    const { faces, says } = drop(several, { pointed: true });
    expect(faces.map(({ mood }) => mood)).toEqual(["oops", "fetching", "fetching"]);
    expect(says).toEqual({ kind: "counts", counts: ["1 finished", "3 working"] });
    expect(drop({ ...several, needsYou: [asking("x")] }).faces.map(({ mood }) => mood)).toEqual(["asking", "oops", "fetching"]);
    expect(drop({ running: [working("c"), working("d")] }, { pointed: true }).says).toEqual({ kind: "counts", counts: ["2 working"] });
  });
});

describe("desktopTray", () => {
  const keys: TrayTarget[] = [];
  const keyFor = (target: TrayTarget) => {
    keys.push(target);
    return `k${keys.length}`;
  };

  it("keys each row with nothing that names a chat or an approval, and keeps what each key opens", () => {
    keys.length = 0;
    const tray = desktopTray(
      facts({
        needsYou: [{ ...asking("approval-1"), id: "chat-1", askedAt: 5 }],
        running: [{ chatId: "chat-2", routineId: null, mascotId: BERRY.id, title: "Flights", step: "Read klm.com", since: 9 }, { chatId: null, routineId: "routine-1", mascotId: BERRY.id, title: "Morning" }],
        finishedToday: [
          { chatId: "chat-3", mascotId: BERRY.id, title: "Older", problem: null, endedAt: 1 },
          { chatId: "chat-4", mascotId: SCOUT.id, title: "Newer", problem: "A site didn’t load", endedAt: 2 },
        ],
      }),
      [BERRY, SCOUT],
      keyFor
    );
    expect(JSON.stringify(tray)).not.toMatch(/chat-\d|approval-1|routine-1/);
    expect(tray.asks).toEqual([{ name: "Scout", look: SCOUT.look, mood: "asking", key: "k1", words: "Scout needs your OK", since: 5 }]);
    expect(tray.working.map(({ title, step }) => [title, step])).toEqual([["Flights", "Read klm.com"], ["Morning", null]]);
    expect(tray.finished.map(({ title, mood }) => [title, mood])).toEqual([["Newer", "oops"], ["Older", "delivered"]]);
    expect(keys).toEqual([
      { kind: "ask", chatId: "chat-1", approvalId: "approval-1" },
      { kind: "open", target: { page: "chat", chatId: "chat-2" } },
      { kind: "open", target: { page: "routine", routineId: "routine-1" } },
      { kind: "open", target: { page: "chat", chatId: "chat-4" } },
      { kind: "open", target: { page: "chat", chatId: "chat-3" } },
    ]);
    expect(tray.flock).toEqual([
      { name: "Berry", look: BERRY.look, mood: "fetching", chosen: true },
      { name: "Scout", look: SCOUT.look, mood: "asking", chosen: false },
    ]);
  });
});

describe("desktopAsk", () => {
  it("shows the exact words in full, and a handoff's site, only once it's asked for", () => {
    const item = { ...asking("x", { text: "Click the button “Place order” on https://shop.example/cart" }), job: "Find a cable" } as NeedsYouItem;
    expect(desktopAsk(item, { name: "Scout", look: SCOUT.look, mood: "asking" })).toMatchObject({ kind: "approval", text: "Click the button “Place order” on https://shop.example/cart", answers: [], handoff: null, job: "Find a cable" });
    expect(desktopAsk(asking("x", { question: true, text: "Which size?", answers: ["S", "M"] }), { name: "Scout", look: SCOUT.look, mood: "asking" })).toMatchObject({ kind: "question", answers: ["S", "M"] });
    expect(desktopAsk(asking("x", { handoff: { need: "code", tabId: "t", site: "bank.example" } }), { name: "Scout", look: SCOUT.look, mood: "asking" })).toMatchObject({ kind: "handoff", handoff: { need: "code", site: "bank.example" } });
  });
});

describe("checkDecision", () => {
  const shown = (item: NeedsYouItem, decided = false): ShownAsk => ({ item: structuredClone(item), decided });
  const approval = asking("a1");
  const question = asking("q1", { question: true, text: "Which size?", answers: ["S", "M"] });

  it("sends a decision to the ask that was shown, and only that one", () => {
    expect(checkDecision(shown(approval), [approval], { allow: true })).toEqual({ ok: true, chatId: "chat", approvalId: "a1", allow: true });
    expect(checkDecision(shown(approval), [approval], { allow: false })).toEqual({ ok: true, chatId: "chat", approvalId: "a1", allow: false });
    // Whatever else is waiting, older or newer.
    const other = { ...asking("b1"), id: "other-chat" } as NeedsYouItem;
    expect(checkDecision(shown(approval), [other, approval], { allow: true })).toEqual({ ok: true, chatId: "chat", approvalId: "a1", allow: true });
    expect(checkDecision(shown(other), [approval, other], { allow: false })).toEqual({ ok: true, chatId: "other-chat", approvalId: "b1", allow: false });
  });

  it("sends nothing twice, nothing with no ask shown, and nothing once it's gone or another is waiting in its place", () => {
    expect(checkDecision(null, [approval], { allow: true })).toEqual({ ok: false, why: "gone" });
    expect(checkDecision(shown(approval, true), [approval], { allow: true })).toEqual({ ok: false, why: "gone" });
    expect(checkDecision(shown(approval), [], { allow: true })).toEqual({ ok: false, why: "gone" });
    expect(checkDecision(shown(approval), [asking("a2")], { allow: true })).toEqual({ ok: false, why: "gone" });
  });

  it("sends nothing if the ask has changed since it was shown", () => {
    expect(checkDecision(shown(approval), [{ ...approval, approval: { ...approval.approval, text: "Click Delete account" } }], { allow: true })).toEqual({ ok: false, why: "gone" });
    expect(checkDecision(shown(question), [{ ...question, approval: { ...question.approval, answers: ["S", "M", "Delete"] } }], { allow: true, answer: "S" })).toEqual({ ok: false, why: "gone" });
  });

  it("never answers a handoff from here", () => {
    const handoff = asking("h1", { handoff: { need: "sign-in", tabId: "t", site: "github.com" } });
    expect(checkDecision(shown(handoff), [handoff], { allow: true })).toEqual({ ok: false, why: "not-here" });
    expect(checkDecision(shown(handoff), [handoff], { allow: false })).toEqual({ ok: false, why: "not-here" });
  });

  it("answers a question in words, skips it with none, and sends nothing shaped like a code", () => {
    expect(checkDecision(shown(question), [question], { allow: true, answer: "Medium, please" })).toEqual({ ok: true, chatId: "chat", approvalId: "q1", allow: true, answer: "Medium, please" });
    expect(checkDecision(shown(question), [question], { allow: false })).toEqual({ ok: true, chatId: "chat", approvalId: "q1", allow: false });
    expect(checkDecision(shown(question), [question], { allow: true, answer: "482 913" })).toEqual({ ok: false, why: "code" });
    expect(checkDecision(shown(question), [question], { allow: true, answer: "AB12CD" })).toEqual({ ok: false, why: "code" });
    expect(checkDecision(shown(question), [question], { allow: true })).toEqual({ ok: false, why: "invalid" });
    expect(checkDecision(shown(question), [question], { allow: true, answer: "   " })).toEqual({ ok: false, why: "invalid" });
  });

  it("takes only a plain decision", () => {
    expect(checkDecision(shown(approval), [approval], null)).toEqual({ ok: false, why: "invalid" });
    expect(checkDecision(shown(approval), [approval], { allow: "yes" })).toEqual({ ok: false, why: "invalid" });
    expect(checkDecision(shown(approval), [approval], { allow: true, answer: "Yes" })).toEqual({ ok: false, why: "invalid" });
    expect(checkDecision(shown(question), [question], { allow: true, answer: 5 })).toEqual({ ok: false, why: "invalid" });
  });
});

describe("desktopCloud", () => {
  const reads = { tools: [] as MascotProfile["tools"], worksInCloud: true };
  const visits = { tools: ["visit"] as MascotProfile["tools"], worksInCloud: false };

  it("offers the cloud as the new tab does, and starts on it for a mascot set to work there", () => {
    expect(desktopCloud(visits, { runner: false, cloud: false })).toEqual({ fits: false, on: false });
    expect(desktopCloud(visits, { runner: false, cloud: true })).toEqual({ fits: true, on: false });
    expect(desktopCloud({ ...visits, worksInCloud: true }, { runner: true, cloud: false })).toEqual({ fits: true, on: true });
    // One that only reads the page in front has no use for it.
    expect(desktopCloud(reads, { runner: true, cloud: true })).toEqual({ fits: false, on: false });
  });

  it("sends a job to the runner whenever there is one, and never where it can't go", () => {
    expect(desktopWhere(visits, { runner: true, cloud: true }, true)).toEqual({ runner: true, cloud: false });
    expect(desktopWhere(visits, { runner: false, cloud: true }, true)).toEqual({ runner: false, cloud: true });
    expect(desktopWhere(visits, { runner: true, cloud: true }, false)).toEqual({ runner: false, cloud: false });
    expect(desktopWhere(reads, { runner: true, cloud: true }, true)).toEqual({ runner: false, cloud: false });
    expect(desktopWhere(visits, { runner: false, cloud: false }, true)).toEqual({ runner: false, cloud: false });
  });
});
