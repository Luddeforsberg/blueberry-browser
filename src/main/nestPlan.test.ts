import { describe, expect, it } from "vitest";
import { allowedBefore, armedStep, checkPlan, NO_CARDS, PROMISED, promisesWork, replyState, retryable, runsState, sourcesState, type PlanSource } from "./nestPlan";
import { BERRY } from "../shared/mascots";

const FLOCK = [BERRY.id, "scout", "writer"];
const SOURCES: PlanSource[] = [
  { key: "e1", cardId: "card-with-table", table: true },
  { key: "e2", cardId: "card-with-words", table: false },
];

const card = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  bird: "scout",
  prompt: `Do ${key}`,
  from: null,
  for_each_row: false,
  waits_for_user: false,
  table_of: null,
  ...extra,
});

const plan = (...cards: object[]) => ({ reply: "That's two jobs.", ask: false, cards });
const check = (raw: unknown) => checkPlan(raw, { flock: FLOCK, sources: SOURCES });

describe("checkPlan", () => {
  it("keeps the plan's name for its section cleaned, and none when it gave none", () => {
    expect(check({ ...plan(card("c1"), card("c2")), section: " Competitor\n research " })).toMatchObject({ ok: true, section: "Competitor research" });
    expect(check(plan(card("c1"), card("c2")))).not.toHaveProperty("section");
    expect(check({ ...plan(card("c1")), section: 42 })).not.toHaveProperty("section");
    expect(check({ ...plan(card("c1")), section: "\u200b " })).not.toHaveProperty("section");
  });

  it("keeps a plan whose cards read from each other or from the board, sources first", () => {
    const result = check(
      plan(card("c2", { bird: "writer", from: "c1", for_each_row: true, waits_for_user: true }), card("c1", { table_of: "companies" }), card("c3", { from: "e1", bird: BERRY.id }))
    );
    expect(result).toEqual({
      ok: true,
      reply: "That's two jobs.",
      ask: false,
      cards: [
        { key: "c1", mascotId: "scout", prompt: "Do c1", from: [], each: false, waits: false, table: "companies", attached: [] },
        { key: "c2", mascotId: "writer", prompt: "Do c2", from: [{ plan: "c1" }], each: true, waits: true, table: null, attached: [] },
        { key: "c3", mascotId: null, prompt: "Do c3", from: [{ card: "card-with-table" }], each: false, waits: false, table: null, attached: [] },
      ],
    });
  });

  it("gives a card only files and notes the user attached to this request, each once", () => {
    const withFiles = (attached: unknown) => checkPlan(plan(card("c1", { attached })), { flock: FLOCK, sources: SOURCES, attached: ["a1", "a2"] });
    expect(withFiles(["a2", "a1"])).toMatchObject({ ok: true, cards: [{ attached: ["a2", "a1"] }] });
    expect(withFiles([])).toMatchObject({ ok: true, cards: [{ attached: [] }] });
    expect(withFiles(["a3"])).toEqual({ ok: false, problem: "it gave a card a file you didn’t attach" });
    expect(withFiles(["a1", "a1"])).toEqual({ ok: false, problem: "it gave a card a file you didn’t attach" });
    expect(withFiles([1])).toEqual({ ok: false, problem: "what came back wasn’t shaped like a plan" });
    // Nothing attached, nothing to give.
    expect(check(plan(card("c1", { attached: ["a1"] })))).toEqual({ ok: false, problem: "it gave a card a file you didn’t attach" });
  });

  it("refuses a bird that isn't in the flock, rather than making it Berry", () => {
    expect(check(plan(card("c1", { bird: "gone" })))).toEqual({ ok: false, problem: "it named a bird that isn’t in your flock" });
  });

  it("refuses cards that go round in a circle, a card that reads from itself too", () => {
    const circle = { ok: false, problem: "its cards went round in a circle" };
    expect(check(plan(card("c1", { from: "c3" }), card("c2", { from: "c1" }), card("c3", { from: "c2" })))).toEqual(circle);
    expect(check(plan(card("c1", { from: "c1" })))).toEqual(circle);
  });

  it("takes six new cards, and refuses seven", () => {
    const cards = (count: number) => Array.from({ length: count }, (_, index) => card(`c${index + 1}`));
    expect(check(plan(...cards(6))).ok).toBe(true);
    expect(check(plan(...cards(7)))).toEqual({ ok: false, problem: "it came to more than 6 cards" });
  });

  it("refuses For each row on anything that doesn't give a table", () => {
    const refused = { ok: false, problem: "For each row was on a card that doesn’t get a table" };
    // No line, a planned card with no table, and a board card whose answer has none.
    expect(check(plan(card("c1", { for_each_row: true })))).toEqual(refused);
    expect(check(plan(card("c1"), card("c2", { from: "c1", for_each_row: true })))).toEqual(refused);
    expect(check(plan(card("c1", { from: "e2", for_each_row: true })))).toEqual(refused);
    // A board card whose answer has a table is fine.
    expect(check(plan(card("c1", { from: "e1", for_each_row: true }))).ok).toBe(true);
  });

  it("lets For each row run on a planned For-each card, whose table gets another column", () => {
    const chained = check(plan(card("c1", { table_of: "companies" }), card("c2", { from: "c1", for_each_row: true }), card("c3", { from: "c2", for_each_row: true })));
    expect(chained.ok && chained.cards.map((each) => [each.key, each.each])).toEqual([
      ["c1", false],
      ["c2", true],
      ["c3", true],
    ]);
  });

  it("refuses a line to a card that isn't in the plan or on the board", () => {
    expect(check(plan(card("c1", { from: "e9" })))).toEqual({ ok: false, problem: "a line went to a card that isn’t there" });
  });

  it("refuses anything not shaped like a plan, an empty job, and a key used twice", () => {
    const shape = { ok: false, problem: "what came back wasn’t shaped like a plan" };
    expect(check(null)).toEqual(shape);
    expect(check({ reply: "Hi", ask: false })).toEqual(shape);
    expect(check(plan(card("c1", { for_each_row: "yes" })))).toEqual(shape);
    expect(check(plan(card("c1"), card("c1")))).toEqual(shape);
    expect(check(plan(card("e1")))).toEqual(shape);
    expect(check(plan(card("c1", { prompt: "  " })))).toEqual({ ok: false, problem: "a card had no clear job" });
  });

  it("lets a card read from several cards, in the order named, up to 4, each once", () => {
    const four = check(plan(card("c1"), card("c2"), card("c3"), card("c4", { from: ["c2", "e2", "c1", "e1"] })));
    expect(four.ok && four.cards.find((each) => each.key === "c4")!.from).toEqual([{ plan: "c2" }, { card: "card-with-words" }, { plan: "c1" }, { card: "card-with-table" }]);
    expect(check(plan(card("c1"), card("c2"), card("c3"), card("c4"), card("c5", { from: ["c1", "c2", "c3", "c4", "e1"] })))).toEqual({
      ok: false,
      problem: "a card read from more than 4 cards",
    });
    expect(check(plan(card("c1"), card("c2", { from: ["c1", "c1"] })))).toEqual({ ok: false, problem: "a card read from the same card twice" });
    expect(check(plan(card("c1"), card("c2", { from: ["c1", "e9"] })))).toEqual({ ok: false, problem: "a line went to a card that isn’t there" });
    expect(check(plan(card("c1", { from: ["c2"] }), card("c2", { from: ["e1", "c1"] })))).toEqual({ ok: false, problem: "its cards went round in a circle" });
    expect(check(plan(card("c1", { from: [] }))).ok).toBe(true);
  });

  it("runs For each row on the first of several inputs that gives a table", () => {
    expect(check(plan(card("c1", { from: ["e2", "e1"], for_each_row: true }))).ok).toBe(true);
    expect(check(plan(card("c1"), card("c2", { from: ["e2", "c1"], for_each_row: true })))).toEqual({
      ok: false,
      problem: "For each row was on a card that doesn’t get a table",
    });
  });

  it("plans nothing when it asks, and only waits for the user on a card that reads from another", () => {
    expect(check({ reply: "Which market?", ask: true, cards: [card("c1")] })).toEqual({ ok: true, reply: "Which market?", ask: true, cards: [] });
    const result = check(plan(card("c1", { waits_for_user: true })));
    expect(result.ok && result.cards[0].waits).toBe(false);
  });

  it("never lets a reply with no cards promise work: it's a question, an answer about the board, or refused", () => {
    // What the user hit: a promise, with nothing laid out.
    expect(check({ reply: "I'll set up a review of your research and its conclusions.", ask: false, cards: [] })).toEqual({ ok: false, problem: NO_CARDS });
    expect(check({ reply: "Sure.", ask: false, answers_board: false, cards: [] })).toEqual({ ok: false, problem: NO_CARDS });
    // An answer about the board is shown as it is, longer than a plan's reply, and never with cards.
    const answer = `Scout's card found five rivals. ${"Comet is cheapest. ".repeat(50)}`;
    expect(check({ reply: answer, ask: false, answers_board: true, cards: [] })).toEqual({ ok: true, reply: answer.trim(), ask: false, answer: true, cards: [] });
    // Calling it an answer doesn't let it promise either.
    for (const reply of [
      "Good research. I'll set up a review card for it.",
      "Let me create a comparison.",
      "I’ve laid out a card above.",
      "I will now make two cards.",
      "I'll review your research and report back with my conclusions.",
      "We'll look into it.",
    ]) {
      expect(check({ reply, ask: false, answers_board: true, cards: [] })).toEqual({ ok: false, problem: PROMISED });
    }
    expect(check({ reply: "  ", ask: false, answers_board: true, cards: [] })).toEqual({ ok: false, problem: NO_CARDS });
    // With cards, it's a plan, whatever answers_board says, and its reply may say what's laid out.
    const withCards = check({ reply: "I've laid out a review card.", ask: false, answers_board: true, cards: [card("c1", { from: ["e1", "e2"] })] });
    expect(withCards).toMatchObject({ ok: true, ask: false, cards: [{ key: "c1" }] });
    expect(withCards.ok && withCards.answer).toBeFalsy();
  });

  it("tells a promise from an answer that only reports what the cards say", () => {
    expect(promisesWork("I'll set up a review of your research")).toBe(true);
    expect(promisesWork("I have added a card")).toBe(true);
    expect(promisesWork("Comet will add sync next year, per Scout's card.")).toBe(false);
    expect(promisesWork("I'd pick Dia, from what Scout found.")).toBe(false);
    expect(promisesWork("Strawberry is the only one that runs agents in the cloud.")).toBe(false);
  });
});

