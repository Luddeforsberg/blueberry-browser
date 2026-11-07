import type { ChatThread } from "../shared/library";
import { BERRY } from "../shared/mascots";
import { latestAnswer } from "./nestContext";
import { MAX_INPUTS } from "../shared/nestTable";

// Berry plans a request in a Nest's composer as cards: this checks what the model laid out, and decides when each card of
// a plan the user ran may start. It's pure, so the rules can be tested without a model or a window.

// One past this many new cards, a plan is refused.
export const MAX_PLAN_CARDS = 6;
const MAX_PROMPT_LENGTH = 2000;
const MAX_REPLY_LENGTH = 600;
const MAX_TABLE_OF_LENGTH = 60;

// A card already on the board that a planned card may read from, by the short key the planner was given for it.
// `table` is true when it has a table now, the one in its latest answer, a For-each card's or a file's, so For each row
// can run on it.
export interface PlanSource {
  key: string;
  cardId: string;
  table: boolean;
}

// One card of a valid plan. `from` is what it reads from, in order, each another card of the same plan, by its key, or a
// card on the board, by its id. For each row runs on the first of them with a table.
export interface PlanCard {
  key: string;
  // Null for Berry, as on any card.
  mascotId: string | null;
  prompt: string;
  from: ({ plan: string } | { card: string })[];
  each: boolean;
  waits: boolean;
  // What one row of the table in its answer will be, such as "companies", or null if its answer isn't a table.
  table: string | null;
  // The keys of the files and notes on the composer that this card gets.
  attached: string[];
}

export type CheckedPlan = { ok: true; reply: string; ask: boolean; cards: PlanCard[] } | { ok: false; problem: string };

