import type { Chats } from "./Chats";
import type { NestStore } from "./NestStore";
import type { MascotStore } from "./MascotStore";
import type { ChatThread, MascotProfile, NestBoard, NestCard, NestSummary } from "../shared/library";
import type { NestAskOptions, NestAskResult, NestAttachResult, NestFromChatResult, NestNewCard, NestRunPlanResult, NestSendEachResult } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { findTable, MAX_RUNS, missingRows, RUNS_AT_ONCE, runCountProblem, STALE_ROWS, type PickedRows } from "../shared/nestTable";
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, freeSpot, type Rect } from "../shared/nestPlace";
import { latestAnswer, rowAnswer, rowsAnswer, runsAnswer, type CardAnswer } from "./nestContext";
import { armedStep, checkPlan, CLOSED_BEFORE_START, replyState, runsState, type PlanCard, type PlanSource, type SourceState } from "./nestPlan";
import { answerStart, PLAN_SYSTEM_PROMPT, planDigest, type BoardCardDigest, type PlannedDigest } from "./nestPlanner";
import type { AttachmentRow, AttachTo, NewPlannedCard } from "./NestStore";
import { checkFile, MAX_NOTE_LENGTH, roomProblem, type ModelInputs, type SentAttachment } from "./nestFiles";

const MAX_TITLE_LENGTH = 100;
// What a Nest is called until its first request, whose first words then stand in until the cheap model names it.
export const NEW_NEST_TITLE = "New Nest";
// Like a chat's, a name is only tried for a few requests, since one that says nothing yet gets none.
const MAX_NAME_TRIES = 3;
// Far past any board anyone would make, so a bad number can't put a card somewhere it can never be found.
const MAX_COORDINATE = 1_000_000;

export interface NestEvents {
  onBoard: (board: NestBoard) => void;
  onListChanged: () => void;
  // A card's chat is gone, so anything showing it closes.
  chatDeleted: (chatId: string) => void;
  // A card started with work from the card its line comes from, without the user typing in it: a planned card after its
  // source, or a For-each card. The board shows its bird carrying it along the line. Only for the screen.
  handOff?: (nestId: string, from: string, to: string) => void;
}

type NestChats = Pick<Chats, "send" | "delete" | "thread" | "isRunning" | "stop" | "inCloud">;

// The cheap model naming a Nest from a request's words, as chats are named. Null when it has no topic yet.
export type NestNamer = (words: string) => Promise<string | null>;

const NO_NAMER: NestNamer = async () => null;

// Where a chat sits in a Nest: on a card, or one run of a For-each card.
export interface ChatInNest {
  nestId: string;
  cardId: string;
  runId: string | null;
}

const titleFrom = (text: string): string => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : line;
};

// The main model, asked for a plan in a set shape. Without one, the Nest's composer starts one card as it always has.
export interface NestPlanner {
  available: () => boolean;
  plan: (system: string, messages: { role: "user" | "assistant"; content: string }[]) => Promise<unknown>;
}

const NO_PLANNER: NestPlanner = { available: () => false, plan: async () => null };

// How tall a planned card is taken to be when placing a plan, and how many cards a request may say are already there.
const PLANNED_HEIGHT = 180;
const MAX_TAKEN = 500;
const STILL_PLANNING = "Berry is still changing the plan. Try again in a moment.";
const PLAN_FAILED = "I couldn’t plan that just now. Try again, or click the board to start a card yourself.";
const planRefused = (why: string) => `I couldn’t lay that out as cards, because ${why}. Try asking another way.`;

// What a card gets when it sends: an answer, or nothing when there's no line or the source hasn't answered, or a reason
// it can't send at all.
type CardInput = { answer: CardAnswer | null } | { problem: string };

const coordinate = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : null;

// Every card is one chat through `Chats`, so its bird's limits, Ask before acting, approvals, Needs you and the step
// limit apply as in any chat. A line only adds the source card's latest answer, or the rows picked from it, as untrusted
// data, when the user sends. A card sent with For each row is one chat per row, each also an ordinary chat through
// `Chats`, started a few at a time from the one press.
export class Nests {
  // Set as the window closes, when stopping every chat would otherwise let waiting runs take their places.
  private closed = false;
  // What the user wrote in each Nest's composer, while Berry plans it.
  private readonly planning = new Map<string, string>();
  // Nests the cheap model is naming right now, and how many times each has been tried since launch.
  private readonly naming = new Set<string>();
  private readonly nameTries = new Map<string, number>();

  constructor(
    private readonly store: NestStore,
    private readonly chats: NestChats,
    // Who a card runs as. Only a mascot in the flock can start one.
    private readonly mascots: Pick<MascotStore, "resolve" | "all">,
    private readonly events: NestEvents,
    private readonly planner: NestPlanner = NO_PLANNER,
    private readonly namer: NestNamer = NO_NAMER
  ) {
    // Runs still waiting when the app last closed don't start by themselves now: the press that queued them was then.
    // Cards of a plan that hadn't started don't either.
    store.stopWaiting();
    store.holdAfter(null, CLOSED_BEFORE_START);
  }