describe("armedStep", () => {
  const name = "Scout";

  it("starts a card that reads from nothing at once", () => {
    expect(armedStep({ kind: "none" }, false)).toEqual({ do: "start" });
  });

  it("waits while the card it reads from hasn't started or is still working", () => {
    expect(armedStep({ kind: "planned", name }, false)).toEqual({ do: "wait" });
    expect(armedStep({ kind: "running", name }, true)).toEqual({ do: "wait" });
  });

  it("starts once that card has answered, unless it waits for the user, who then has to say so", () => {
    expect(armedStep({ kind: "answered", name }, false)).toEqual({ do: "start" });
    expect(armedStep({ kind: "answered", name }, true)).toEqual({ do: "confirm" });
    expect(armedStep({ kind: "answered", name }, true, true)).toEqual({ do: "start" });
  });

  it("doesn't start after a card that failed, was stopped, didn't answer or didn't start, and says why", () => {
    expect(armedStep({ kind: "failed", name }, false)).toEqual({ do: "hold", note: "Didn’t start, because Scout didn’t finish" });
    expect(armedStep({ kind: "stopped", name }, true, true)).toEqual({ do: "hold", note: "Didn’t start, because Scout was stopped" });
    expect(armedStep({ kind: "silent", name }, false)).toEqual({ do: "hold", note: "Didn’t start, because Scout didn’t answer" });
    expect(armedStep({ kind: "held", name }, false)).toEqual({ do: "hold", note: "Didn’t start, because Scout’s card didn’t start" });
  });
});