const NOT_A_PLAN = "what came back wasn’t shaped like a plan";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// What the model laid out, checked in code: every bird is in the flock by id, lines only go between the plan's own cards
// or to cards on this board, nothing goes round in a circle, there are at most six new cards, For each row only runs
// on a table, and a card only gets files and notes the user attached to this request, each once. Anything else refuses the whole plan, so nothing invalid is ever shown, let alone run. The cards come back in
// an order where each card's source comes before it.
export const checkPlan = (
  raw: unknown,
  { flock, sources, attached = [] }: { flock: readonly string[]; sources: readonly PlanSource[]; attached?: readonly string[] }
): CheckedPlan => {
  if (!isRecord(raw) || typeof raw.reply !== "string" || typeof raw.ask !== "boolean" || !Array.isArray(raw.cards)) return { ok: false, problem: NOT_A_PLAN };
  const reply = raw.reply.trim().slice(0, MAX_REPLY_LENGTH);
  // A question plans nothing, whatever came with it.
  if (raw.ask) return reply ? { ok: true, reply, ask: true, cards: [] } : { ok: false, problem: NOT_A_PLAN };
  if (raw.cards.length > MAX_PLAN_CARDS) return { ok: false, problem: `it came to more than ${MAX_PLAN_CARDS} cards` };

  const onBoard = new Map(sources.map((source) => [source.key, source]));
  const keys = new Set<string>();
  const cards: (PlanCard & { fromKeys: string[] })[] = [];
  for (const card of raw.cards) {
    if (!isRecord(card)) return { ok: false, problem: NOT_A_PLAN };
    const { key, bird, prompt, from, for_each_row: each, waits_for_user: waits, table_of: tableOf, attached: given = [] } = card;
    if (typeof key !== "string" || !key || keys.has(key) || onBoard.has(key)) return { ok: false, problem: NOT_A_PLAN };
    if (typeof prompt !== "string" || typeof each !== "boolean" || typeof waits !== "boolean") return { ok: false, problem: NOT_A_PLAN };
    // One card by its key, or several, or none.
    const fromKeys = from === null ? [] : typeof from === "string" ? [from] : Array.isArray(from) && from.every((each: unknown) => typeof each === "string") ? (from as string[]) : null;
    if (!fromKeys || (tableOf !== null && typeof tableOf !== "string")) return { ok: false, problem: NOT_A_PLAN };
    if (fromKeys.length > MAX_INPUTS) return { ok: false, problem: `a card read from more than ${MAX_INPUTS} cards` };
    if (new Set(fromKeys).size !== fromKeys.length) return { ok: false, problem: "a card read from the same card twice" };
    // Never Berry in place of a bird that isn't there, since Berry may do more than it.
    if (typeof bird !== "string" || !flock.includes(bird)) return { ok: false, problem: "it named a bird that isn’t in your flock" };
    const words = prompt.trim();
    if (!words || words.length > MAX_PROMPT_LENGTH) return { ok: false, problem: "a card had no clear job" };
    if (!Array.isArray(given) || !given.every((each: unknown) => typeof each === "string")) return { ok: false, problem: NOT_A_PLAN };
    if (given.some((each: string) => !attached.includes(each)) || new Set(given).size !== given.length) {
      return { ok: false, problem: "it gave a card a file you didn’t attach" };
    }
    keys.add(key);
    const table = tableOf?.trim().slice(0, MAX_TABLE_OF_LENGTH) || null;
    cards.push({ key, mascotId: bird === BERRY.id ? null : bird, prompt: words, from: [], fromKeys, each, waits: waits && fromKeys.length > 0, table, attached: given as string[] });
  }

  for (const card of cards) {
    for (const fromKey of card.fromKeys) {
      const source = onBoard.get(fromKey);
      if (!keys.has(fromKey) && !source) return { ok: false, problem: "a line went to a card that isn’t there" };
      card.from.push(source ? { card: source.cardId } : { plan: fromKey });
    }
  }

  const ordered = inOrder(cards);
  if (!ordered) return { ok: false, problem: "its cards went round in a circle" };

  for (const card of cards) {
    if (!card.each) continue;
    // A card that runs for each row answers with a table too: the one it ran on, with its own column added.
    const table = card.fromKeys.some((fromKey) => {
      const planned = cards.find((other) => other.key === fromKey);
      return planned ? planned.each || planned.table !== null : onBoard.get(fromKey)?.table === true;
    });
    if (!table) return { ok: false, problem: "For each row was on a card that doesn’t get a table" };
  }

  return { ok: true, reply, ask: false, cards: ordered.map(({ fromKeys: _, ...card }) => card) };
};

// Each card after every card it reads from, or null if they go round in a circle.
const inOrder = <T extends { key: string; fromKeys: string[] }>(cards: readonly T[]): T[] | null => {
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const ordered: T[] = [];
  const visit = (card: T): boolean => {
    if (done.has(card.key)) return true;
    if (visiting.has(card.key)) return false;
    visiting.add(card.key);
    for (const fromKey of card.fromKeys) {
      const source = byKey.get(fromKey);
      if (source && !visit(source)) return false;
    }
    visiting.delete(card.key);
    done.add(card.key);
    ordered.push(card);
    return true;
  };
  return cards.every(visit) ? ordered : null;
};

// Where a card's sources stand together: it waits for every one, and doesn't start if any won't give an answer. The
// first that won't says why.
export const sourcesState = (states: readonly SourceState[]): SourceState => {
  if (states.length === 0) return { kind: "none" };
  const stopping = states.find((state) => state.kind === "held" || state.kind === "failed" || state.kind === "stopped" || state.kind === "silent");
  if (stopping) return stopping;
  return states.find((state) => state.kind === "planned" || state.kind === "running") ?? states[0];
};

// Where the card a planned card reads from is, once the plan has been run.
export type SourceState =
  // No line.
  | { kind: "none" }
  // A card of the plan that hasn't started yet.
  | { kind: "planned"; name: string }
  // A card of the plan that didn't start, and says why.
  | { kind: "held"; name: string }
  | { kind: "running"; name: string }
  | { kind: "answered"; name: string }
  | { kind: "failed"; name: string }
  | { kind: "stopped"; name: string }
  | { kind: "silent"; name: string };

