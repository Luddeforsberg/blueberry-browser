import type { Chats } from "./Chats";
import type { NestStore } from "./NestStore";
import type { MascotStore } from "./MascotStore";
import type { ChatThread, NestBoard, NestCard, NestSummary } from "../shared/library";
import type { NestNewCard, NestSendEachResult } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { findTable, missingRows, RUNS_AT_ONCE, runCountProblem, STALE_ROWS, type PickedRows } from "../shared/nestTable";
import { latestAnswer, rowAnswer, rowsAnswer, runsAnswer, type CardAnswer } from "./nestContext";

const MAX_TITLE_LENGTH = 100;
const NEW_NEST_TITLE = "Untitled nest";
// Far past any board anyone would make, so a bad number can't put a card somewhere it can never be found.
const MAX_COORDINATE = 1_000_000;

export interface NestEvents {
  onBoard: (board: NestBoard) => void;
  onListChanged: () => void;
  // A card's chat is gone, so anything showing it closes.
  chatDeleted: (chatId: string) => void;
}

type NestChats = Pick<Chats, "send" | "delete" | "thread" | "isRunning" | "stop">;

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
  constructor(
    private readonly store: NestStore,
    private readonly chats: NestChats,
    // Who a card runs as. Only a mascot in the flock can start one.
    private readonly mascots: Pick<MascotStore, "resolve" | "all">,
    private readonly events: NestEvents
  ) {
    // Runs still waiting when the app last closed don't start by themselves now: the press that queued them was then.
    store.stopWaiting();
  }

  list(): NestSummary[] {
    return this.store.nests().map(({ id, title, updatedAt }) => {
      const cards = this.store.board(id)?.cards ?? [];
      const working = cards.filter((card) => this.chatsOf(card).some((chatId) => this.chats.isRunning(chatId))).map((card) => card.mascotId ?? BERRY.id);
      return { id, title, updatedAt, chatIds: this.store.chatIds(id), working: [...new Set(working)] };
    });
  }

  // Every chat that belongs to a card, which the sidebar's Chats list leaves out.
  cardChats(): Set<string> {
    return new Set(this.store.chatIds());
  }

  board(id: string): NestBoard | null {
    return this.store.board(id);
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

  create(): string {
    const id = this.store.createNest(NEW_NEST_TITLE);
    this.events.onListChanged();
    return id;
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
    // A line comes out of a card with an answer to give, so never out of a draft.
    const source = from === null ? null : this.store.card(from);
    if (from !== null && !source?.chatId && !source?.each) return null;
    // Rows can only be picked from the table in the source's latest answer as it is now, so nothing else gets across.
    const picked = input.picked === undefined || input.picked === null ? null : this.pickedFrom(source, input.picked);
    if (picked === undefined) return null;
    const card = this.store.addCard(nestId, { x, y, from, mascotId, picked });
    if (card) this.changed(nestId);
    return card;
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
    if (!card || !this.store.deleteCard(cardId)) return false;
    this.chatsOf(card).forEach((chatId) => this.deleteChat(chatId));
    this.changed(card.nestId);
    this.pump();
    return true;
  }

  // Sends from a card, and only ever because the user did. A draft starts its chat as its bird. The source card's latest
  // answer is read now, every time, so a card always works from what its source says at the moment it's sent.
  send(cardId: string, text: string): ChatThread | null {
    const card = this.store.card(cardId);
    if (!card || card.each || typeof text !== "string") return null;
    const input = this.inputFor(cardId);
    if ("problem" in input) return null;
    const cardAnswer = input.answer;
    const options = { seePage: false, userPresent: true, ...(cardAnswer ? { cardAnswer } : {}) };
    const sent = card.chatId
      ? this.chats.send(card.chatId, text, options)
      : this.chats.send(null, text, { ...options, mascotId: card.mascotId, started: (chatId) => this.store.setChat(cardId, chatId) });
    if (!sent) return null;
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
    if (!prompt) return { ok: false, error: "Write what to do with each row first." };
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const rows = this.rowsFor(cardId);
    if ("problem" in rows) return { ok: false, error: rows.problem };
    const problem = runCountProblem(rows.rows.length);
    if (problem) return { ok: false, error: problem };
    if (!this.store.startForEach(cardId, prompt, rows.header, rows.rows)) return { ok: false, error: "This card has been sent already." };
    this.changed(card.nestId);
    this.pump();
    return { ok: true };
  }

  // A reply in one run's thread, which gets its row again, and only its row.
  sendRun(runId: string, text: string): ChatThread | null {
    const run = this.store.run(runId);
    const card = run && this.store.card(run.cardId);
    if (!run?.chatId || !card?.each || typeof text !== "string") return null;
    const sent = this.chats.send(run.chatId, text, { seePage: false, userPresent: true, cardAnswer: rowAnswer(this.sourceName(card.id), card.each.header, run.row) });
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
    let free = RUNS_AT_ONCE - this.store.startedRunChats().filter((chatId) => this.chats.isRunning(chatId)).length;
    for (const run of this.store.waitingRuns()) {
      if (free <= 0) return;
      if (this.startRun(run)) free--;
    }
  }

  private startRun(run: { id: string; cardId: string; row: string[] }): boolean {
    const card = this.store.card(run.cardId);
    if (!card?.each) return false;
    const sent = this.chats.send(null, card.each.prompt, {
      seePage: false,
      mascotId: card.mascotId,
      cardAnswer: rowAnswer(this.sourceName(card.id), card.each.header, run.row),
      started: (chatId) => this.store.setRunChat(run.id, chatId),
      onEnd: () => this.pump(),
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
    const board = this.store.board(nestId);
    if (board) this.events.onBoard(board);
    this.events.onListChanged();
  }
}