describe("how a card stands for the cards after it", () => {
  const answered: { error: string | null; messages: { role: "assistant"; content: string }[] } = { error: null, messages: [{ role: "assistant", content: "Here they are." }] };
  const stopped = { error: null, messages: [{ role: "assistant" as const, content: "", steps: [{ text: "Stopped here", done: true }] }] };

  it("reads a sent card's chat", () => {
    expect(replyState("Scout", true, answered).kind).toBe("running");
    expect(replyState("Scout", false, answered).kind).toBe("answered");
    expect(replyState("Scout", false, { ...answered, error: "It broke" }).kind).toBe("failed");
    expect(replyState("Scout", false, stopped).kind).toBe("stopped");
    expect(replyState("Scout", false, { error: null, messages: [] }).kind).toBe("silent");
  });

  it("doesn't count an older answer when the newest reply came back empty", () => {
    const empty = {
      error: null,
      messages: [
        { role: "user" as const, content: "Find companies" },
        { role: "assistant" as const, content: "Twelve companies" },
        { role: "user" as const, content: "Only Swedish ones" },
        { role: "assistant" as const, content: "" },
      ],
    };
    expect(replyState("Scout", false, empty).kind).toBe("silent");
  });

  it("reads a For-each card's runs: going while any is, and answered only once every run has an answer", () => {
    const run = (state: "waiting" | "started" | "stopped" | "failed", thread: typeof answered | null = null, running = false) => ({ state, thread, running });
    expect(runsState("Scout", [run("started", answered), run("waiting")]).kind).toBe("running");
    expect(runsState("Scout", [run("started", answered, true)]).kind).toBe("running");
    expect(runsState("Scout", [run("started", answered), run("started", answered)]).kind).toBe("answered");
    expect(runsState("Scout", [run("started", answered), run("failed")]).kind).toBe("failed");
    expect(runsState("Scout", [run("started", answered), run("stopped")]).kind).toBe("stopped");
    expect(runsState("Scout", [run("failed"), run("stopped")]).kind).toBe("stopped");
    expect(runsState("Scout", [run("failed"), run("started", { error: "No", messages: [] })]).kind).toBe("failed");
  });
});