// What a card of a plan that's been run does now: start, keep waiting, wait for the user to say its source's answer is
// right, or not start, saying why. Only a plan the user ran gets here, so starting is always because they pressed Run, and
// a card waiting for the user starts only once they press Looks right, continue.
export type ArmedStep = { do: "start" } | { do: "wait" } | { do: "confirm" } | { do: "hold"; note: string };

export const armedStep = (source: SourceState, waits: boolean, confirmed = false): ArmedStep => {
  switch (source.kind) {
    case "none":
      return { do: "start" };
    case "planned":
    case "running":
      return { do: "wait" };
    case "answered":
      return !waits || confirmed ? { do: "start" } : { do: "confirm" };
    case "held":
      return { do: "hold", note: `Didn’t start, because ${source.name}’s card didn’t start` };
    case "failed":
      return { do: "hold", note: `Didn’t start, because ${source.name} didn’t finish` };
    case "stopped":
      return { do: "hold", note: `Didn’t start, because ${source.name} was stopped` };
    case "silent":
      return { do: "hold", note: `Didn’t start, because ${source.name} didn’t answer` };
  }
};

export const CLOSED_BEFORE_START = "Didn’t start, because Blueberry closed before it could";

// How a sent card's chat stands for the cards after it, from its thread as it is now.
export const replyState = (
  name: string,
  running: boolean,
  thread: Pick<ChatThread, "error" | "messages"> | null
): Extract<SourceState, { kind: "running" | "answered" | "failed" | "stopped" | "silent" }> => {
  if (running) return { kind: "running", name };
  if (!thread) return { kind: "silent", name };
  if (thread.error) return { kind: "failed", name };
  const last = thread.messages.at(-1);
  // A stopped reply always ends with this step, as `Chats` saves it.
  if (last?.role === "assistant" && last.steps?.at(-1)?.text === "Stopped here") return { kind: "stopped", name };
  return latestAnswer(thread.messages) ? { kind: "answered", name } : { kind: "silent", name };
};

// The same for a For-each card: still going while any run is, then stopped if any run was, failed if any run didn't
// finish, and otherwise answered.
export const runsState = (
  name: string,
  runs: readonly { state: "waiting" | "started" | "stopped" | "failed"; running: boolean; thread: Pick<ChatThread, "error" | "messages"> | null }[]
): SourceState => {
  if (runs.some((run) => run.state === "waiting" || run.running)) return { kind: "running", name };
  const each = runs.map((run) => (run.state === "started" ? replyState(name, false, run.thread).kind : run.state));
  if (each.includes("stopped")) return { kind: "stopped", name };
  if (each.some((kind) => kind !== "answered")) return { kind: "failed", name };
  return { kind: "answered", name };
};

// Which runs of a For-each card Retry and Start remaining go again, as the card names them: runs that started and
// didn't finish, because they failed or were stopped, or couldn't start, and runs a stop or a restart kept from
// starting. A run still going, or one that answered, is never in either.
export const retryable = (
  runs: readonly { id: string; state: "waiting" | "started" | "stopped" | "failed"; running: boolean; thread: Pick<ChatThread, "error" | "messages"> | null }[]
): { unfinished: string[]; unstarted: string[] } => ({
  unfinished: runs
    .filter((run) => run.state === "failed" || (run.state === "started" && !run.running && run.thread !== null && ["failed", "stopped"].includes(replyState("", false, run.thread).kind)))
    .map((run) => run.id),
  unstarted: runs.filter((run) => run.state === "stopped").map((run) => run.id),
});

// Something the user allowed in one of these runs' threads, which going again may do again, as the step shows it.
export const allowedBefore = (threads: readonly (Pick<ChatThread, "messages"> | null)[]): string | null => {
  for (const thread of threads) {
    for (const message of thread?.messages ?? []) {
      const step = message.steps?.find((each) => each.allowed);
      if (step) return step.shown ?? step.text;
    }
  }
  return null;
};
