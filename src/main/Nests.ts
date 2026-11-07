import type { Chats } from "./Chats";
import type { NestStore } from "./NestStore";
import type { MascotStore } from "./MascotStore";
import type { ChatThread, NestBoard, NestCard, NestSummary } from "../shared/library";
import type { NestNewCard } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { latestAnswer, type CardAnswer } from "./nestContext";

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

type NestChats = Pick<Chats, "send" | "delete" | "thread" | "isRunning">;

const coordinate = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : null;

// Every card is one chat through `Chats`, so its bird's limits, Ask before acting, approvals, Needs you and the step
// limit apply as in any chat. A line only adds the source card's latest answer, as untrusted data, when the user sends.
export class Nests {
  constructor(
    private readonly store: NestStore,
    private readonly chats: NestChats,
    // Who a card runs as. Only a mascot in the flock can start one.
    private readonly mascots: Pick<MascotStore, "resolve" | "all">,
    private readonly events: NestEvents
  ) {}

  list(): NestSummary[] {
    return this.store.nests().map(({ id, title, updatedAt }) => {
      const cards = this.store.board(id)?.cards ?? [];
      const working = cards.filter((card) => card.chatId && this.chats.isRunning(card.chatId)).map((card) => card.mascotId ?? BERRY.id);
      return { id, title, updatedAt, chatIds: cards.flatMap((card) => (card.chatId ? [card.chatId] : [])), working: [...new Set(working)] };
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

  // Its cards' chats go with it.
  delete(id: string): boolean {
    const chatIds = this.store.chatIds(id);
    if (!this.store.deleteNest(id)) return false;
    chatIds.forEach((chatId) => this.deleteChat(chatId));
    this.events.onListChanged();
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
    if (from !== null && !this.store.card(from)?.chatId) return null;
    const card = this.store.addCard(nestId, { x, y, from, mascotId });
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

  deleteCard(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card || !this.store.deleteCard(cardId)) return false;
    if (card.chatId) this.deleteChat(card.chatId);
    this.changed(card.nestId);
    return true;
  }

  // Sends from a card, and only ever because the user did. A draft starts its chat as its bird. The source card's latest
  // answer is read now, every time, so a card always works from what its source says at the moment it's sent.
  send(cardId: string, text: string): ChatThread | null {
    const card = this.store.card(cardId);
    if (!card || typeof text !== "string") return null;
    const cardAnswer = this.answerFor(cardId);
    const options = { seePage: false, userPresent: true, ...(cardAnswer ? { cardAnswer } : {}) };
    const sent = card.chatId
      ? this.chats.send(card.chatId, text, options)
      : this.chats.send(null, text, { ...options, mascotId: card.mascotId, started: (chatId) => this.store.setChat(cardId, chatId) });
    if (!sent) return null;
    this.store.touch(card.nestId);
    this.changed(card.nestId);
    return sent;
  }

  // What a card gets from the card its line comes from, if that card has answered.
  answerFor(cardId: string): CardAnswer | null {
    const source = this.store.sourceOf(cardId);
    const thread = source?.chatId ? this.chats.thread(source.chatId) : null;
    const text = thread && latestAnswer(thread.messages);
    return text ? { name: this.mascots.resolve(thread.mascotId).name, text } : null;
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