  list(): NestSummary[] {
    return this.store.nests().map(({ id, title, updatedAt }) => {
      const cards = this.store.board(id)?.cards ?? [];
      const working = cards.filter((card) => this.chatsOf(card).some((chatId) => this.chats.isRunning(chatId))).map((card) => card.mascotId ?? BERRY.id);
      const planned = cards.some((card) => card.plan?.state === "planned");
      // For-each cards still going, counted together, as each card counts its own.
      const going = cards.flatMap((card) => (card.each ? [card.each.runs.map((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)))] : []));
      const active = going.filter((runs) => runs.some(Boolean));
      const progress = active.length > 0 ? { done: active.flat().filter((still) => !still).length, total: active.flat().length } : null;
      // Only a running chat can be waiting, so only those are read.
      const waiting = cards.flatMap((card) => this.chatsOf(card)).find((chatId) => this.chats.isRunning(chatId) && !!this.chats.thread(chatId)?.approval) ?? null;
      return { id, title, updatedAt, chatIds: this.store.chatIds(id), working: [...new Set(working)], planned, progress, waiting };
    });
  }

  // Every chat that belongs to a card, which the sidebar's Chats list leaves out.
  cardChats(): Set<string> {
    return new Set(this.store.chatIds());
  }

  board(id: string): NestBoard | null {
    const board = this.store.board(id);
    return board && { ...board, planning: this.planning.get(id) ?? null, naming: this.naming.has(id) };
  }

  title(id: string): string | null {
    return this.store.board(id)?.title ?? null;
  }

  card(id: string): (NestCard & { nestId: string }) | null {
    return this.store.card(id);
  }

  // A card's chat can be opened as a chat tab, from Needs you, and what's sent there goes through its card.
  cardOfChat(chatId: string): NestCard | null {
    return this.store.cardOfChat(chatId);
  }

  // The same for one run of a For-each card.
  runOfChat(chatId: string): { id: string } | null {
    return this.store.runOfChat(chatId);
  }

  // Which card a chat is, so whatever opens it can open its Nest at that card instead. Null for an ordinary chat.
  chatInNest(chatId: string): ChatInNest | null {
    const card = this.store.cardOfChat(chatId);
    if (card) return { nestId: card.nestId, cardId: card.id, runId: null };
    const run = this.store.runOfChat(chatId);
    const owner = run && this.store.card(run.cardId);
    return run && owner ? { nestId: owner.nestId, cardId: owner.id, runId: run.id } : null;
  }

  // Open as a Nest: a new Nest whose first card is this chat, with its thread and bird, named as the chat is. From then on
  // it's a card like any other, so it leaves the Chats list. Only a chat the user started here, while nothing runs or
  // waits on it, since its reply would otherwise end on a card it didn't start on.
  fromChat(chatId: string): NestFromChatResult {
    const thread = typeof chatId === "string" ? this.chats.thread(chatId) : null;
    if (!thread || this.chatInNest(chatId)) return { ok: false, error: "That chat isn’t there any more." };
    if (thread.from || thread.runner || this.chats.inCloud(chatId)) return { ok: false, error: "Only a chat you started here can become a Nest." };
    // A question or an OK waits only while its reply runs.
    if (this.chats.isRunning(chatId)) return { ok: false, error: "Wait until it’s finished, or stop it first." };
    if (this.flockId(thread.mascotId) === undefined) return { ok: false, error: "That chat’s bird isn’t in your flock any more." };
    const nestId = this.store.createNest(titleFrom(thread.title) || NEW_NEST_TITLE, true);
    const card = this.store.addCard(nestId, { x: 0, y: 0, mascotId: thread.mascotId, auto: true });
    if (!card || !this.store.setChat(card.id, chatId)) {
      this.store.deleteNest(nestId);
      return { ok: false, error: "That chat couldn’t become a Nest." };
    }
    this.events.onListChanged();
    return { ok: true, nestId };
  }

  create(): string {
    const id = this.store.createNest(NEW_NEST_TITLE);
    this.events.onListChanged();
    return id;
  }

  // A Nest that isn't named yet takes the first words of its first request, as a chat takes its first message, and the
  // cheap model names it from them in the background. Nothing waits for it, and a name the user chose is never replaced.
  private nameFrom(nestId: string, words: string): void {
    if (this.naming.has(nestId) || this.store.titleSettled(nestId)) return;
    const placed = this.store.board(nestId)?.title === NEW_NEST_TITLE && this.store.nameNest(nestId, titleFrom(words), false);
    const tries = this.nameTries.get(nestId) ?? 0;
    if (tries >= MAX_NAME_TRIES) {
      if (placed) this.changed(nestId);
      return;
    }
    this.nameTries.set(nestId, tries + 1);
    this.naming.add(nestId);
    this.changed(nestId);
    void this.namer(words)
      .then((title) => {
        const name = title ? titleFrom(title) : "";
        if (name) this.store.nameNest(nestId, name, true);
      })
      .catch((error) => console.error("Couldn't name a Nest:", error instanceof Error ? error.message : "unknown error"))
      .finally(() => {
        this.naming.delete(nestId);
        this.changed(nestId);
      });
  }

  rename(id: string, title: string): boolean {
    const name = typeof title === "string" ? title.trim().slice(0, MAX_TITLE_LENGTH) : "";
    if (!name || !this.store.renameNest(id, name)) return false;
    this.changed(id);
    return true;
  }

  // Its cards' chats go with it, runs' too.
  delete(id: string): boolean {
    const chatIds = this.store.chatIds(id);
    if (!this.store.deleteNest(id)) return false;
    chatIds.forEach((chatId) => this.deleteChat(chatId));
    this.events.onListChanged();
    // A deleted run never says it ended, so whatever waits elsewhere gets its place now.
    this.pump();
    return true;
  }

  addCard(nestId: string, input: NestNewCard): NestCard | null {
    const x = coordinate(input?.x);
    const y = coordinate(input?.y);
    if (x === null || y === null) return null;
    const from = typeof input.from === "string" ? input.from : null;
    const mascotId = this.flockId(input.mascotId);
    if (mascotId === undefined) return null;
    // A line comes out of a card with an answer to give, so never out of a draft. Out of a planned card, it's another card
    // of the plan.
    const source = from === null ? null : this.store.card(from);
    const planned = source?.plan?.state === "planned";
    if (from !== null && !source?.chatId && !source?.each && !planned) return null;
    // Rows can only be picked from the table in the source's latest answer as it is now, so nothing else gets across.
    const picked = input.picked === undefined || input.picked === null || planned ? null : this.pickedFrom(source, input.picked);
    if (picked === undefined) return null;
    const card = this.store.addCard(nestId, { x, y, from, mascotId, picked, planned, auto: input.auto === true });
    if (card) this.changed(nestId);
    return card;
  }

  // Cards the board moved out of the way of one that grew. The store only moves cards of this Nest placed for the user and
  // never moved by hand, so a card the user placed stays where it is whatever the renderer asks.
  nudgeCards(nestId: unknown, moves: unknown): boolean {
    if (typeof nestId !== "string" || !Array.isArray(moves)) return false;
    const valid = moves.slice(0, MAX_TAKEN).flatMap((move) => {
      const to = { x: coordinate(move?.x), y: coordinate(move?.y) };
      return typeof move?.id === "string" && to.x !== null && to.y !== null ? [{ id: move.id as string, x: to.x, y: to.y }] : [];
    });
    if (valid.length === 0 || this.store.nudgeCards(nestId, valid) === 0) return false;
    this.events.onBoard(this.store.board(nestId)!);
    return true;
  }

  moveCard(cardId: string, x: unknown, y: unknown): boolean {
    const to = { x: coordinate(x), y: coordinate(y) };
    if (to.x === null || to.y === null || !this.store.moveCard(cardId, to.x, to.y)) return false;
    const nestId = this.store.card(cardId)?.nestId;
    if (nestId) this.events.onBoard(this.store.board(nestId)!);
    return true;
  }

  setBird(cardId: string, mascotId: unknown): boolean {
    const card = this.store.card(cardId);
    const bird = this.flockId(mascotId);
    if (!card || bird === undefined || !this.store.setBird(cardId, bird)) return false;
    this.changed(card.nestId);
    return true;
  }

  // Its chat goes with it, or every run's.
  deleteCard(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card) return false;
    // A card of a run plan that reads from it would otherwise start with nothing to read.
    this.store.holdAfter(cardId, "Didn’t start, because the card it reads from was deleted");
    if (!this.store.deleteCard(cardId)) return false;
    this.chatsOf(card).forEach((chatId) => this.deleteChat(chatId));
    // A deleted chat never says it ended, so the cards after the ones just held hear it from here.
    this.advance(card.nestId);
    this.pump();
    return true;
  }

  // Sends from a card, and only ever because the user did. A draft starts its chat as its bird. The source card's latest
  // answer is read now, every time, so a card always works from what its source says at the moment it's sent.
  send(cardId: string, text: string): ChatThread | null {
    const card = this.store.card(cardId);
    // A planned card goes with its plan, by Run. One that was held is a draft, and the user may send it.
    if (!card || card.each || typeof text !== "string" || (card.plan && card.plan.state !== "held")) return null;
    const input = this.inputFor(cardId);
    if ("problem" in input) return null;
    const cardAnswer = input.answer;
    // When its reply ends, a card of a run plan that reads from it may start.
    const options = {
      seePage: false,
      userPresent: true,
      onEnd: () => this.advance(card.nestId),
      ...(cardAnswer ? { cardAnswer } : {}),
      ...this.userSaid(cardId, card.chatId, text),
      ...this.attachmentsFor(cardId),
    };
    const sent = card.chatId
      ? this.chats.send(card.chatId, text, options)
      : this.chats.send(null, text, { ...options, mascotId: card.mascotId, started: (chatId) => this.store.setChat(cardId, chatId) });
    if (!sent) return null;
    this.nameFrom(card.nestId, text);
    this.store.touch(card.nestId);
    this.changed(card.nestId);
    return sent;
  }

  // Sends a draft once for each row of what its line brings: the rows picked, or every row of the source's table. Each
  // row is a run with its own chat, the same bird and prompt, and only its own row. They start a few at a time, and
  // every one goes through `Chats.send`, so each asks for what it does as any chat would.
  sendEach(cardId: string, text: string): NestSendEachResult {
    const card = this.store.card(cardId);
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!card || card.chatId || card.each) return { ok: false, error: "This card has been sent already." };
    if (card.plan && card.plan.state !== "held") return { ok: false, error: "This card goes when you run the plan." };
    if (!prompt) return { ok: false, error: "Write what to do with each row first." };
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const rows = this.rowsFor(cardId);
    if ("problem" in rows) return { ok: false, error: rows.problem };
    const problem = runCountProblem(rows.rows.length);
    if (problem) return { ok: false, error: problem };
    if (!this.store.startForEach(cardId, prompt, rows.header, rows.rows)) return { ok: false, error: "This card has been sent already." };
    this.nameFrom(card.nestId, prompt);
    this.changed(card.nestId);
    this.handedOff(cardId);
    this.pump();
    return { ok: true };
  }

  // A reply in one run's thread, which gets its row again, and only its row.
  sendRun(runId: string, text: string): ChatThread | null {
    const run = this.store.run(runId);
    const card = run && this.store.card(run.cardId);
    if (!run?.chatId || !card?.each || typeof text !== "string") return null;
    // It's the user's own press on one thread, so it doesn't wait for a place, but it holds one, and gives it back.
    const sent = this.chats.send(run.chatId, text, {
      seePage: false,
      userPresent: true,
      cardAnswer: rowAnswer(this.sourceName(card.id), card.each.header, run.row),
      onEnd: () => {
        this.pump();
        this.advance(card.nestId);
      },
      ...this.userSaid(card.id, run.chatId, text),
      ...this.attachmentsFor(card.id),
    });
    if (sent) this.store.touch(card.nestId);
    return sent;
  }

  // Stop on a card: nothing still waiting starts, and every run going stops.
  stopCard(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card) return false;
    this.store.stopWaiting(cardId);
    this.chatsOf(card).forEach((chatId) => this.chats.stop(chatId));
    this.changed(card.nestId);
    return true;
  }

  // What the user wrote in the Nest's composer, which goes to Berry first. One job with nothing to read becomes a card as
  // the bird the user chose, with their own words, and starts at once, as it always has. Several jobs, or one that reads
  // from a card, become a plan of cards that waits for Run, and Berry says what it laid out. When it's unclear, Berry
  // asks, and plans once it has the answer. While a plan is waiting, a message changes it.
  async ask(nestId: string, text: string, options: NestAskOptions): Promise<NestAskResult> {
    const words = typeof text === "string" ? text.trim() : "";
    const board = this.store.board(nestId);
    if (!board || !words) return { ok: false, error: "Write what you’d like done first." };
    if (this.planning.has(nestId)) return { ok: false, error: "Berry is still reading your last message." };
    const chosen = this.flockId(options?.mascotId);
    if (chosen === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const place = this.placing(options);
    this.nameFrom(nestId, words);
    const open = this.store.openRequest(nestId);
    const pending = board.cards.filter((card) => card.plan?.state === "planned");
    // Without a model to plan with, it's one card, as before. Not while a plan waits, whose cards point at the composer's
    // files, which that card would take.
    if (!this.planner.available()) {
      if (pending.length > 0) return { ok: false, error: "Run or discard the plan first, since Berry needs a model to change it." };
      return this.oneCard(nestId, words, chosen, place) ? { ok: true } : { ok: false, error: "That couldn’t start." };
    }

    // Only the composer's files and notes are the planner's to point cards at, as short keys. What the user added on a
    // planned card stays that card's: it goes with the card if the new plan keeps its key, and back to the composer if not.
    const attachable = this.store.attachmentRows({ nestId }).map((row, index) => ({ ...row, key: `a${index + 1}` }));
    const attachedKeys = new Map(attachable.map((row) => [row.key, row.id]));
    const planKeys = new Map(pending.map((card, index) => [`p${index + 1}`, card.id]));
    const { digest, sources } = this.digestOf(board, chosen, pending, attachable, planKeys);
    const earlier = (open?.messages ?? []).map(({ role, text: said }) => ({ role: role === "user" ? ("user" as const) : ("assistant" as const), content: said }));
    const messages = [...earlier, { role: "user" as const, content: words }];
    messages[0] = { ...messages[0], content: `${digest}\n\n<request>\n${messages[0].content}\n</request>` };
    this.planning.set(nestId, words);
    this.changed(nestId);
    let raw: unknown;
    try {
      raw = await this.planner.plan(PLAN_SYSTEM_PROMPT, messages);
    } catch (error) {
      console.error("Couldn't plan in a Nest:", error instanceof Error ? error.message : "unknown error");
      raw = undefined;
    } finally {
      this.planning.delete(nestId);
    }
    if (!this.store.board(nestId)) return { ok: true };

    const flock = [BERRY.id, ...this.mascots.all().filter((mascot) => mascot.deletedAt === null && mascot.id !== BERRY.id).map((mascot) => mascot.id)];
    const checked = raw === undefined ? null : checkPlan(raw, { flock, sources, attached: [...attachedKeys.keys()] });
    // One job, asked fresh, as the bird the user chose and reading from nothing, starts at once with their own words.
    const one = checked?.ok && !checked.ask && checked.cards.length === 1 ? checked.cards[0] : null;
    if (one && !open && pending.length === 0 && !one.from && !one.each && one.mascotId === chosen) {
      this.oneCard(nestId, words, chosen, place);
      return { ok: true };
    }

    this.store.say(nestId, "user", words);
    if (!checked) this.store.say(nestId, "berry", PLAN_FAILED);
    else if (!checked.ok) this.store.say(nestId, "berry", planRefused(checked.problem));
    else if (
      checked.cards.some((card) => {
        const kept = planKeys.get(card.key);
        return this.overfull([...(kept ? this.store.attachmentRows({ cardId: kept }) : []), ...card.attached.map((key) => attachable.find((row) => row.key === key)!)]);
      })
    )
      this.store.say(nestId, "berry", planRefused("a card would get more files than one card can take"));
    else if (checked.ask || checked.cards.length === 0) this.store.say(nestId, "berry", checked.reply || PLAN_FAILED);
    else if (!this.store.setPlan(nestId, this.placePlan(checked.cards, board, pending, place, attachedKeys, planKeys), this.store.openRequest(nestId)!.messages.filter((message) => message.role === "user").map((message) => message.text).join("\n")))
      this.store.say(nestId, "berry", planRefused("a line went to a card that isn’t there"));
    else this.store.say(nestId, "berry", checked.reply || "I’ve laid it out above. Press Run when it looks right.");
    this.changed(nestId);
    return { ok: true };
  }

  // A planned card's prompt or For each row, before the plan runs. For each row only where the card gets a table.
  editPlanned(cardId: string, change: { prompt?: unknown; each?: unknown }): boolean {
    const card = this.store.card(cardId);
    if (card?.plan?.state !== "planned" || typeof change !== "object" || change === null) return false;
    const prompt = typeof change.prompt === "string" ? change.prompt.slice(0, 2000) : undefined;
    const each = typeof change.each === "boolean" ? change.each : undefined;
    if (prompt === undefined && each === undefined) return false;
    if (each && !this.getsTable(cardId)) return false;
    if (!this.store.editPlanned(cardId, { prompt, each })) return false;
    this.changed(card.nestId);
    return true;
  }

  // Run: the user's one press that sends every planned card in the Nest. Each starts now if it reads from nothing, and
  // otherwise once the card it reads from has answered, or once the user says that answer is right if it waits for them.
  runPlan(nestId: string): NestRunPlanResult {
    const planned = this.store.board(nestId)?.cards.filter((card) => card.plan?.state === "planned") ?? [];
    if (planned.length === 0) return { ok: false, error: "There’s no plan to run." };
    if (this.planning.has(nestId)) return { ok: false, error: "Berry is still changing the plan." };
    for (const card of planned) {
      const name = this.mascots.resolve(card.mascotId).name;
      if (!card.plan!.prompt.trim()) return { ok: false, error: `Write what ${name} should do first, or delete that card.` };
      if (this.flockId(card.mascotId) === undefined) return { ok: false, error: `${name} isn’t in your flock any more. Choose another bird for that card.` };
      if (card.plan!.each && !this.getsTable(card.id)) return { ok: false, error: `For each row on ${name}’s card needs a card that answers with a table.` };
    }
    // Each card gets its own copy of the composer's it points at, as they are now.
    this.store.armPlan(nestId);
    this.store.closeRequest(nestId);
    this.advance(nestId);
    return { ok: true };
  }

  discardPlan(nestId: string): boolean {
    if (this.store.discardPlan(nestId) === 0) return false;
    this.store.closeRequest(nestId);
    this.changed(nestId);
    return true;
  }

  // Adds a file the user picked, already read in main, to a draft or planned card or to the composer. It's checked first:
  // its type by name and bytes, what the model reads, its size, and room on the card.
  attachFile(target: unknown, name: string, bytes: Uint8Array, inputs: ModelInputs): NestAttachResult {
    const to = this.changeable(target);
    if (!to) return { ok: false, error: this.replanning(target) ? STILL_PLANNING : "Files can only be added before a card is sent." };
    const checked = checkFile(name, bytes, inputs);
    if (!checked.ok) return checked;
    const { type, size, pages } = checked.file;
    const problem = roomProblem(this.roomOf(to), { kind: "file", name, size, pages });
    if (problem) return { ok: false, error: problem };
    if (!this.store.addAttachment(to, { kind: "file", name, type, size, pages, data: bytes })) return { ok: false, error: "That card isn’t there any more." };
    this.changedAt(to);
    return { ok: true };
  }

  addNote(target: unknown, text: unknown): NestAttachResult {
    const to = this.changeable(target);
    const words = typeof text === "string" ? text.trim() : "";
    if (!to) return { ok: false, error: this.replanning(target) ? STILL_PLANNING : "Notes can only be added before a card is sent." };
    if (!words) return { ok: false, error: "Write the note first." };
    if (words.length > MAX_NOTE_LENGTH) return { ok: false, error: `A note can be ${MAX_NOTE_LENGTH} characters at most.` };
    const problem = roomProblem(this.roomOf(to), { kind: "note", size: 0, pages: null });
    if (problem) return { ok: false, error: problem };
    if (!this.store.addAttachment(to, { kind: "note", text: words })) return { ok: false, error: "That card isn’t there any more." };
    this.changedAt(to);
    return { ok: true };
  }

  // Only before its card is sent. An empty note goes.
  editNote(id: unknown, text: unknown): boolean {
    const at = typeof id === "string" ? this.store.attachment(id) : null;
    const words = typeof text === "string" ? text.trim() : "";
    if (!at || at.kind !== "note" || words.length > MAX_NOTE_LENGTH || !this.changeable(at.cardId ? { cardId: at.cardId } : { nestId: at.nestId })) return false;
    if (!(words ? this.store.editNote(id as string, words) : this.store.removeAttachment(id as string))) return false;
    this.changed(at.nestId);
    return true;
  }

  // From a planned card, one of the composer's it points at only stops being pointed at.
  removeAttachment(id: unknown, fromCardId?: unknown): boolean {
    if (typeof id === "string" && typeof fromCardId === "string") {
      const card = this.store.card(fromCardId);
      if (!card || !this.changeable({ cardId: fromCardId }) || !this.store.unpoint(fromCardId, id)) return false;
      this.changed(card.nestId);
      return true;
    }
    const at = typeof id === "string" ? this.store.attachment(id) : null;
    if (!at || !this.changeable(at.cardId ? { cardId: at.cardId } : { nestId: at.nestId })) return false;
    if (!this.store.removeAttachment(id as string)) return false;
    this.changed(at.nestId);
    return true;
  }

  // Where files and notes may still change: the composer, while Berry isn't reading it, or a card nothing has been sent from
  // and that a run plan isn't about to start. Null anywhere else. Once sent, they're what its messages went with. A planned
  // card waits while Berry changes the plan, which would otherwise replace it without what was just added.
  changeable(target: unknown): AttachTo | null {
    if (typeof target !== "object" || target === null) return null;
    const { cardId, nestId } = target as { cardId?: unknown; nestId?: unknown };
    if (typeof cardId === "string") {
      const card = this.store.card(cardId);
      if (!card || card.chatId || card.each || card.plan?.state === "armed") return null;
      return card.plan?.state === "planned" && this.planning.has(card.nestId) ? null : { cardId };
    }
    if (typeof nestId === "string") return this.store.board(nestId) && !this.planning.has(nestId) ? { nestId } : null;
    return null;
  }

  // Whether Berry is changing the plan the target is part of, or reading the composer it is.
  private replanning(target: unknown): boolean {
    const { cardId, nestId } = (typeof target === "object" && target !== null ? target : {}) as { cardId?: unknown; nestId?: unknown };
    const nest = typeof cardId === "string" ? this.store.card(cardId)?.nestId : nestId;
    return typeof nest === "string" && this.planning.has(nest);
  }

  // A card's files and notes, which go with every message it sends, and with every run of For each row.
  private attachmentsFor(cardId: string): { attachments?: SentAttachment[] } {
    const attachments = this.store.sentAttachments(cardId);
    return attachments.length > 0 ? { attachments } : {};
  }

  // What already takes room: the composer's, or a card's own and those it points at.
  private roomOf(to: AttachTo): AttachmentRow[] {
    return [...this.store.attachmentRows(to), ...("cardId" in to ? this.store.pointedAt(to.cardId) : [])];
  }

  // Whether these would break a card's limits together, given to it by a plan.
  private overfull(rows: readonly AttachmentRow[]): boolean {
    return rows.some((row, index) => roomProblem(rows.slice(0, index), row) !== null);
  }

  private changedAt(to: AttachTo): void {
    const nestId = "cardId" in to ? this.store.card(to.cardId)?.nestId : to.nestId;
    if (nestId) this.changed(nestId);
  }

  // Looks right, continue: the user says this card's answer is right, so the cards of a run plan waiting on it start now.
  continueFrom(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card || this.closed) return false;
    const waiting = this.store.armedCards(card.nestId).filter((armed) => this.store.lineTo(armed.id)?.source.id === cardId && armed.plan!.waits);
    let started = false;
    for (const armed of waiting) {
      if (armedStep(this.sourceState(armed.id), true, true).do === "start") started = this.startPlanned(armed) || started;
    }
    this.advance(card.nestId);
    return started;
  }

  // Moves a run plan along: every armed card starts, holds with why, or keeps waiting, until nothing changes. Called after
  // Run and whenever a card's reply ends, and it only ever starts what Run armed.
  private advance(nestId: string): void {
    if (this.closed) return;
    let moved = true;
    while (moved) {
      moved = false;
      for (const card of this.store.armedCards(nestId)) {
        const step = armedStep(this.sourceState(card.id), card.plan!.waits);
        if (step.do === "start") moved = this.startPlanned(card) || moved;
        else if (step.do === "hold") moved = this.store.hold(card.id, step.note) || moved;
      }
    }
    this.changed(nestId);
  }

  // Where the card a planned card reads from stands.
  private sourceState(cardId: string): SourceState {
    const line = this.store.lineTo(cardId);
    if (!line) return { kind: "none" };
    const { source } = line;
    const name = this.mascots.resolve(source.mascotId).name;
    if (source.plan?.state === "held") return { kind: "held", name };
    if (source.plan) return { kind: "planned", name };
    if (source.each) {
      return runsState(
        name,
        source.each.runs.map((run) => ({ state: run.state, running: !!run.chatId && this.chats.isRunning(run.chatId), thread: run.chatId ? this.chats.thread(run.chatId) : null }))
      );
    }
    if (!source.chatId) return { kind: "silent", name };
    return replyState(name, this.chats.isRunning(source.chatId), this.chats.thread(source.chatId));
  }

  // Starts one armed card as its bird, with what its line brings now: the source's fresh answer, or one run for each row
  // of its table. If it can't, it holds and says why. Each goes through `Chats.send` like any card, with every limit and
  // approval, and nobody is asked first, since the plan was what the user ran.
  private startPlanned(card: NestCard): boolean {
    const plan = card.plan!;
    const nestId = this.store.card(card.id)?.nestId;
    if (!nestId) return false;
    if (this.flockId(card.mascotId) === undefined) return this.store.hold(card.id, "Didn’t start, because its bird isn’t in your flock any more");
    if (plan.each) {
      const rows = this.rowsFor(card.id);
      const name = this.sourceName(card.id);
      if ("problem" in rows) return this.store.hold(card.id, `Didn’t start, because ${name}’s answer has no table`);
      if (runCountProblem(rows.rows.length)) {
        return this.store.hold(card.id, `Didn’t start, because ${name}’s table has ${rows.rows.length} rows, and For each row runs at most ${MAX_RUNS} times`);
      }
      if (!this.store.startForEach(card.id, plan.prompt, rows.header, rows.rows)) return false;
      this.handedOff(card.id);
      this.pump();
      return true;
    }
    const input = this.inputFor(card.id);
    if ("problem" in input) return this.store.hold(card.id, "Didn’t start, because what it reads from has changed");
    const sent = this.chats.send(null, plan.prompt, {
      seePage: false,
      mascotId: card.mascotId,
      ...(input.answer ? { cardAnswer: input.answer } : {}),
      started: (chatId) => this.store.setChat(card.id, chatId),
      onEnd: () => this.advance(nestId),
      ...this.userSaid(card.id, null, null),
      ...this.attachmentsFor(card.id),
    });
    if (!sent) return this.store.hold(card.id, "Didn’t start");
    this.handedOff(card.id);
    return true;
  }

  // Says a card just started with work from the card its line comes from. A card that reads from nothing has nobody to
  // carry it.
  private handedOff(cardId: string): void {
    const line = this.store.lineTo(cardId);
    const nestId = this.store.card(cardId)?.nestId;
    if (line && nestId) this.events.handOff?.(nestId, line.source.id, cardId);
  }

  // On a card Berry planned, what the user typed: the request it was planned from, and anything they've typed in its chat
  // since its first message, which is Berry's prompt, and `typed` if they're sending it now. Only these words name sites
  // its job may go to without asking. Nothing on a card whose prompt the user typed themselves.
  private userSaid(cardId: string, chatId: string | null, typed: string | null): { userSaid?: string } {
    const said = this.store.said(cardId);
    if (said === null) return {};
    const since = (chatId ? this.chats.thread(chatId)?.messages ?? [] : []).filter((message) => message.role === "user").slice(1).map((message) => message.content);
    // The first send carries Berry's prompt, even from a held card the user sends themselves.
    return { userSaid: [said, ...since, ...(chatId && typed !== null ? [typed] : [])].join("\n") };
  }

  // Whether For each row can run on what a planned card reads from: a planned card that will answer with a table, or a
  // sent card whose latest answer has one.
  private getsTable(cardId: string): boolean {
    const source = this.store.lineTo(cardId)?.source;
    if (!source || source.each) return false;
    if (source.plan) return !source.plan.each && source.plan.table !== null;
    const answer = source.chatId ? this.answerOf(source.chatId) : null;
    return !!answer && findTable(answer) !== null;
  }

  // One card as the chosen bird, in the first free place in sight, sent with the user's own words.
  private oneCard(nestId: string, words: string, mascotId: string | null, place: { at: { x: number; y: number }; taken: Rect[] }): boolean {
    const spot = freeSpot(place.taken, place.at);
    const card = this.store.addCard(nestId, { ...spot, mascotId, auto: true });
    if (!card) return false;
    // It's the one job they were attached for.
    this.store.moveComposerTo(nestId, card.id);
    this.changed(nestId);
    return this.send(card.id, words) !== null;
  }

  // What the renderer says about where a plan can go, checked: numbers on the board, and not too many of them.
  private placing(options: NestAskOptions | undefined): { at: { x: number; y: number }; taken: Rect[] } {
    const x = coordinate(options?.at?.x);
    const y = coordinate(options?.at?.y);
    const taken = (Array.isArray(options?.taken) ? options.taken.slice(0, MAX_TAKEN) : []).flatMap((rect) => {
      const box = { x: coordinate(rect?.x), y: coordinate(rect?.y), width: coordinate(rect?.width), height: coordinate(rect?.height) };
      return box.x === null || box.y === null || box.width === null || box.height === null ? [] : [box as Rect];
    });
    return { at: { x: x ?? 0, y: y ?? 0 }, taken };
  }

  // A plan's cards in place: each card beside the one it reads from, level with it, and the rest in a column where the
  // plan it replaces was, or else at the top left in sight. None lands on another card.
  private placePlan(
    cards: readonly PlanCard[],
    board: NestBoard,
    pending: readonly NestCard[],
    place: { at: { x: number; y: number }; taken: Rect[] },
    attachedKeys: ReadonlyMap<string, string>,
    planKeys: ReadonlyMap<string, string>
  ): NewPlannedCard[] {
    const replaced = new Set(pending.map((card) => card.id));
    const taken = place.taken.filter((rect) => !pending.some((card) => card.x === rect.x && card.y === rect.y));
    const rectOf = (card: NestCard) => taken.find((rect) => rect.x === card.x && rect.y === card.y) ?? { x: card.x, y: card.y, width: CARD_WIDTH, height: CARD_HEIGHT };
    const start = pending.length > 0 ? { x: Math.min(...pending.map((card) => card.x)), y: Math.min(...pending.map((card) => card.y)) } : place.at;
    const placed = new Map<string, Rect>();
    return cards.map((card) => {
      const from = card.from && ("plan" in card.from ? placed.get(card.from.plan) : board.cards.find((each) => each.id === (card.from as { card: string }).card && !replaced.has(each.id)));
      const source = from && ("width" in from ? from : rectOf(from));
      const spot = freeSpot(taken, source ? { x: source.x + source.width + CARD_GAP, y: source.y } : start, { width: CARD_WIDTH, height: PLANNED_HEIGHT });
      const rect = { ...spot, width: CARD_WIDTH, height: PLANNED_HEIGHT };
      taken.push(rect);
      placed.set(card.key, rect);
      return { ...card, ...spot, attached: card.attached.map((key) => attachedKeys.get(key)!), keeps: planKeys.get(card.key) ?? null };
    });
  }

  // What the planner reads besides the conversation: the flock, the bird chosen, every sent card on the board, each with
  // only the start of its answer, and the plan being changed. And the keys it may draw a line from.
  private digestOf(
    board: NestBoard,
    chosen: string | null,
    pending: readonly NestCard[],
    attachable: readonly (AttachmentRow & { key: string })[],
    planKeys: ReadonlyMap<string, string>
  ): { digest: string; sources: PlanSource[] } {
    const sent = board.cards.filter((card) => card.chatId || card.each);
    const keyOf = new Map(sent.map((card, index) => [card.id, `e${index + 1}`]));
    const sources: PlanSource[] = [];
    const cards: BoardCardDigest[] = sent.map((card) => {
      const key = keyOf.get(card.id)!;
      const bird = this.mascots.resolve(card.mascotId).name;
      if (card.each) {
        const answered = card.each.runs.filter((run) => run.chatId && this.answerOf(run.chatId)).length;
        sources.push({ key, cardId: card.id, table: false });
        return { key, bird, status: `${answered} of ${card.each.runs.length} answered`, asked: card.each.prompt, answer: null, runs: card.each.runs.length };
      }
      const thread = card.chatId ? this.chats.thread(card.chatId) : null;
      const answer = thread ? latestAnswer(thread.messages) : null;
      const running = !!card.chatId && this.chats.isRunning(card.chatId);
      sources.push({ key, cardId: card.id, table: !!answer && findTable(answer) !== null });
      return {
        key,
        bird,
        status: running ? "Working" : answer ? "Done" : "No answer",
        asked: thread?.messages.findLast((message) => message.role === "user")?.content ?? null,
        answer: answer ? answerStart(answer) : null,
      };
    });
    const keyOfPlanned = new Map([...planKeys].map(([key, id]) => [id, key]));
    const plan: PlannedDigest[] = pending.map((card) => {
      const from = this.store.lineTo(card.id)?.source.id;
      return {
        key: keyOfPlanned.get(card.id)!,
        bird: card.mascotId ?? BERRY.id,
        prompt: card.plan!.prompt,
        from: from ? (keyOfPlanned.get(from) ?? keyOf.get(from) ?? null) : null,
        each: card.plan!.each,
        waits: card.plan!.waits,
        table: card.plan!.table,
        own: this.store.attachmentRows({ cardId: card.id }).map((row) => (row.kind === "note" ? "a note" : row.name)),
        attached: this.store.pointedAt(card.id).flatMap((row) => attachable.find((each) => each.id === row.id)?.key ?? []),
      };
    });
    const flock: MascotProfile[] = this.mascots.all().filter((mascot) => mascot.deletedAt === null);
    // Only a file's name, type and size, never what's in it. A note is the user's own words.
    const attached = attachable.map(({ key, kind, name, type, size, note }) => ({ key, kind, name, type, size, text: note ?? undefined }));
    return { digest: planDigest({ flock, chosen: this.mascots.resolve(chosen), board: cards, plan, attached }), sources };
  }

  // What a card gets from the card its line comes from: that card's latest answer, the rows the user picked from it as
  // long as they're still in it, or every run's answer from a For-each card.
  inputFor(cardId: string): CardInput {
    const line = this.store.lineTo(cardId);
    if (!line) return { answer: null };
    const name = this.mascots.resolve(line.source.mascotId).name;
    if (line.source.each) {
      const runs = line.source.each.runs.flatMap((run) => {
        const answer = run.chatId ? this.answerOf(run.chatId) : null;
        return answer ? [{ row: run.row, answer }] : [];
      });
      return { answer: runs.length > 0 ? runsAnswer(name, runs) : null };
    }
    const text = line.source.chatId ? this.answerOf(line.source.chatId) : null;
    if (!line.picked) return { answer: text ? { name, text } : null };
    if (missingRows(line.picked, text ? findTable(text) : null).length > 0) return { problem: STALE_ROWS };
    return { answer: rowsAnswer(name, line.picked) };
  }

  // The rows For each row runs on: the ones picked, if they're all still there, or else the source's whole table.
  private rowsFor(cardId: string): PickedRows | { problem: string } {
    const line = this.store.lineTo(cardId);
    const text = line?.source.chatId ? this.answerOf(line.source.chatId) : null;
    const table = text ? findTable(text) : null;
    if (!line || line.source.each || !table) return { problem: "For each row needs a line from a card whose answer has a table." };
    if (!line.picked) return { header: table.header, rows: table.rows };
    return missingRows(line.picked, table).length > 0 ? { problem: STALE_ROWS } : line.picked;
  }

  // Starts waiting runs, oldest first, while fewer than `RUNS_AT_ONCE` are going on every card together. A run waiting
  // for the user's OK still counts, since it holds its tabs and its place. Called whenever one may have ended.
  pump(): void {
    if (this.closed) return;
    let free = RUNS_AT_ONCE - this.store.startedRunChats().filter((chatId) => this.chats.isRunning(chatId)).length;
    for (const run of this.store.waitingRuns()) {
      if (free <= 0) return;
      if (this.startRun(run)) free--;
    }
  }

  // Before the window stops every chat, so nothing waiting starts as they end. What's still waiting stays stopped.
  close(): void {
    this.closed = true;
  }

  private startRun(run: { id: string; cardId: string; row: string[] }): boolean {
    const card = this.store.card(run.cardId);
    if (!card?.each) return false;
    const sent = this.chats.send(null, card.each.prompt, {
      seePage: false,
      mascotId: card.mascotId,
      cardAnswer: rowAnswer(this.sourceName(card.id), card.each.header, run.row),
      started: (chatId) => this.store.setRunChat(run.id, chatId),
      onEnd: () => {
        this.pump();
        this.advance(card.nestId);
      },
      ...this.userSaid(card.id, null, null),
      ...this.attachmentsFor(card.id),
    });
    // Its bird has gone from the flock, or the chat couldn't start. The others still try.
    if (!sent) this.store.setRunState(run.id, "failed");
    this.changed(card.nestId);
    return sent !== null;
  }

  private answerOf(chatId: string): string | null {
    const thread = this.chats.thread(chatId);
    return thread ? latestAnswer(thread.messages) : null;
  }

  // The bird of the card a line comes from, as rows are labelled for the model. Its card may have gone since.
  private sourceName(cardId: string): string {
    const source = this.store.sourceOf(cardId);
    return source ? this.mascots.resolve(source.mascotId).name : "Another card";
  }

  // What the user picked, if every row of it is in the table of the source's latest answer now. Undefined if not.
  private pickedFrom(source: NestCard | null, picked: unknown): PickedRows | undefined {
    const rows = picked as PickedRows;
    const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((cell) => typeof cell === "string");
    if (!source?.chatId || !rows || !strings(rows.header) || !Array.isArray(rows.rows) || rows.rows.length === 0 || !rows.rows.every(strings)) return undefined;
    const text = this.answerOf(source.chatId);
    if (!text || missingRows(rows, findTable(text)).length > 0) return undefined;
    return { header: rows.header, rows: rows.rows };
  }

  private chatsOf(card: NestCard): string[] {
    return [...(card.chatId ? [card.chatId] : []), ...(card.each?.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])) ?? [])];
  }

  private deleteChat(chatId: string): void {
    this.chats.delete(chatId);
    this.events.chatDeleted(chatId);
  }

  // Berry is null, as on a chat, and so is no choice. A deleted or unknown mascot is undefined, refused rather than
  // quietly becoming Berry, who may do more than it.
  private flockId(mascotId: unknown): string | null | undefined {
    if (mascotId === undefined || mascotId === null || mascotId === BERRY.id) return null;
    return this.mascots.all().some((mascot) => mascot.id === mascotId && mascot.deletedAt === null) ? (mascotId as string) : undefined;
  }

  private changed(nestId: string): void {
    const board = this.board(nestId);
    if (board) this.events.onBoard(board);
    this.events.onListChanged();
  }
}