describe("a card with several inputs", () => {
  it("waits for every input, and stops at the first that won't answer", () => {
    expect(sourcesState([])).toEqual({ kind: "none" });
    expect(sourcesState([{ kind: "answered", name: "A" }, { kind: "running", name: "B" }])).toEqual({ kind: "running", name: "B" });
    expect(sourcesState([{ kind: "answered", name: "A" }, { kind: "answered", name: "B" }])).toEqual({ kind: "answered", name: "A" });
    expect(sourcesState([{ kind: "running", name: "A" }, { kind: "failed", name: "B" }])).toEqual({ kind: "failed", name: "B" });
  });
});

describe("Retry and Start remaining", () => {
  const answered = { error: null, messages: [{ role: "assistant" as const, content: "Done." }] };
  const failed = { error: "It broke", messages: [] };
  const stopped = { error: null, messages: [{ role: "assistant" as const, content: "", steps: [{ text: "Stopped here", done: true }] }] };
  const run = (id: string, state: "waiting" | "started" | "stopped" | "failed", thread: typeof answered | typeof failed | typeof stopped | null = null, running = false) => ({ id, state, thread, running });

  it("retries only runs that started and didn't finish, and starts only those that never started", () => {
    expect(
      retryable([
        run("answered", "started", answered),
        run("broke", "started", failed),
        run("stopped-midway", "started", stopped),
        run("couldnt-start", "failed"),
        run("never-started", "stopped"),
        run("still-going", "started", stopped, true),
        run("waiting", "waiting"),
      ])
    ).toEqual({ unfinished: ["broke", "stopped-midway", "couldnt-start"], unstarted: ["never-started"] });
    expect(retryable([])).toEqual({ unfinished: [], unstarted: [] });
  });

  it("finds something the user allowed in those runs, as its step showed it", () => {
    const step = (allowed?: "once" | "card") => ({ role: "assistant" as const, content: "", steps: [{ text: "Clicked", shown: "Clicked “Save draft”", done: true, ...(allowed ? { allowed } : {}) }] });
    expect(allowedBefore([null, { messages: [step()] }])).toBeNull();
    expect(allowedBefore([{ messages: [step()] }, { messages: [step("card")] }])).toBe("Clicked “Save draft”");
    expect(allowedBefore([{ messages: [step("once")] }])).toBe("Clicked “Save draft”");
  });
});
