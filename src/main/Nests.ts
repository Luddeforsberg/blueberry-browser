import type { Chats } from "./Chats";
import type { NestStore } from "./NestStore";
import type { MascotStore } from "./MascotStore";
import type { ChatThread, MascotProfile, NestBoard, NestCard, NestFileContent, NestLine, NestSection, NestSummary } from "../shared/library";
import type { NestAnglesResult, NestAskOptions, NestAskResult, NestAttachResult, NestFromChatResult, NestNewCard, NestRetryResult, NestRunPlanResult, NestSendEachResult, NestTableResult } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { combinedTable, findTable, MAX_CONTEXT_LENGTH, MAX_CROSSING_LENGTH, MAX_INPUTS, MAX_RUNS, missingRows, RUNS_AT_ONCE, runCountProblem, STALE_ROWS, type FilesCrossing, type LineCrossing, type PickedRows } from "../shared/nestTable";
import { CARD_GAP, CARD_HEIGHT, CARD_SIZE, CARD_WIDTH, freeSpot, PAGE_CARD, type Rect } from "../shared/nestPlace";
import { chainCrossings, fitChain, gatherChain, knowsOf, latestAnswer, MAX_EARLIER_CARDS, sentLength, threadOf, type CardAnswer, type ChainEdge, type RawInput } from "./nestContext";
import { DEFAULT_COLUMN, fallbackCell, linkChecked, NO_WRITER, shortCell, type NestWriter } from "./nestCells";
import { tableFromFile } from "./nestCsv";
import { allowedBefore, armedStep, checkPlan, CLOSED_BEFORE_START, NO_CARDS, PROMISED, replyState, retryable, runsState, sourcesState, type PlanCard, type PlanSource, type SourceState } from "./nestPlan";
import { PLAN_SYSTEM_PROMPT, planDigest, type BoardCardDigest, type PlannedDigest } from "./nestPlanner";
import type { AttachmentRow, AttachTo, CardLine, NewPlannedCard } from "./NestStore";
import { checkFile, filePreview, MAX_NOTE_LENGTH, roomProblem, sizeInWords, typeInWords, type MadeFile, type ModelInputs, type SentAttachment } from "./nestFiles";
import { CardGrants } from "./cardGrant";
import { EMPTY_HTML_DATA, htmlCardDocument, htmlCardDownload, type HtmlCardData, type HtmlCardTable } from "../shared/nestHtml";
import { CHART_LIBRARY } from "./chartLibrary";
import { createHash } from "crypto";
import { perRunEstimate } from "../shared/modelPrices";
import type { CardGrantAccess } from "./Chats";
import { checkAddress, cleanTitle, pageName } from "../shared/nestPages";
import type { NestSince, UsedPage, WorkTabState } from "../shared/library";
import type { EndedReply } from "./Chats";
import { cardName, whose } from "../shared/nestNames";
import { changedSince, missed, NO_RECAP, sinceFallback, type CardChange, type NestRecapWriter } from "./nestReturn";
import type { CardKnows } from "../shared/nestKnows";
import { agreed, changedLines, fingerprint, SENT_NOTHING } from "./nestStale";
import { MAX_ANGLE_LENGTH, MAX_VERSIONS, moreLike, versionLetter } from "../shared/nestVersions";
import { versionText } from "./nestVersions";
import { isSectionColor, nextColor, planSection, SECTION_NAME, SECTION_SIZE, sectionName } from "../shared/nestSections";

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

type NestChats = Pick<Chats, "send" | "delete" | "thread" | "isRunning" | "stop" | "inCloud" | "costOf" | "roughJobCost" | "withoutCodes">;

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
// How tall a planned card is taken to be in its plan's section: more than where it's placed, since a long prompt, a bird's
// limits and a line about its table make it taller.
const PLAN_SECTION_HEIGHT = 300;
const MAX_TAKEN = 500;
// The pictures an HTML card's page gets as data, together, so its page stays small enough to draw.
const MAX_HTML_IMAGE_BYTES = 8 * 1024 * 1024;
// What an HTML card's page is built from: the bird's page as it wrote it, and the hash its policy names our script by.
const htmlSource = (data: Uint8Array) => Buffer.from(data).toString("utf8").replace(/^\uFEFF/, "");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("base64");
const STILL_PLANNING = "Berry is still changing the plan. Try again in a moment.";
const PLAN_FAILED = "I couldn’t plan that just now. Try again, or click the board to start a card yourself.";
const planRefused = (why: string) => `I couldn’t lay that out as cards, because ${why}. Try asking another way.`;
// What a note's card is called to the model.
const NOTE_NAME = "Berry's note";
// Said in place of a reply that came with no cards and wasn't a question or an answer about the board, so Berry never
// says it will do something it hasn't laid out.
const NO_CARDS_MADE = "I didn’t make any cards for that, so nothing will run. Say what you’d like done, or ask me about what the cards found.";
// What Update sends on a card whose earlier card changed: always these words, never the model's or the renderer's.
const UPDATE_MESSAGE = "An earlier card changed. Update your answer with what’s new.";

// What a card gets when it sends: each input's answer, fitted into one room together and in the order the card shows
// them, none for a line whose source hasn't answered, or a reason it can't send at all.
type CardInput = { answers: CardAnswer[] } | { problem: string };

// One line's input before it's fitted, null before its source has anything to give, or stale when the rows picked on it
// have gone from their source.
type LineInput = RawInput | null | "stale";

// The window's tabs, as a Nest's page cards need them: an open web tab's address and title, and the tabs a card's
// running job is using. Tab ids start again each launch, so a card only ever holds one in memory.
export interface NestTabs {
  info: (tabId: string) => { url: string; title: string; favicon: string | null } | null;
  // The address and title an open tab may be kept under on the board, as a reply keeps a page: past a handoff only its
  // site and path, none for a tab a code was typed into, and codes the user typed taken out.
  keep: (tabId: string) => UsedPage | null;
  // Null once the job has ended. Only tabs in this window, never a cloud page.
  work: (chatId: string) => { tabs: { id: string; state: WorkTabState; current: boolean }[] } | null;
}

const NO_TABS: NestTabs = { info: () => null, keep: () => null, work: () => null };

// Where a card is taken to be in main, which never measures one: its own size, or the usual one for its kind.
const rectOfCard = (card: NestCard): Rect =>
  card.page ? { x: card.x, y: card.y, ...PAGE_CARD } : { x: card.x, y: card.y, width: card.size?.width ?? CARD_WIDTH, height: card.size?.height ?? CARD_HEIGHT };

const coordinate = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : null;

// A section's place and size from a renderer, on the board and within the sizes a section can be, or null.
const sectionRect = (value: unknown): Rect | null => {
  const rect = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const x = coordinate(rect.x);
  const y = coordinate(rect.y);
  const size = (each: unknown, min: number, max: number) => (typeof each === "number" && Number.isFinite(each) ? Math.min(max, Math.max(min, each)) : null);
  const width = size(rect.width, SECTION_SIZE.minWidth, SECTION_SIZE.maxWidth);
  const height = size(rect.height, SECTION_SIZE.minHeight, SECTION_SIZE.maxHeight);
  return x === null || y === null || width === null || height === null ? null : { x, y, width, height };
};

// Every card is one chat through `Chats`, so its bird's limits, Ask before acting, approvals, Needs you and the step
// limit apply as in any chat. A line only adds the source card's thread, or the rows picked from it, and what that card
// got from its own lines further up, as untrusted data, when the user sends. A card sent with For each row is one chat
// per row, each also an ordinary chat through `Chats`, started a few at a time from the one press.
export class Nests {
  // Set as the window closes, when stopping every chat would otherwise let waiting runs take their places.
  private closed = false;
  // What the user wrote in each Nest's composer, while Berry plans it.
  private readonly planning = new Map<string, string>();
  // Nests the cheap model is naming right now, and how many times each has been tried since launch.
  private readonly naming = new Set<string>();
  private readonly nameTries = new Map<string, number>();
  // Runs whose value is being written from their answer, each with the newest request for it, so an older one that comes
  // back late never replaces a newer answer's value.
  private readonly fills = new Map<string, number>();
  private fillTurn = 0;
  // For-each cards whose column the cheap model is naming.
  private readonly columnNaming = new Set<string>();
  // What crosses each line, by its id, with the revision of its source it was worked out for, so a board sent again
  // because a card moved builds no table, and only a new answer, value or column does.
  private readonly crossings = new Map<string, { nestId: string; revision: string; value: LineCrossing | null }>();
  // Allow for this card's runs, by For-each card, in memory only. Each ends when its card finishes, stops or goes.
  private readonly grants = new CardGrants();
  // The files a For-each card's lines brought that it had no room for, said to each of its runs. Memory only.
  private readonly missingFiles = new Map<string, string[]>();
  // Which open tab each page card shows, by card. Memory only, since tab ids start again each launch: after a restart,
  // or once its tab has closed, a page card is a link.
  private readonly tabOf = new Map<string, string>();
  // Cards whose job's tabs show around them, while it runs, each with the tabs the user took off the board meanwhile,
  // which don't come back while it runs. Memory only.
  private readonly showing = new Map<string, Set<string>>();
  // The Nest in the window's front tab, and whether the window is showing, as `screen` last heard. Memory only.
  private front: { nestId: string; showing: boolean } | null = null;
  // The cards the board has in sight, or open, by Nest, as its page last said. Memory only.
  private readonly inSight = new Map<string, Set<string>>();
  // The approval each card's chat is waiting on, so only a new one counts as the card changing. Memory only.
  private readonly asking = new Map<string, string>();
  // The newest request for each card's title, so one that comes back late never replaces a newer answer's.
  private readonly titling = new Map<string, number>();
  private titleTurn = 0;
  // The Nest the user can see now: in the front tab of a showing window. Memory only.
  private here: string | null = null;
  // What changed since each Nest was last open, from the last time it was opened this launch.
  private readonly since = new Map<string, NestSince>();
  private sinceTurn = 0;
  // Each Nest's visits this launch, so a summary lands only on the visit it was written for, and the summary still being
  // written for one, with when the Nest was last open before it, so leaving and coming back before it lands loses nothing.
  private readonly visits = new Map<string, number>();
  private readonly summing = new Map<string, { visit: number; seenAt: number }>();
  // What a card not sent yet will read when it is, with the revision of its chain it was counted for.
  private readonly willKnow = new Map<string, { nestId: string; revision: string; value: CardKnows | null }>();
  // The lines into each sent card whose source changed since it sent with them, with the revision of its sources and how
  // many times it has sent this launch, which they were worked out for.
  private readonly changedInto = new Map<string, { nestId: string; revision: string; value: string[] }>();
  private readonly sends = new Map<string, number>();
  // A file's card's fingerprint, which never changes, since a file on the board is never replaced.
  private readonly fileFingerprints = new Map<string, string | null>();

  constructor(
    private readonly store: NestStore,
    private readonly chats: NestChats,
    // Who a card runs as. Only a mascot in the flock can start one.
    private readonly mascots: Pick<MascotStore, "resolve" | "all">,
    private readonly events: NestEvents,
    private readonly planner: NestPlanner = NO_PLANNER,
    private readonly namer: NestNamer = NO_NAMER,
    // The cheap model, writing a For-each card's column name and each row's value in it.
    private readonly writer: NestWriter = NO_WRITER,
    private readonly tabs: NestTabs = NO_TABS,
    // The cheap model, naming a card for what it found and saying what changed while a Nest wasn't open.
    private readonly recap: NestRecapWriter = NO_RECAP
  ) {
    // Runs still waiting when the app last closed don't start by themselves now: the press that queued them was then.
    // Cards of a plan that hadn't started don't either.
    store.stopWaiting();
    store.holdAfter(null, CLOSED_BEFORE_START);
    // A running job's tabs shown around its card were views of that job, which ended with the app.
    store.deleteJobPages();
    // Runs that ended while a value was still being written, when the app last closed, get theirs once the window is up.
    setTimeout(() => store.endedRunsWithoutCell().forEach((runId) => !this.fills.has(runId) && this.fillCell(runId)), 0);
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

  // With what only main knows: which values and column names are being written, and what crosses each line now.
  board(id: string): NestBoard | null {
    const board = this.store.board(id);
    if (!board) return null;
    const changed = new Set<string>();
    const cards = board.cards.map((card) => {
      if (card.page) return { ...card, page: this.livePage(card.id, card.page) };
      const knows = this.knowsFor(id, card, board.cards, board.lines);
      const into = this.changedLinesInto(id, card, board.cards, board.lines);
      into.forEach((lineId) => changed.add(lineId));
      const withCost = {
        ...card,
        cost: this.costOf(card),
        perRun: this.perRunOf(card),
        ...(this.showing.has(card.id) ? { showingTabs: true } : {}),
        ...(knows ? { knows } : {}),
        ...(into.length > 0 ? { earlierChanged: true as const } : {}),
      };
      return card.each
        ? { ...withCost, each: { ...card.each, naming: this.columnNaming.has(card.id), runs: card.each.runs.map((run) => ({ ...run, filling: this.fills.has(run.id) })) } }
        : withCost;
    });
    const lines = board.lines.map((line) => ({ ...line, crosses: this.crossingOf(id, line, cards, board.lines), ...(changed.has(line.id) ? { changed: true as const } : {}) }));
    for (const [lineId, { nestId }] of this.crossings) if (nestId === id && !board.lines.some((line) => line.id === lineId)) this.crossings.delete(lineId);
    for (const [cardId, { nestId }] of this.willKnow) if (nestId === id && !board.cards.some((card) => card.id === cardId && !card.chatId && !card.each && !card.versions)) this.willKnow.delete(cardId);
    for (const [cardId, { nestId }] of this.changedInto) if (nestId === id && !board.cards.some((card) => card.id === cardId)) this.changedInto.delete(cardId);
    return { ...board, cards, lines, planning: this.planning.get(id) ?? null, naming: this.naming.has(id), since: this.since.get(id) ?? null };
  }

  // What a card knows from other cards: what its last message went with, or before it's sent, what it would read now,
  // counted by the same chain and room, worked out again only when its chain has changed. Nothing on a card that reads
  // nothing, such as a file's.
  private knowsFor(nestId: string, card: NestCard, cards: readonly NestCard[], lines: readonly NestLine[]): CardKnows | null {
    if (card.page || card.file || card.note || card.table) return null;
    if (card.chatId || card.each || card.versions) return card.knows ?? null;
    const revision = `${this.chainRevision(card.id, cards, lines)}|${!!card.plan?.each}`;
    const known = this.willKnow.get(card.id);
    if (known?.revision === revision) return known.value;
    const answers = card.plan?.each ? this.runKnows(card.id) : this.inputFor(card.id);
    const copied = this.store.copiedFrom(card.id);
    const { sends, leftOut } = this.filesFor(card.id);
    const own = card.attachments;
    const value =
      "problem" in answers
        ? null
        : knowsOf(
            answers.answers,
            {
              // Its own files, copies it has already among them, and those its lines bring that it has no copy of yet.
              files: own.filter((each) => each.kind === "file").length + sends.filter((each) => !copied.has(each.card.id)).length,
              notes: own.filter((each) => each.kind === "note").length,
              leftOutFiles: leftOut.length,
            },
            false,
            0
          );
    this.willKnow.set(card.id, { nestId, revision, value });
    return value;
  }

  // What a planned For-each card's runs will each get, counted for its longest row, as its line says.
  private runKnows(cardId: string): CardInput {
    const input = this.inputFor(cardId);
    const rows = this.rowsFor(cardId);
    if ("problem" in input) return input;
    if ("problem" in rows) return rows;
    const lines = this.store.linesTo(cardId);
    const direct = lines.map((line) => ({ lineId: line.lineId, from: line.source.id, name: this.labelOf(line.source), input: this.lineInput(line) as RawInput | null }));
    return { answers: this.longestRun(cardId, rows, direct).map(({ answer }) => answer) };
  }

  // Hears what a card's message went with as `Chats` builds it, so what the card says it knows is what went. A tab's
  // text is read then, and it may have moved on since the card sent, so its address is remembered again as it went with
  // the text read.
  private heard(cardId: string, nestId: string, runId: string | null = null): { onContext: (answers: readonly CardAnswer[], attachments: readonly SentAttachment[]) => void } {
    return {
      onContext: (answers, attachments) => {
        const knows = knowsOf(answers, attachments, true, Date.now());
        if (!this.store.setKnows(cardId, knows)) return;
        // A version keeps its own, which the card shows while it's the pick.
        if (runId) this.store.setRunKnows(runId, knows);
        const read = new Map(
          answers.flatMap((answer) => {
            const checked = answer.part === "page" && answer.via === undefined && answer.page?.tabId ? checkAddress(answer.page.url) : null;
            return checked?.ok ? [[answer.page!.tabId!, this.pagePrint(checked.url)] as const] : [];
          })
        );
        const went = new Map(
          this.store.linesTo(cardId).flatMap((line) => {
            const print = line.source.page ? read.get(this.tabOf.get(line.source.id) ?? "") : undefined;
            return print ? [[line.lineId, print] as const] : [];
          })
        );
        if (went.size > 0) this.remember(cardId, runId, went);
        this.changed(nestId);
      },
    };
  }

  // Remembers what crossed each line into a card as it sent, as a fingerprint: on the card, or on the one run of For each
  // row that sent. A run leaves out the line its rows come from, since every run gets a row of the table the card was
  // sent with, whatever that card says now. `went` when it's known exactly, by line.
  private remember(cardId: string, runId: string | null, known?: ReadonlyMap<string, string>): void {
    const lines = this.store.linesTo(cardId);
    // Every version gets every line whole, so only a For-each run has a line to leave out.
    const driving = runId && this.store.card(cardId)?.each ? (this.store.eachLine(cardId) ?? lines[0]?.lineId) : null;
    const went = known ?? new Map(lines.filter((line) => line.lineId !== driving).map((line) => [line.lineId, this.fingerprintOf(line) ?? SENT_NOTHING]));
    if (went.size === 0) return;
    if (runId) this.store.keepRunSentWith(runId, went);
    else this.store.keepSentWith(cardId, went);
    this.sentChanged(cardId);
  }

  // What a card's lines were sent with changed, so whether an earlier card changed is worked out again.
  private sentChanged(cardId: string): void {
    this.sends.set(cardId, (this.sends.get(cardId) ?? 0) + 1);
  }

  // A source still answering, or with For-each runs going, waiting or having their values written, has nothing whole to
  // give yet, so it can't have changed until it's done.
  private busy(source: NestCard): boolean {
    if (source.chatId && this.chats.isRunning(source.chatId)) return true;
    if (source.versions) return source.versions.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
    return !!source.each?.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)) || this.fills.has(run.id));
  }

  // A page's address as a fingerprint, with codes the user typed taken out, as it goes to the model.
  private pagePrint(url: string): string {
    return fingerprint({ name: "", part: "page", url: this.clean(url), title: "", tabId: null })!;
  }

  // What a line gives now, as a fingerprint: a file's bytes, a page's address, or what its source gives of its own.
  private fingerprintOf(line: CardLine): string | null {
    if (!line.source.file) {
      const input = this.lineInput(line);
      return input && input !== "stale" && input.part === "page" ? this.pagePrint(input.url) : fingerprint(input);
    }
    const id = line.source.id;
    if (!this.fileFingerprints.has(id)) this.fileFingerprints.set(id, fingerprint(null, this.store.fileOf(id)?.data ?? null));
    return this.fileFingerprints.get(id)!;
  }

  // The lines into a sent or For-each card whose source has changed since the card last sent with them, so the card can
  // say an earlier card changed. Only the card's own lines, never further up: a card below changes in turn, once this one
  // answers again. Worked out again only when one of its sources has changed, or it has sent.
  private changedLinesInto(nestId: string, card: NestCard, cards: readonly NestCard[], lines: readonly NestLine[]): string[] {
    if (!card.chatId && !card.each && !card.versions) return [];
    const into = lines.filter((line) => line.to === card.id);
    if (into.length === 0) return [];
    const revision = JSON.stringify([
      this.sends.get(card.id) ?? 0,
      into.map((line) => {
        const source = cards.find((each) => each.id === line.from);
        return [line.id, line.picked, source ? [this.revisionOf(source), this.busy(source)] : ""];
      }),
    ]);
    const known = this.changedInto.get(card.id);
    if (known?.revision === revision) return known.value;
    // A For-each card's runs, and each version, sent on their own.
    const several = !!card.each || !!card.versions;
    const runs = several ? this.store.runsSentWith(card.id) : [];
    const value = changedLines(
      this.store.linesTo(card.id).map((line) => ({
        lineId: line.lineId,
        sent: several ? agreed(runs.map((run) => run[line.lineId])) : line.sentWith,
        now: this.busy(line.source) ? null : this.fingerprintOf(line),
      }))
    );
    this.changedInto.set(card.id, { nestId, revision, value });
    return value;
  }

  // What crosses a line, worked out again only when a source of the card it goes to has changed, since its inputs share
  // one room. The rows picked on a line never change.
  private crossingOf(nestId: string, line: NestLine, cards: readonly NestCard[], lines: readonly NestLine[]): LineCrossing | null {
    const into = lines.filter((each) => each.to === line.to);
    const revision = this.chainRevision(line.to, cards, lines);
    const known = this.crossings.get(line.id);
    if (known?.revision === revision) return known.value;
    const values = this.crossingsInto(line.to);
    for (const each of into) this.crossings.set(each.id, { nestId, revision, value: values.get(each.id) ?? null });
    return values.get(line.id) ?? null;
  }

  // What every card up the chain into this one gives depends on, with the lines between them, since all of it shares
  // the card's one room. From the board as sent, so nothing is read from disk for it.
  private chainRevision(cardId: string, cards: readonly NestCard[], lines: readonly NestLine[]): string {
    const seen = new Set([cardId]);
    // The card's own files and notes, which decide how many files its lines bring have room.
    const parts: unknown[] = [cards.find((card) => card.id === cardId)?.attachments.map((attachment) => attachment.id) ?? []];
    for (let level = [cardId]; level.length > 0; ) {
      const next: string[] = [];
      for (const id of level) {
        for (const each of lines.filter((line) => line.to === id)) {
          const source = cards.find((card) => card.id === each.from);
          parts.push([each.id, each.picked ?? null, source && !seen.has(source.id) ? this.revisionOf(source) : ""]);
          if (source && !seen.has(source.id)) {
            seen.add(source.id);
            next.push(source.id);
          }
        }
      }
      level = next;
    }
    return JSON.stringify(parts);
  }

  // What a card gives across a line depends on: a file never changes, a For-each card's column and values, a sent card's
  // thread, which only grows, so its length and latest answer, or where a planned card is.
  private revisionOf(card: NestCard): string {
    if (card.table || card.file || card.note) return "file";
    if (card.page) {
      const input = this.pageInput(card);
      return `page ${input?.part === "page" ? `${input.url} ${input.tabId ?? ""}` : ""}`;
    }
    if (card.each) return JSON.stringify([card.each.column, card.each.runs.map((run) => [run.state, run.cell])]);
    // Which one is picked, and each version's thread, which only grows.
    if (card.versions) {
      const threads = card.versions.runs.map((run) => [run.state, run.chatId ? [this.chats.thread(run.chatId)?.messages.length ?? 0, this.answerOf(run.chatId) ?? ""] : null]);
      return JSON.stringify(["versions", card.versions.pick, threads]);
    }
    if (card.chatId) return `thread ${this.chats.thread(card.chatId)?.messages.length ?? 0} ${this.answerOf(card.chatId) ?? ""}`;
    return `plan ${card.plan?.state ?? ""}`;
  }

  // A page card as it is now: the open tab it shows, if it's still open, and if it's one of a running card's tabs, how
  // that job sees it.
  private livePage(cardId: string, page: NonNullable<NestCard["page"]>): NonNullable<NestCard["page"]> {
    const tabId = this.tabOf.get(cardId);
    const info = tabId ? this.tabs.info(tabId) : null;
    const tab = tabId && info ? { id: tabId, ...info } : null;
    const owner = page.job?.cardId;
    const ownerChat = owner ? this.store.card(owner)?.chatId : null;
    const used = ownerChat && tabId ? this.tabs.work(ownerChat)?.tabs.find((each) => each.id === tabId) : null;
    return { ...page, tab, job: owner ? { cardId: owner, state: used?.state ?? "none", current: used?.current ?? false } : null };
  }

  // The tab a page card shows, for going there. Null for a link, or once its tab has closed.
  tabOfCard(cardId: unknown): string | null {
    const tabId = typeof cardId === "string" ? this.tabOf.get(cardId) : undefined;
    return tabId && this.tabs.info(tabId) ? tabId : null;
  }

  // A link the user dropped on the board, or a tab they dragged there, as a card of its own where they let go, or the
  // first free place under it. A tab's address and title come from the tab itself, never the renderer, and only a web
  // page's. Only http and https, of a sane length, with no name or password in it.
  dropPage(nestId: string, drop: unknown, options: Pick<NestAskOptions, "at" | "taken">): NestTableResult {
    if (!this.store.board(nestId)) return { ok: false, error: "That Nest isn’t there any more." };
    const { url, title, tabId } = (typeof drop === "object" && drop !== null ? drop : {}) as { url?: unknown; title?: unknown; tabId?: unknown };
    const tab = typeof tabId === "string" ? this.tabs.info(tabId) : null;
    if (typeof tabId === "string" && !tab) return { ok: false, error: "That tab isn’t open any more." };
    if (tab && !checkAddress(tab.url).ok) return { ok: false, error: "Only a tab with a web page in it can go on the board." };
    // Kept as a reply keeps a page, so nothing saved can hold a code.
    const kept = tab ? this.tabs.keep(tabId as string) : null;
    if (tab && !kept) return { ok: false, error: "A code went into that tab, so it can’t go on the board." };
    const checked = checkAddress(kept ? kept.url : url);
    if (!checked.ok) return checked;
    const place = this.placing(options);
    const known = this.store.board(nestId)?.cards ?? [];
    const taken = [...place.taken, ...known.filter((card) => !place.taken.some((rect) => rect.x === card.x && rect.y === card.y)).map(rectOfCard)];
    const card = this.store.addPageCard(nestId, { ...freeSpot(taken, place.at, PAGE_CARD), url: checked.url, title: cleanTitle(kept ? kept.title : title), dropped: true });
    if (!card) return { ok: false, error: "That Nest isn’t there any more." };
    if (tab) this.tabOf.set(card.id, tabId as string);
    this.changed(nestId);
    return { ok: true, cardId: card.id };
  }

  // Shows a running card's tabs around it, or stops. Only a card's own chat, running here: never a For-each card, whose
  // runs each have their own, or a job in the cloud, whose pages are never on this board.
  showTabs(cardId: unknown, on: unknown): boolean {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card?.chatId || typeof on !== "boolean") return false;
    if (!on) {
      if (!this.showing.delete(card.id)) return false;
      this.forgetPages(this.store.deleteJobPages(card.id));
      this.changed(card.nestId);
      return true;
    }
    if (!this.chats.isRunning(card.chatId) || this.chats.inCloud(card.chatId) || !this.tabs.work(card.chatId)) return false;
    if (!this.showing.has(card.id)) this.showing.set(card.id, new Set());
    this.syncJobTabs(card.id);
    return true;
  }

  // The window's tabs changed: one opened, closed, moved or changed hands, or a job used another. Each card showing its
  // tabs catches up, and every board with a page card hears what its tabs are now.
  tabsChanged(): void {
    for (const cardId of [...this.showing.keys()]) this.syncJobTabs(cardId);
    const nests = new Set([...this.tabOf.keys()].flatMap((cardId) => this.store.card(cardId)?.nestId ?? []));
    nests.forEach((nestId) => this.events.onBoard(this.board(nestId)!));
  }

  // One card's job's tabs as cards around it, each joined to it by a line: one appears as the job uses a tab, placed clear
  // of every card, and goes when the tab closes or the job lets it go. Each is only a view, adding nothing to any send.
  private syncJobTabs(cardId: string): void {
    const card = this.store.card(cardId);
    const work = card?.chatId ? this.tabs.work(card.chatId) : null;
    if (!card || !work) return void this.showing.delete(cardId);
    let changed = false;
    const shown = this.store.jobPages(cardId);
    for (const page of shown) {
      const tabId = this.tabOf.get(page.id);
      if (tabId && work.tabs.some((tab) => tab.id === tabId) && this.tabs.info(tabId)) continue;
      this.forgetPages(this.store.deletePage(page.id) ? [page.id] : []);
      changed = true;
    }
    for (const tab of work.tabs) {
      const info = this.tabs.info(tab.id);
      if (!info || this.showing.get(cardId)?.has(tab.id) || [...this.tabOf].some(([id, each]) => each === tab.id && shown.some((page) => page.id === id))) continue;
      const live = checkAddress(info.url);
      if (!live.ok) continue;
      // While it's a view, the tab itself is what shows. What's saved is only what a reply would keep of it, or its site.
      const kept = this.tabs.keep(tab.id);
      const checked = kept ? checkAddress(kept.url) : null;
      const rects = this.store.board(card.nestId)!.cards.map(rectOfCard);
      const from = rectOfCard(card);
      const spot = freeSpot(rects, { x: from.x + from.width + CARD_GAP, y: from.y }, PAGE_CARD);
      const saved = checked?.ok ? { url: checked.url, title: cleanTitle(kept!.title) } : { url: new URL(live.url).origin + "/", title: "" };
      const made = this.store.addPageCard(card.nestId, { ...spot, ...saved, job: cardId });
      if (made) {
        this.tabOf.set(made.id, tab.id);
        changed = true;
      }
    }
    if (changed) this.changed(card.nestId);
  }

  // A card's job has ended. Its tabs that closed leave the board, ones still open stay as tab cards, and the pages its
  // reply kept stay as link cards, joined to it, so the user can open any of them again.
  private finishJobTabs(cardId: string, pages: readonly UsedPage[]): void {
    if (!this.showing.delete(cardId)) return;
    const card = this.store.card(cardId);
    if (!card) return;
    const kept = new Set<string>();
    for (const page of this.store.jobPages(cardId)) {
      const tabId = this.tabOf.get(page.id);
      const open = tabId && this.tabs.info(tabId) ? this.tabs.keep(tabId) : null;
      const checked = open ? checkAddress(open.url) : null;
      if (open && checked?.ok) {
        this.store.keepPage(page.id, { url: checked.url, title: cleanTitle(open.title) });
        kept.add(checked.url);
      } else this.forgetPages(this.store.deletePage(page.id) ? [page.id] : []);
    }
    for (const page of pages) {
      const checked = checkAddress(page.url);
      if (!checked.ok || kept.has(checked.url)) continue;
      kept.add(checked.url);
      const rects = this.store.board(card.nestId)!.cards.map(rectOfCard);
      const from = rectOfCard(card);
      const spot = freeSpot(rects, { x: from.x + from.width + CARD_GAP, y: from.y }, PAGE_CARD);
      this.store.addPageCard(card.nestId, { ...spot, url: checked.url, title: cleanTitle(page.title), from: cardId });
    }
    this.changed(card.nestId);
  }

  private forgetPages(cardIds: readonly string[]): void {
    cardIds.forEach((id) => this.tabOf.delete(id));
  }

  // The addresses the user put on the board that a card reads from directly, each counting as one they named for that
  // card's sends, that exact address and nothing else on its site. Only a page the user dropped there, never one of a
  // job's tabs or a page a job kept, and never one further up the chain.
  private givenAddresses(cardId: string): { givenAddresses?: string[] } {
    const given = this.store.linesTo(cardId).flatMap(({ source }) => (source.page?.dropped ? [source.page.url] : []));
    return given.length > 0 ? { givenAddresses: given } : {};
  }

  // A file's whole table, which the card asks for when it's shown, since boards carry only its first rows.
  tableRows(cardId: unknown): string[][] | null {
    return typeof cardId === "string" ? this.store.tableRows(cardId) : null;
  }

  // What crosses each line into a card now, by the line's id: what it gives when the card sends, and with For each row,
  // what each run gets from it, its row on the line that drives the runs and the whole input on the others. Nothing for
  // a line whose source has nothing to give yet.
  private crossingsInto(cardId: string): Map<string, LineCrossing> {
    const lines = this.store.linesTo(cardId);
    const inputs = lines.map((line) => this.lineInput(line));
    const direct = lines.map((line, index) => {
      const input = inputs[index];
      return { lineId: line.lineId, from: line.source.id, name: this.labelOf(line.source), input: input && input !== "stale" ? input : null };
    });
    const whole = chainCrossings(fitChain(this.chainOf(cardId, direct), MAX_CONTEXT_LENGTH, this.clean));
    const rows = this.rowsFor(cardId);
    const each = new Map<string, LineCrossing["each"]>();
    const shared = new Map<string, LineCrossing["whole"]>();
    if (!("problem" in rows)) {
      const fitted = this.longestRun(cardId, rows, direct);
      const counted = chainCrossings(fitted);
      const row = fitted.find((each) => each.lineId === rows.lineId && each.depth === 1)!;
      const before = counted.get(rows.lineId)?.before;
      each.set(rows.lineId, { rows: rows.rows.length, columns: rows.header.length, cut: row.answer.cutTo != null, ...(before ? { before } : {}) });
      for (const line of direct) if (line.lineId !== rows.lineId && counted.has(line.lineId)) shared.set(line.lineId, counted.get(line.lineId)!);
    }
    // The files each line brings, from a file's card on it or further up, and those the card has no room for.
    const { sends, leftOut } = this.filesFor(cardId);
    const filesOn = (lineId: string): FilesCrossing | null => {
      const names = sends.filter((each) => each.lineId === lineId).map((each) => each.card.file!.name);
      const lost = leftOut.filter((each) => each.lineId === lineId).map((each) => each.card.file!.name);
      return names.length > 0 || lost.length > 0 ? { names, leftOut: lost } : null;
    };
    const crossings = new Map<string, LineCrossing>();
    lines.forEach((line, index) => {
      const files = filesOn(line.lineId);
      if (inputs[index] === "stale") {
        crossings.set(line.lineId, { stale: true, whole: null, each: null });
        return;
      }
      const value: LineCrossing = {
        stale: false,
        whole: whole.get(line.lineId) ?? null,
        each: each.get(line.lineId) ?? null,
        // Which line drives the runs only needs saying when there's more than one.
        ...(each.has(line.lineId) && lines.length > 1 ? { drives: true } : {}),
        ...(shared.has(line.lineId) ? { shared: shared.get(line.lineId) } : {}),
        ...(files ? { files } : {}),
      };
      if (value.whole || value.each || value.shared || value.files) crossings.set(line.lineId, value);
    });
    return crossings;
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
    const cardIds = this.store.board(id)?.cards.map((card) => card.id) ?? [];
    if (!this.store.deleteNest(id)) return false;
    cardIds.forEach((cardId) => this.grants.end(cardId));
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
    // of the plan, but not while Berry changes the plan, which would replace it.
    const source = from === null ? null : this.store.card(from);
    const planned = source?.plan?.state === "planned";
    if (from !== null && !source?.chatId && !source?.each && !source?.versions && !source?.table && !source?.file && !source?.page && !source?.note && !planned) return null;
    if (source && this.replanned(source)) return null;
    // Rows can only be picked from the table in the source's latest answer as it is now, so nothing else gets across.
    const picked = input.picked === undefined || input.picked === null || planned ? null : this.pickedFrom(source, input.picked);
    if (picked === undefined) return null;
    const card = this.store.addCard(nestId, { x, y, from, mascotId, picked, planned, auto: input.auto === true });
    if (card) this.changed(nestId);
    return card;
  }

  // Another card's answer as another input on a draft, a planned card or a sent card: a handle dropped on it, or Add an
  // input. A line only comes out of a card with something to give, or out of a planned card of the same plan into
  // another, never makes a circle, and a card reads from 4 at most. On a sent card it's fresh: its earlier messages
  // went without it, and its next one is the first to get it. Never while that card works, since its reply has what it
  // read already. Says why when it can’t.
  addInput(cardId: unknown, fromId: unknown, picked?: unknown): NestSendEachResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    const source = typeof fromId === "string" ? this.store.card(fromId) : null;
    if (!card || !source || source.nestId !== card.nestId) return { ok: false, error: "That card isn’t there any more." };
    if (card.id === source.id) return { ok: false, error: "A card can’t read from itself." };
    const planned = card.plan?.state === "planned";
    if (card.file) return { ok: false, error: "A file’s card can’t read from another card." };
    if (card.page) return { ok: false, error: "A page’s card can’t read from another card." };
    if (card.note) return { ok: false, error: "A note can’t read from another card." };
    if (source.page && card.plan && card.plan.state !== "held") return { ok: false, error: "A page can go to a card you send yourself, not to a card of the plan." };
    if (card.each || card.versions || card.table || (card.plan && !planned && card.plan.state !== "held")) return { ok: false, error: "Only a card that hasn’t been sent can get another input." };
    if (card.chatId && this.chats.isRunning(card.chatId)) return { ok: false, error: "This card is working. Add the line once it’s done." };
    if (this.replanned(card) || this.replanned(source)) return { ok: false, error: STILL_PLANNING };
    const gives = !!source.chatId || !!source.each || !!source.versions || !!source.table || !!source.file || !!source.page || !!source.note;
    if (planned ? !gives && source.plan?.state !== "planned" : !gives) {
      return { ok: false, error: "That card has nothing to give yet." };
    }
    const lines = this.store.linesTo(card.id);
    if (lines.some((line) => line.source.id === source.id)) return { ok: false, error: "This card reads from that one already." };
    if (lines.length >= MAX_INPUTS) return { ok: false, error: `A card can read from ${MAX_INPUTS} cards at most.` };
    if (this.readsFrom(source.id, card.id)) return { ok: false, error: "That would make the cards go round in a circle." };
    const rows = picked === undefined || picked === null || planned ? null : this.pickedFrom(source, picked);
    if (rows === undefined) return { ok: false, error: STALE_ROWS };
    if (!this.store.addLine(card.nestId, source.id, card.id, rows, !!card.chatId)) return { ok: false, error: "That line couldn’t be drawn." };
    this.changed(card.nestId);
    return { ok: true };
  }

  // A line into a card taken away: what the card already sent keeps what it got, and from now on it doesn't read from
  // there. Only into a card the user still sends from, a draft, a planned or held card or a sent one, never a For-each
  // card whose runs read it, one of a plan waiting to start, or a file or page card, whose line only says where it's from.
  removeInput(lineId: unknown): NestSendEachResult {
    const to = typeof lineId === "string" ? this.store.lineTo(lineId) : null;
    const card = to ? this.store.card(to) : null;
    if (!card) return { ok: false, error: "That line isn’t there any more." };
    if (card.file || card.page) return { ok: false, error: "That line only shows where the card came from." };
    if (card.each) return { ok: false, error: "A card sent for each row keeps the lines it was sent with." };
    if (card.versions) return { ok: false, error: "A card sent as versions keeps the lines it was sent with." };
    if (card.plan?.state === "armed") return { ok: false, error: "This card waits to start with these lines." };
    if (this.replanned(card)) return { ok: false, error: STILL_PLANNING };
    const filesBefore = this.chainFiles(card.id).map((each) => each.card.id);
    if (!this.store.deleteLine(lineId as string)) return { ok: false, error: "That line isn’t there any more." };
    // The card's own copies of files it only had through that line go too, so its next message goes without them. A copy
    // of a file whose card was deleted stays, as it always has.
    const filesAfter = new Set(this.chainFiles(card.id).map((each) => each.card.id));
    this.store.dropCopies(card.id, filesBefore.filter((id) => !filesAfter.has(id)));
    this.changed(card.nestId);
    return { ok: true };
  }

  // Whether `cardId` reads from `fromId`, through any number of lines.
  private readsFrom(cardId: string, fromId: string, seen = new Set<string>()): boolean {
    if (cardId === fromId) return true;
    if (seen.has(cardId)) return false;
    seen.add(cardId);
    return this.store.linesTo(cardId).some((line) => this.readsFrom(line.source.id, fromId, seen));
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
    this.events.onBoard(this.board(nestId)!);
    return true;
  }

  moveCard(cardId: string, x: unknown, y: unknown): boolean {
    const to = { x: coordinate(x), y: coordinate(y) };
    if (to.x === null || to.y === null || !this.store.moveCard(cardId, to.x, to.y)) return false;
    const nestId = this.store.card(cardId)?.nestId;
    if (nestId) this.events.onBoard(this.board(nestId)!);
    return true;
  }

  // The size the user made a card from its corner, kept within what the corner allows.
  resizeCard(cardId: string, width: unknown, height: unknown): boolean {
    const fits = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : null);
    const size = { width: fits(width, CARD_SIZE.minWidth, CARD_SIZE.maxWidth), height: fits(height, CARD_SIZE.minHeight, CARD_SIZE.maxHeight) };
    if (size.width === null || size.height === null || !this.store.resizeCard(cardId, size.width, size.height)) return false;
    const nestId = this.store.card(cardId)?.nestId;
    if (nestId) this.events.onBoard(this.board(nestId)!);
    return true;
  }

  // A section drawn on the board, or fitted around cards, called "Section" in the next free colour until the user names it.
  addSection(nestId: string, rect: unknown): NestSection | null {
    const fits = sectionRect(rect);
    if (!fits || !this.store.board(nestId)) return null;
    const section = this.store.addSection(nestId, { name: SECTION_NAME, color: nextColor(this.store.sectionColors(nestId)), ...fits });
    if (section) this.events.onBoard(this.board(nestId)!);
    return section;
  }

  // A section renamed, given another colour, or made bigger or smaller. An empty name keeps the one it has.
  editSection(sectionId: string, change: unknown): boolean {
    const section = typeof sectionId === "string" ? this.store.section(sectionId) : null;
    if (!section || typeof change !== "object" || change === null) return false;
    const { name, color, rect } = change as { name?: unknown; color?: unknown; rect?: unknown };
    const named = name === undefined ? undefined : sectionName(name);
    const fits = rect === undefined ? undefined : sectionRect(rect);
    if (named === "" || fits === null || (color !== undefined && !isSectionColor(color)) || (named === undefined && fits === undefined && color === undefined)) return false;
    if (!this.store.editSection(sectionId, { name: named, color: color as NestSection["color"] | undefined, rect: fits })) return false;
    this.events.onBoard(this.board(section.nestId)!);
    return true;
  }

  // A section moved, and with it the cards and sections inside it, which the board says, since only it measures cards.
  // Only cards and sections of the same Nest move.
  moveSection(sectionId: string, move: unknown): boolean {
    const section = typeof sectionId === "string" ? this.store.section(sectionId) : null;
    if (!section || typeof move !== "object" || move === null) return false;
    const { x, y, cards, sections } = move as { x?: unknown; y?: unknown; cards?: unknown; sections?: unknown };
    const to = { x: coordinate(x), y: coordinate(y) };
    const moves = (list: unknown) =>
      Array.isArray(list)
        ? list.slice(0, MAX_TAKEN).flatMap((each) => {
            const at = { x: coordinate(each?.x), y: coordinate(each?.y) };
            return typeof each?.id === "string" && at.x !== null && at.y !== null ? [{ id: each.id as string, x: at.x, y: at.y }] : [];
          })
        : [];
    if (to.x === null || to.y === null || !this.store.moveSection(sectionId, { x: to.x, y: to.y }, moves(cards), moves(sections))) return false;
    this.events.onBoard(this.board(section.nestId)!);
    return true;
  }

  // Only the section goes: its cards stay where they are.
  deleteSection(sectionId: string): boolean {
    const section = typeof sectionId === "string" ? this.store.section(sectionId) : null;
    if (!section || !this.store.deleteSection(sectionId)) return false;
    this.events.onBoard(this.board(section.nestId)!);
    return true;
  }

  setBird(cardId: string, mascotId: unknown): boolean {
    const card = this.store.card(cardId);
    const bird = this.flockId(mascotId);
    if (!card || card.note || bird === undefined || this.replanned(card) || !this.store.setBird(cardId, bird)) return false;
    this.changed(card.nestId);
    return true;
  }

  // Its chat goes with it, or every run's.
  deleteCard(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card) return false;
    // A card of a run plan that reads from it would otherwise start with nothing to read.
    this.store.holdAfter(cardId, "Didn’t start, because the card it reads from was deleted");
    const views = this.store.jobPages(cardId).map((page) => page.id);
    if (!this.store.deleteCard(cardId)) return false;
    this.forgetPages(views);
    this.grants.end(cardId);
    this.missingFiles.delete(cardId);
    // One of a working card's tabs the user took off the board doesn't come back while that job runs.
    const tabId = this.tabOf.get(cardId);
    if (card.page?.job && tabId) this.showing.get(card.page.job.cardId)?.add(tabId);
    this.tabOf.delete(cardId);
    this.showing.delete(cardId);
    this.willKnow.delete(cardId);
    this.changedInto.delete(cardId);
    this.sends.delete(cardId);
    this.fileFingerprints.delete(cardId);
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
    if (!card || card.each || card.versions || card.table || card.file || card.page || card.note || typeof text !== "string" || (card.plan && card.plan.state !== "held")) return null;
    const input = this.inputFor(cardId);
    if ("problem" in input) return null;
    const missing = this.takeFiles(cardId);
    // When its reply ends, a card of a run plan that reads from it may start.
    const options = {
      seePage: false,
      userPresent: true,
      onEnd: (end: EndedReply) => this.ended(cardId, card.nestId, end),
      ...(input.answers.length > 0 ? { cardAnswers: input.answers } : {}),
      ...this.userSaid(cardId, card.chatId, text),
      ...this.givenAddresses(cardId),
      ...this.attachmentsFor(cardId, missing),
      ...this.heard(cardId, card.nestId),
      saveFile: this.fileSink(cardId),
    };
    const sent = card.chatId
      ? this.chats.send(card.chatId, text, options)
      : this.chats.send(null, text, { ...options, mascotId: card.mascotId, started: (chatId) => this.store.setChat(cardId, chatId) });
    if (!sent) return null;
    this.remember(cardId, null);
    // The user just sent it, so with its Nest in front it's in sight, even before the board has said where it is.
    if (this.front?.nestId === card.nestId) this.inSight.set(card.nestId, new Set([...(this.inSight.get(card.nestId) ?? []), cardId]));
    // Its lines all went with this message, so a fresh one reads like the rest from now on.
    this.store.settleLines(cardId);
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
    if (card?.file) return { ok: false, error: "A file’s card has nothing to send." };
    if (card?.page) return { ok: false, error: "A page’s card has nothing to send." };
    if (card?.note) return { ok: false, error: "A note has nothing to send." };
    if (!card || card.chatId || card.each || card.versions || card.table) return { ok: false, error: "This card has been sent already." };
    if (card.plan && card.plan.state !== "held") return { ok: false, error: "This card goes when you run the plan." };
    if (!prompt) return { ok: false, error: "Write what to do with each row first." };
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const rows = this.rowsFor(cardId);
    if ("problem" in rows) return { ok: false, error: rows.problem };
    const input = this.inputFor(cardId);
    if ("problem" in input) return { ok: false, error: input.problem };
    const problem = runCountProblem(rows.rows.length);
    if (problem) return { ok: false, error: problem };
    if (!this.store.startForEach(cardId, prompt, rows.header, rows.rows, DEFAULT_COLUMN, rows.lineId)) return { ok: false, error: "This card has been sent already." };
    // Its runs all get the files its lines bring, as the card's own copies from now on.
    this.missingFiles.set(cardId, this.takeFiles(cardId));
    this.nameColumn(cardId, prompt);
    this.nameFrom(card.nestId, prompt);
    this.changed(card.nestId);
    this.handedOff(cardId);
    this.pump();
    return { ok: true };
  }

  // Sends a draft as several versions of one answer: one version for each note, each its own chat as the card's bird,
  // with the same prompt and inputs and its own note. They start a few at a time, as For each row's runs do, and each goes
  // through `Chats.send`, so each asks for what it does as any chat would, and whatever it does happens once per version.
  sendVersions(cardId: unknown, text: unknown, notes: unknown): NestSendEachResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!card) return { ok: false, error: "This card isn’t there any more." };
    if (card.table || card.file || card.page || card.note) return { ok: false, error: "Only a bird’s card can be sent as versions." };
    if (card.chatId || card.each || card.versions) return { ok: false, error: "This card has been sent already." };
    if (card.plan && card.plan.state !== "held") return { ok: false, error: "This card goes when you run the plan." };
    if (this.closed) return { ok: false, error: "Blueberry is closing." };
    if (!prompt) return { ok: false, error: "Write what to do first." };
    if (!Array.isArray(notes) || notes.length < 2 || notes.length > MAX_VERSIONS || !notes.every((note) => typeof note === "string")) {
      return { ok: false, error: `A card can be sent as 2 to ${MAX_VERSIONS} versions.` };
    }
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const input = this.inputFor(card.id);
    if ("problem" in input) return { ok: false, error: input.problem };
    const cleaned = (notes as string[]).map((note) => note.replace(/\s+/g, " ").trim().slice(0, MAX_ANGLE_LENGTH));
    if (!this.store.startVersions(card.id, prompt, cleaned)) return { ok: false, error: "This card has been sent already." };
    // Every version gets the files its lines bring, as the card's own copies from now on.
    this.missingFiles.set(card.id, this.takeFiles(card.id));
    if (this.front?.nestId === card.nestId) this.inSight.set(card.nestId, new Set([...(this.inSight.get(card.nestId) ?? []), card.id]));
    this.nameFrom(card.nestId, prompt);
    this.changed(card.nestId);
    this.pump();
    return { ok: true };
  }

  // One version starting, when its turn comes, as the card's bird, with the card's prompt, what the card's lines give
  // now, the card's files, and its own note. A run of More like this also gets the version it's like, as data.
  private startVersion(card: NestCard & { nestId: string }, runId: string): boolean {
    // A version of More like this waits for the one it's like while that one is still to answer, as after Update, so it
    // gets its thread. If that one ends with no answer, this one goes without it.
    const like = this.store.likeOf(runId);
    const liked = like ? card.versions!.runs.find((run) => run.id === like) : undefined;
    if (liked && (liked.state === "waiting" || (!!liked.chatId && this.chats.isRunning(liked.chatId)))) return false;
    const cardAnswers = this.versionInputs(card, runId);
    const sent =
      cardAnswers &&
      this.chats.send(null, card.versions!.prompt, {
        seePage: false,
        mascotId: card.mascotId,
        ...(cardAnswers.length > 0 ? { cardAnswers } : {}),
        started: (chatId) => this.store.setRunChat(runId, chatId),
        onEnd: (end) => this.versionEnded(card.id, runId, end),
        ...this.userSaid(card.id, null, null),
        ...this.givenAddresses(card.id),
        ...this.versionAttachments(card, runId),
        ...this.heard(card.id, card.nestId, runId),
      });
    // Its bird has gone from the flock, rows picked on an input have gone, or the chat couldn't start.
    if (!sent) this.store.setRunState(runId, "failed");
    else this.remember(card.id, runId);
    this.changed(card.nestId);
    return !!sent;
  }

  // A reply typed in one version's tab: it continues only that version's thread, with what the card's lines give now and
  // its note again. It's the user's own press, so it doesn't wait for a place.
  private sendVersion(card: NestCard & { nestId: string }, runId: string, chatId: string, text: string): ChatThread | null {
    const cardAnswers = this.versionInputs(card, runId);
    if (!cardAnswers) return null;
    const sent = this.chats.send(chatId, text, {
      seePage: false,
      userPresent: true,
      ...(cardAnswers.length > 0 ? { cardAnswers } : {}),
      onEnd: (end) => this.versionEnded(card.id, runId, end),
      ...this.userSaid(card.id, chatId, text),
      ...this.givenAddresses(card.id),
      ...this.versionAttachments(card, runId),
      ...this.heard(card.id, card.nestId, runId),
    });
    if (!sent) return null;
    this.remember(card.id, runId);
    this.store.touch(card.nestId);
    this.changed(card.nestId);
    return sent;
  }

  // What one version gets: every line into the card, whole, in one room, as the card would, and for More like this, the
  // thread of the version it's like after them. Null when rows picked on an input have gone.
  private versionInputs(card: NestCard, runId: string): CardAnswer[] | null {
    const lines = this.store.linesTo(card.id);
    const inputs = lines.map((line) => this.lineInput(line));
    if (inputs.includes("stale")) return null;
    const direct = lines.map((line, index) => ({ lineId: line.lineId, from: line.source.id, name: this.labelOf(line.source), input: inputs[index] as RawInput | null }));
    const liked = this.likedVersion(card, runId);
    if (liked) direct.push({ lineId: `like ${liked.id}`, from: `like ${liked.id}`, name: liked.name, input: { name: liked.name, part: "thread", exchanges: liked.exchanges } });
    return fitChain(this.chainOf(card.id, direct), MAX_CONTEXT_LENGTH, this.clean).map(({ answer }) => answer);
  }

  // The version a run of More like this is like, with its letter and thread, if it still has one.
  private likedVersion(card: NestCard, runId: string): { id: string; letter: string; name: string; exchanges: ReturnType<typeof threadOf> } | null {
    const like = this.store.likeOf(runId);
    const liked = like ? card.versions?.runs.find((run) => run.id === like) : undefined;
    const exchanges = liked?.chatId ? threadOf(this.chats.thread(liked.chatId)?.messages ?? []) : [];
    return liked && exchanges.length > 0 ? { id: liked.id, letter: liked.letter, name: `Version ${liked.letter}`, exchanges } : null;
  }

  // A version's files are the card's, and after them which version it is and its note, in words written in code.
  private versionAttachments(card: NestCard, runId: string): { attachments: SentAttachment[] } {
    const versions = card.versions!;
    const run = versions.runs.find((each) => each.id === runId);
    const { attachments = [] } = this.attachmentsFor(card.id);
    const like = this.likedVersion(card, runId)?.letter ?? null;
    const text = versionText({ letter: run?.letter ?? versionLetter(0), of: versions.runs.length, note: run?.note ?? "", like });
    return { attachments: [...attachments, { kind: "version", text }] };
  }

  // A version's reply ended. The card has changed once none of its versions goes or waits, unless the user stopped it,
  // and the pick's answer names the card. A card of a run plan that reads from it may start.
  private versionEnded(cardId: string, runId: string, end: EndedReply): void {
    this.pump();
    const card = this.store.card(cardId);
    if (!card?.versions) return;
    const going = card.versions.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
    if (!going && end.outcome !== "stopped") this.cardChanged(cardId, card.nestId);
    const picked = card.versions.pick === runId ? card.versions.runs.find((run) => run.id === runId)?.chatId : null;
    if (picked && end.outcome === "done" && end.reply.trim()) this.nameCard(cardId, picked, end.reply);
    this.advance(card.nestId);
  }

  // ★ Use this: the version whose thread crosses the card's lines from now on, or none, when every version does. Only a
  // version with an answer. The card's title follows it, and the cards that read this one see an earlier card changed.
  pickVersion(cardId: unknown, runId: unknown): boolean {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card?.versions || (runId !== null && typeof runId !== "string")) return false;
    const run = runId === null ? null : card.versions.runs.find((each) => each.id === runId);
    const answer = run?.chatId ? this.answerOf(run.chatId) : null;
    if (runId !== null && !answer) return false;
    if (!this.store.pickVersion(card.id, run?.id ?? null)) return false;
    this.titling.delete(card.id);
    if (run?.chatId && answer) this.nameCard(card.id, run.chatId, answer);
    this.changed(card.nestId);
    return true;
  }

  // More like this: one more version, like the one shown, with the note "More like version B" and that version's thread
  // as data. It waits its turn as any version does, up to the most a card can have.
  moreLikeThis(cardId: unknown, runId: unknown): NestSendEachResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    const run = card?.versions?.runs.find((each) => each.id === runId);
    if (!card?.versions || !run) return { ok: false, error: "That version isn’t there any more." };
    if (this.closed) return { ok: false, error: "Blueberry is closing." };
    if (!run.chatId || !this.answerOf(run.chatId)) return { ok: false, error: `Version ${run.letter} has no answer yet.` };
    if (card.versions.runs.length >= MAX_VERSIONS) return { ok: false, error: `A card can have ${MAX_VERSIONS} versions at most.` };
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const input = this.inputFor(card.id);
    if ("problem" in input) return { ok: false, error: input.problem };
    if (!this.store.addVersion(card.id, moreLike(run.letter), run.id)) return { ok: false, error: `A card can have ${MAX_VERSIONS} versions at most.` };
    this.changed(card.nestId);
    this.pump();
    return { ok: true };
  }

  // What a card of versions gives across its lines: the pick's thread, or while none is picked, every version that has
  // answered, each with its letter and note. Nothing before any has.
  private versionsPart(versions: NonNullable<NestCard["versions"]>, name: string): RawInput | null {
    const threads = versions.runs.map((run) => ({ run, exchanges: run.chatId ? threadOf(this.chats.thread(run.chatId)?.messages ?? []) : [] }));
    if (versions.pick) {
      const picked = threads.find(({ run }) => run.id === versions.pick);
      return picked && picked.exchanges.length > 0 ? { name, part: "thread", exchanges: picked.exchanges, pick: picked.run.id } : null;
    }
    const answered = threads.filter(({ exchanges }) => exchanges.length > 0);
    return answered.length > 0 ? { name, part: "versions", versions: answered.map(({ run, exchanges }) => ({ letter: run.letter, note: run.note, exchanges })) } : null;
  }

  // A card of versions' answer as one text: the pick's, or every answered version's, each under its letter and note.
  private versionsAnswer(versions: NonNullable<NestCard["versions"]>): string | null {
    const part = this.versionsPart(versions, "");
    if (part?.part === "thread") return part.exchanges.at(-1)?.answer ?? null;
    if (part?.part !== "versions") return null;
    return part.versions.map(({ letter, note, exchanges }) => `Version ${letter}${note ? ` (${note})` : ""}:\n${exchanges.at(-1)?.answer ?? ""}`).join("\n\n");
  }

  // Suggest angles: fills a draft's empty notes, in order, with what the cheap model suggests from only the card's prompt
  // and the names of the cards it reads from, never what any of them says. Its words are checked and only fill the notes,
  // which the user sees before anything is sent.
  async suggestAngles(cardId: unknown, text: unknown, notes: unknown): Promise<NestAnglesResult> {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!card || card.chatId || card.each || card.versions || card.table || card.file || card.page || card.note) return { ok: false, error: "This card has been sent already." };
    if (!Array.isArray(notes) || notes.length < 2 || notes.length > MAX_VERSIONS || !notes.every((note) => typeof note === "string")) {
      return { ok: false, error: `A card can be sent as 2 to ${MAX_VERSIONS} versions.` };
    }
    if (!prompt) return { ok: false, error: "Write what to do first, then angles can be suggested for it." };
    const given = (notes as string[]).map((note) => note.slice(0, MAX_ANGLE_LENGTH));
    const empty = given.flatMap((note, index) => (note.trim() ? [] : [index]));
    if (empty.length === 0) return { ok: true, notes: given };
    if (!this.recap.angles) return { ok: false, error: "Suggesting angles needs a model in .env." };
    const names = this.store.linesTo(card.id).map((line) => this.labelOf(line.source));
    const angles = await this.recap.angles(prompt, names, given.filter((note) => note.trim()), empty.length).catch((error: unknown) => {
      console.error("Couldn't suggest angles:", error instanceof Error ? error.message : "unknown error");
      return [] as string[];
    });
    if (angles.length === 0) return { ok: false, error: "No angles came back. Try again, or write your own." };
    const filled = [...given];
    empty.forEach((index, at) => {
      if (angles[at]) filled[index] = angles[at];
    });
    return { ok: true, notes: filled };
  }

  // A reply in one run's thread, which gets its row again, and only its row.
  sendRun(runId: string, text: string): ChatThread | null {
    const run = this.store.run(runId);
    const card = run && this.store.card(run.cardId);
    if (run?.chatId && card?.versions && typeof text === "string") return this.sendVersion(card, run.id, run.chatId, text);
    if (!run?.chatId || !card?.each || typeof text !== "string") return null;
    const cardAnswers = this.runInputs(card.id, card.each.header, run.row);
    if (!cardAnswers) return null;
    // It's the user's own press on one thread, so it doesn't wait for a place, but it holds one, and gives it back.
    const sent = this.chats.send(run.chatId, text, {
      seePage: false,
      userPresent: true,
      cardAnswers,
      onEnd: (end) => {
        this.pump();
        this.endGrantIfDone(card.id);
        this.fillCell(runId);
        this.runEnded(card.id, card.nestId, end);
        this.advance(card.nestId);
      },
      cardGrant: this.grantFor(card.id),
      ...this.userSaid(card.id, run.chatId, text),
      ...this.givenAddresses(card.id),
      ...this.attachmentsFor(card.id),
      ...this.heard(card.id, card.nestId, runId),
    });
    if (!sent) return null;
    this.remember(card.id, runId);
    // Its value was the old answer's: it goes, and one being written for that answer never lands, so a restart before
    // this reply's value is in still makes it. The board hears at once, since rows picked from it aren't there now.
    this.fills.delete(runId);
    this.store.setRunCell(runId, null);
    this.store.touch(card.nestId);
    this.changed(card.nestId);
    return sent;
  }

  // Send from a card's own composer or reply field, saying why when it can't, so a press never does nothing.
  sendCard(cardId: unknown, text: unknown): NestSendEachResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card) return { ok: false, error: "This card isn’t there any more." };
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Write what to do first." };
    if (card.each) return { ok: false, error: "Reply in one row’s run instead." };
    if (card.versions) return { ok: false, error: "Reply in one version instead." };
    if (card.table) return { ok: false, error: "A table from a file has nothing to send." };
    if (card.file) return { ok: false, error: "A file’s card has nothing to send." };
    if (card.page) return { ok: false, error: "A page’s card has nothing to send." };
    if (card.note) return { ok: false, error: "A note has nothing to send." };
    if (card.plan && card.plan.state !== "held") return { ok: false, error: "This card goes when you run the plan." };
    const input = this.inputFor(card.id);
    if ("problem" in input) return { ok: false, error: input.problem };
    if (card.chatId && this.chats.isRunning(card.chatId)) return { ok: false, error: "Wait until it’s finished, or stop it first." };
    if (!card.chatId && this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    return this.send(card.id, text) ? { ok: true } : { ok: false, error: "That couldn’t be sent. Try again." };
  }

  // The same for a reply in one run's thread.
  sendRunReply(runId: unknown, text: unknown): NestSendEachResult {
    const run = typeof runId === "string" ? this.store.run(runId) : null;
    if (!run?.chatId) return { ok: false, error: "That run isn’t there any more." };
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Write your reply first." };
    if (this.chats.isRunning(run.chatId)) return { ok: false, error: "Wait until it’s finished, or stop it first." };
    return this.sendRun(run.id, text) ? { ok: true } : { ok: false, error: "That couldn’t be sent. Try again." };
  }

  // Stop on a card: nothing still waiting starts, every run going stops, and no card of a run plan after it starts, even
  // when its runs had ended and only their values were still being written.
  stopCard(cardId: string): boolean {
    const card = this.store.card(cardId);
    if (!card) return false;
    this.store.stopWaiting(cardId);
    this.grants.end(cardId);
    this.store.holdAfter(cardId, `Didn’t start, because ${this.labelOf(card)} was stopped`);
    this.chatsOf(card).forEach((chatId) => this.chats.stop(chatId));
    this.changed(card.nestId);
    return true;
  }

  // Retry the runs of a For-each card that didn't finish, or Start the ones that didn't start, after a stop or a restart:
  // only those rows, with the same prompt, rows and inputs, under the same cap and queue. Each gets a new chat, which
  // replaces its row's cell once it ends. Only once nothing on the card waits or goes. If any of them did something the
  // user allowed, it asks first, since going again may do it again.
  retryRuns(cardId: unknown, which: unknown, confirmed: unknown): NestRetryResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if ((!card?.each && !card?.versions) || (which !== "unfinished" && which !== "unstarted")) return { ok: false, error: "That card isn’t there any more." };
    return this.runAgain(card, which, confirmed === true);
  }

  // Update, on a card one of whose earlier cards changed since it sent: the user's press. A card's own chat gets one
  // message in its own thread, always the same words, through the same path as any message sent on it, so it reads what
  // its lines give now as its own bird, with its limits, Ask before acting and approvals. A For-each card runs every row
  // again, as Retry does, once the user has seen that what they did may happen again. It never starts anything else:
  // the cards that read this one say their earlier card changed in turn once it answers.
  updateCard(cardId: unknown, confirmed: unknown): NestRetryResult {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    const board = card && this.store.board(card.nestId);
    if (!card || !board || (!card.chatId && !card.each && !card.versions)) return { ok: false, error: "That card isn’t there any more." };
    if (this.changedLinesInto(card.nestId, card, board.cards, board.lines).length === 0) return { ok: false, error: "Nothing this card reads from has changed." };
    if (card.each || card.versions) return this.runAgain(card, "all", confirmed === true);
    return this.sendCard(card.id, UPDATE_MESSAGE);
  }

  private runAgain(card: NestCard & { nestId: string }, which: "unfinished" | "unstarted" | "all", confirmed: boolean): NestRetryResult {
    const each = card.each ?? card.versions;
    if (!each) return { ok: false, error: "That card isn’t there any more." };
    if (this.closed) return { ok: false, error: "Blueberry is closing." };
    const runs = each.runs.map((run) => ({
      ...run,
      running: (!!run.chatId && this.chats.isRunning(run.chatId)) || this.fills.has(run.id),
      thread: run.chatId ? this.chats.thread(run.chatId) : null,
    }));
    if (runs.some((run) => run.state === "waiting" || run.running)) return { ok: false, error: "Wait until every run has ended, or stop them first." };
    if (this.flockId(card.mascotId) === undefined) return { ok: false, error: "That bird isn’t in your flock any more." };
    const ids = which === "all" ? runs.map((run) => run.id) : retryable(runs)[which];
    if (ids.length === 0) return { ok: false, error: which === "unfinished" ? `Every ${card.versions ? "version" : "run"} finished.` : `Every ${card.versions ? "version" : "run"} started.` };
    const done = allowedBefore(runs.filter((run) => ids.includes(run.id)).map((run) => run.thread));
    // Every row going again always asks first, since each may do again what it did.
    if (which === "all" && !confirmed) {
      const kind = card.versions ? "version" : "row";
      const what = ids.length === 1 ? `its ${kind}` : `all ${ids.length.toLocaleString("en-US")} ${kind}s`;
      return { ok: false, warn: `Run ${what} again with what’s new? Anything already done may happen again${done ? `, such as “${done}”` : ""}.` };
    }
    if (done && !confirmed) return { ok: false, warn: `Some of these already did something you allowed, such as “${done}”, and may do it again.` };
    const chats = this.store.restartRuns(card.id, ids, (chatId) => this.chats.costOf([chatId]) ?? 0);
    // What those runs sent with went with them.
    this.sentChanged(card.id);
    chats.forEach((chatId) => this.deleteChat(chatId));
    this.changed(card.nestId);
    this.pump();
    return { ok: true };
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
    // The cards the user selected, which Berry then reads alone, checked against this Nest: never another's, and never
    // what a renderer says is in them.
    const about = this.aboutOf(nestId, options?.about);
    if (about === undefined) return { ok: false, error: "Some of those cards aren’t on this board any more. Select them again." };
    const place = this.placing(options);
    this.nameFrom(nestId, words);
    let open = this.store.openRequest(nestId);
    const pending = board.cards.filter((card) => card.plan?.state === "planned");
    // Without a model to plan with, it's one card, as before. Not while a plan waits, whose cards point at the composer's
    // files, which that card would take.
    if (!this.planner.available()) {
      if (pending.length > 0) return { ok: false, error: "Run or discard the plan first, since Berry needs a model to change it." };
      return this.oneCard(nestId, words, chosen, place) ? { ok: true } : { ok: false, error: "That couldn’t start." };
    }
    if (about) {
      // A plan waiting was made from what Berry read then, which goes with every message that changes it.
      if (pending.length > 0) return { ok: false, error: "Run or discard the plan first, or let the selected cards go to change it." };
      // The conversation so far goes with each message, so a question about only these cards starts afresh unless
      // everything said in it so far was about exactly them too.
      if (open && !this.store.openScopes(nestId).every((scope) => scope !== null && scope.length === about.size && scope.every((id) => about.has(id)))) {
        this.store.closeRequest(nestId);
        open = null;
      }
    }

    // Only the composer's files and notes are the planner's to point cards at, as short keys. What the user added on a
    // planned card stays that card's: it goes with the card if the new plan keeps its key, and back to the composer if not.
    const attachable = this.store.attachmentRows({ nestId }).map((row, index) => ({ ...row, key: `a${index + 1}` }));
    const attachedKeys = new Map(attachable.map((row) => [row.key, row.id]));
    const planKeys = new Map(pending.map((card, index) => [`p${index + 1}`, card.id]));
    const { digest, sources } = this.digestOf(board, chosen, pending, attachable, planKeys, about);
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
    if (one && !open && pending.length === 0 && one.from.length === 0 && !one.each && one.mascotId === chosen) {
      this.oneCard(nestId, words, chosen, place);
      return { ok: true };
    }

    this.store.say(nestId, "user", words, about ? { about: [...about] } : {});
    if (!checked) this.store.say(nestId, "berry", PLAN_FAILED);
    else if (!checked.ok) this.store.say(nestId, "berry", checked.problem === NO_CARDS || checked.problem === PROMISED ? NO_CARDS_MADE : planRefused(checked.problem));
    else if (
      checked.cards.some((card) => {
        const kept = planKeys.get(card.key);
        return this.overfull([...(kept ? this.store.attachmentRows({ cardId: kept }) : []), ...card.attached.map((key) => attachable.find((row) => row.key === key)!)]);
      })
    )
      this.store.say(nestId, "berry", planRefused("a card would get more files than one card can take"));
    else if (checked.answer) {
      this.store.say(nestId, "berry", checked.reply, { kind: "answer" });
      // An answer is the end of that request, so the next message starts afresh, as one card when it's one job. Not while
      // a plan waits, which the next message still changes.
      if (pending.length === 0) this.store.closeRequest(nestId);
    } else if (checked.ask || checked.cards.length === 0) this.store.say(nestId, "berry", checked.reply || PLAN_FAILED, checked.reply ? { kind: "ask" } : {});
    else if (!this.setPlan(nestId, this.placePlan(checked.cards, board, pending, place, attachedKeys, planKeys), checked.section ?? words))
      this.store.say(nestId, "berry", planRefused("a line went to a card that isn’t there"));
    else this.store.say(nestId, "berry", checked.reply || "I’ve laid it out above. Press Run when it looks right.", { kind: "plan", planned: checked.cards.length });
    this.changed(nestId);
    return { ok: true };
  }

  // A plan on the board, in a section of its own named by the plan when it's several cards. The section's colour is picked
  // here, never by the model.
  private setPlan(nestId: string, cards: NewPlannedCard[], name: string): boolean {
    const said = this.store.openRequest(nestId)!.messages.filter((message) => message.role === "user").map((message) => message.text).join("\n");
    const section = planSection(
      cards.map((card) => ({ x: card.x, y: card.y, width: CARD_WIDTH, height: PLAN_SECTION_HEIGHT })),
      name,
      this.store.sectionColors(nestId, true)
    );
    return this.store.setPlan(nestId, cards, said, section) !== null;
  }

  // The cards a request asks about: null for the whole board, with none selected, or undefined when any isn't a card on
  // this Nest's board, so a request never reads a card of another Nest's.
  private aboutOf(nestId: string, about: unknown): Set<string> | null | undefined {
    if (about === undefined || about === null) return null;
    if (!Array.isArray(about) || about.length > MAX_TAKEN) return undefined;
    if (about.length === 0) return null;
    if (!about.every((id) => typeof id === "string" && this.store.card(id)?.nestId === nestId)) return undefined;
    return new Set(about as string[]);
  }

  // Tucks the Nest's composer down to a tab at the board's bottom edge, or brings it back.
  setTucked(nestId: unknown, tucked: unknown): boolean {
    if (typeof nestId !== "string" || typeof tucked !== "boolean" || !this.store.setTucked(nestId, tucked)) return false;
    this.events.onBoard(this.board(nestId)!);
    return true;
  }

  // One of Berry's answers about the board, as a note's card in the first free place near where the user is looking. Main
  // reads the answer from the Nest's own conversation by its message's id, so a renderer can't put words of its own there.
  putOnBoard(nestId: string, messageId: unknown, options: Pick<NestAskOptions, "at" | "taken">): NestTableResult {
    if (typeof nestId !== "string" || !this.store.board(nestId)) return { ok: false, error: "That Nest isn’t there any more." };
    const text = typeof messageId === "number" && Number.isSafeInteger(messageId) ? this.store.answer(nestId, messageId) : null;
    if (text === null) return { ok: false, error: "Only one of Berry’s answers can go on the board." };
    const place = this.placing(options);
    const known = this.store.board(nestId)?.cards ?? [];
    const taken = [...place.taken, ...known.filter((card) => !place.taken.some((rect) => rect.x === card.x && rect.y === card.y)).map(rectOfCard)];
    const card = this.store.addNoteCard(nestId, { ...freeSpot(taken, place.at), text });
    if (!card) return { ok: false, error: "That Nest isn’t there any more." };
    this.changed(nestId);
    return { ok: true, cardId: card.id };
  }

  // A planned card's prompt or For each row, before the plan runs. For each row only where the card gets a table.
  editPlanned(cardId: string, change: { prompt?: unknown; each?: unknown }): boolean {
    const card = this.store.card(cardId);
    if (card?.plan?.state !== "planned" || this.replanned(card) || typeof change !== "object" || change === null) return false;
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
  // card waits while Berry changes the plan.
  changeable(target: unknown): AttachTo | null {
    if (typeof target !== "object" || target === null) return null;
    const { cardId, nestId } = target as { cardId?: unknown; nestId?: unknown };
    if (typeof cardId === "string") {
      const card = this.store.card(cardId);
      if (!card || card.chatId || card.each || card.versions || card.table || card.file || card.note || card.plan?.state === "armed") return null;
      return this.replanned(card) ? null : { cardId };
    }
    if (typeof nestId === "string") return this.store.board(nestId) && !this.planning.has(nestId) ? { nestId } : null;
    return null;
  }

  // A planned card while Berry changes its plan, which will replace it from what it was when Berry started reading. Its
  // prompt, bird, For each row, files and notes wait until then, so nothing the user changes meanwhile is lost.
  private replanned(card: Pick<NestCard, "plan"> & { nestId: string }): boolean {
    return card.plan?.state === "planned" && this.planning.has(card.nestId);
  }

  // Whether Berry is changing the plan the target is part of, or reading the composer it is.
  private replanning(target: unknown): boolean {
    const { cardId, nestId } = (typeof target === "object" && target !== null ? target : {}) as { cardId?: unknown; nestId?: unknown };
    const nest = typeof cardId === "string" ? this.store.card(cardId)?.nestId : nestId;
    return typeof nest === "string" && this.planning.has(nest);
  }

  // A card's files and notes, which go with every message it sends, and with every run of For each row, with the files
  // its lines brought it, and the names of any it had no room for.
  private attachmentsFor(cardId: string, missing: readonly string[] = this.missingFiles.get(cardId) ?? []): { attachments?: SentAttachment[] } {
    const attachments: SentAttachment[] = [...this.store.sentAttachments(cardId), ...(missing.length > 0 ? [{ kind: "missing" as const, names: [...missing] }] : [])];
    return attachments.length > 0 ? { attachments } : {};
  }

  // The file's cards a card reads, through its own lines and further up the chain, nearest first, each once, with the line
  // into this card each came through. A file goes as far as words do: through a card that gives something, and only so
  // many cards up.
  private chainFiles(cardId: string): { lineId: string; card: NestCard }[] {
    const found: { lineId: string; card: NestCard }[] = [];
    const seen = new Set([cardId]);
    let level = this.store.linesTo(cardId).map((line) => ({ lineId: line.lineId, card: line.source }));
    for (let depth = 0; level.length > 0 && depth <= MAX_EARLIER_CARDS; depth++) {
      const next: typeof level = [];
      for (const { lineId, card } of level) {
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        if (card.file) {
          found.push({ lineId, card });
          continue;
        }
        // A page card reads from nothing: a line into it only joins it to the card whose job it showed.
        if (card.page) continue;
        if (!card.each && this.ownPart(card) === null) continue;
        // A card further up gives only what it has sent with, never a line its next message is the first to get.
        for (const line of this.store.linesTo(card.id)) if (!line.fresh) next.push({ lineId, card: line.source });
      }
      level = next;
    }
    return found;
  }

  // What a card's lines bring in files: each goes while the card has room for it with its own, the nearest first, under the
  // same limits as files attached to it. One it has its own copy of already goes as that copy.
  private filesFor(cardId: string): { sends: { lineId: string; card: NestCard }[]; leftOut: { lineId: string; card: NestCard }[] } {
    const copied = this.store.copiedFrom(cardId);
    const room: { kind: "file" | "note"; size: number; pages: number | null }[] = this.roomOf({ cardId });
    const sends: { lineId: string; card: NestCard }[] = [];
    const leftOut: { lineId: string; card: NestCard }[] = [];
    for (const each of this.chainFiles(cardId)) {
      if (copied.has(each.card.id)) {
        sends.push(each);
        continue;
      }
      const { name, size, pages } = each.card.file!;
      if (roomProblem(room, { kind: "file", name, size, pages })) leftOut.push(each);
      else {
        sends.push(each);
        room.push({ kind: "file", size, pages });
      }
    }
    return { sends, leftOut };
  }

  // As a card sends, it takes its own copy of each file its lines bring, so the message it sent keeps it whatever happens
  // to the file's card later. The names of any it had no room for, which the model is told.
  private takeFiles(cardId: string): string[] {
    const { sends, leftOut } = this.filesFor(cardId);
    for (const { card } of sends) this.store.copyFile(cardId, card.id);
    return leftOut.map(({ card }) => card.file!.name);
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
    const waiting = this.store.armedCards(card.nestId).filter((armed) => armed.plan!.waits && this.store.linesTo(armed.id).some((line) => line.source.id === cardId));
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

  // Where the cards a planned card reads from stand, together: it starts once every one has answered.
  private sourceState(cardId: string): SourceState {
    return sourcesState(this.store.linesTo(cardId).map((line) => this.stateOf(line.source)));
  }

  private stateOf(source: NestCard): SourceState {
    const name = this.labelOf(source);
    // A file's rows, or a file, are there from the start.
    if (source.table || source.file || source.page || source.note) return { kind: "answered", name };
    if (source.plan?.state === "held") return { kind: "held", name };
    if (source.plan) return { kind: "planned", name };
    if (source.versions) {
      return runsState(
        name,
        source.versions.runs.map((run) => ({ state: run.state, running: !!run.chatId && this.chats.isRunning(run.chatId), thread: run.chatId ? this.chats.thread(run.chatId) : null }))
      );
    }
    if (source.each) {
      // A run whose value is still being written isn't done, so what the next card gets has every value in it.
      return runsState(
        name,
        source.each.runs.map((run) => ({
          state: run.state,
          running: (!!run.chatId && this.chats.isRunning(run.chatId)) || this.fills.has(run.id),
          thread: run.chatId ? this.chats.thread(run.chatId) : null,
        }))
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
      const source = this.drivingLine(card.id)?.source ?? this.store.linesTo(card.id)[0]?.source;
      const name = source ? cardName(source.title, this.labelOf(source)) : "another card";
      if ("problem" in rows) return this.store.hold(card.id, `Didn’t start, because ${whose(name, "answer")} has no table`);
      if (runCountProblem(rows.rows.length)) {
        return this.store.hold(card.id, `Didn’t start, because ${whose(name, "table")} has ${rows.rows.length} rows, and For each row runs at most ${MAX_RUNS} times`);
      }
      if ("problem" in this.inputFor(card.id)) return this.store.hold(card.id, "Didn’t start, because what it reads from has changed");
      if (!this.store.startForEach(card.id, plan.prompt, rows.header, rows.rows, DEFAULT_COLUMN, rows.lineId)) return false;
      this.missingFiles.set(card.id, this.takeFiles(card.id));
      this.nameColumn(card.id, plan.prompt);
      this.handedOff(card.id);
      this.pump();
      return true;
    }
    const input = this.inputFor(card.id);
    if ("problem" in input) return this.store.hold(card.id, "Didn’t start, because what it reads from has changed");
    const missing = this.takeFiles(card.id);
    const sent = this.chats.send(null, plan.prompt, {
      seePage: false,
      mascotId: card.mascotId,
      ...(input.answers.length > 0 ? { cardAnswers: input.answers } : {}),
      started: (chatId) => this.store.setChat(card.id, chatId),
      onEnd: (end) => this.ended(card.id, nestId, end),
      ...this.userSaid(card.id, null, null),
      ...this.givenAddresses(card.id),
      ...this.attachmentsFor(card.id, missing),
      ...this.heard(card.id, nestId),
      saveFile: this.fileSink(card.id),
    });
    if (!sent) return this.store.hold(card.id, "Didn’t start");
    this.remember(card.id, null);
    this.handedOff(card.id);
    return true;
  }

  // A card's own reply ended: its job's tabs settle on the board, and a card of a run plan that reads from it may start.
  // It changed, unless the user stopped it, and a finished answer names it.
  private ended(cardId: string, nestId: string, end: EndedReply): void {
    const chatId = this.store.card(cardId)?.chatId;
    const pages = (chatId ? this.chats.thread(chatId)?.messages.at(-1)?.pages : undefined) ?? [];
    this.finishJobTabs(cardId, pages);
    if (end.outcome !== "stopped") this.cardChanged(cardId, nestId);
    if (end.outcome === "done" && chatId && end.reply.trim()) this.nameCard(cardId, chatId, end.reply);
    this.advance(nestId);
  }

  // A For-each card has changed once none of its runs goes or waits any more, unless the user stopped it.
  private runEnded(cardId: string, nestId: string, end: EndedReply): void {
    const card = this.store.card(cardId);
    const going = card?.each?.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
    if (card && !going && end.outcome !== "stopped") this.cardChanged(cardId, nestId);
  }

  // A card finished, failed or started waiting for the user. Nobody looking at it, it gets a dot until it's opened. With
  // its Nest open, the user was here for it, so it isn't news when they come back.
  private cardChanged(cardId: string, nestId: string): void {
    const at = Date.now();
    this.store.cardChanged(cardId, at, missed(this.front, this.inSight.get(nestId), nestId, cardId));
    if (this.here === nestId) this.store.seeNest(nestId, at);
    this.changed(nestId);
  }

  // The cheap model names a card for what its answer found. A title the user typed is never replaced, and one written
  // for an older answer never lands.
  private nameCard(cardId: string, chatId: string, answer: string): void {
    const card = this.store.card(cardId);
    const prompt = this.chats.thread(chatId)?.messages.findLast((message) => message.role === "user")?.content ?? "";
    if (!card || card.titleSettled) return;
    const turn = ++this.titleTurn;
    this.titling.set(cardId, turn);
    void this.recap
      .title(prompt, answer)
      .catch((error: unknown) => {
        console.error("Failed to name a card:", error);
        return null;
      })
      .then((title) => {
        if (this.titling.get(cardId) !== turn) return;
        this.titling.delete(cardId);
        const nestId = this.store.card(cardId)?.nestId;
        if (title && nestId && this.store.titleCard(cardId, title, false)) this.changed(nestId);
      });
  }

  // The user's own name for a card, or none, and then the next answer names it again.
  renameCard(cardId: unknown, title: unknown): boolean {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card || typeof title !== "string" || (!card.chatId && !card.versions)) return false;
    const name = titleFrom(title);
    if (!this.store.titleCard(card.id, name, true)) return false;
    this.titling.delete(card.id);
    this.changed(card.nestId);
    return true;
  }

  // A card's chat changed. One that just started waiting for the user's OK, answer or hand-off has changed.
  threadChanged(thread: ChatThread): void {
    const approval = thread.approval?.id ?? null;
    if (approval === (this.asking.get(thread.id) ?? null)) return;
    if (!approval) return void this.asking.delete(thread.id);
    this.asking.set(thread.id, approval);
    const where = this.chatInNest(thread.id);
    if (where) this.cardChanged(where.cardId, where.nestId);
    else this.asking.delete(thread.id);
  }

  // Which Nest is in the window's front tab, if any, and whether the window is showing. A Nest is open while it's both, so
  // leaving it, or hiding or minimizing the window, is when it was last open. Coming back to one where cards changed
  // since, Berry says what changed.
  screen(nestId: string | null, showing: boolean): void {
    const before = this.here;
    this.front = nestId ? { nestId, showing } : null;
    this.here = showing ? nestId : null;
    if (before === this.here) return;
    const now = Date.now();
    if (before) {
      this.store.seeNest(before, now);
      // A summary still being written is for a visit that's over, and the next one writes it again.
      this.visits.set(before, (this.visits.get(before) ?? 0) + 1);
    }
    if (this.here) this.cameBack(this.here, now);
  }

  // The cards a Nest's board has in sight now, and the open one.
  inView(nestId: unknown, cardIds: unknown): void {
    if (typeof nestId !== "string" || !Array.isArray(cardIds)) return;
    this.inSight.set(nestId, new Set(cardIds.filter((id): id is string => typeof id === "string").slice(0, MAX_TAKEN)));
  }

  // The user opened the card, so its dot goes. Only while they can see it: an open card stays open behind a hidden window.
  readCard(cardId: unknown): boolean {
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card || this.here !== card.nestId || !this.store.readCard(card.id)) return false;
    this.changed(card.nestId);
    return true;
  }

  private cameBack(nestId: string, now: number): void {
    const visit = (this.visits.get(nestId) ?? 0) + 1;
    this.visits.set(nestId, visit);
    // Left before the last summary landed, it's written again from when the Nest was open before that.
    const seenAt = this.summing.get(nestId)?.seenAt ?? this.store.seenAt(nestId);
    this.summing.delete(nestId);
    this.store.seeNest(nestId, now);
    // What changed before is old news now.
    this.since.delete(nestId);
    const changed = changedSince(this.store.changeTimes(nestId), seenAt);
    if (seenAt === null || changed.length === 0) {
      // The page hears it's seen again either way, so an open card's dot can go now.
      const board = this.board(nestId);
      if (board) this.events.onBoard(board);
      return;
    }
    const ids = changed.map((card) => card.id);
    this.summing.set(nestId, { visit, seenAt });
    const fallback = sinceFallback(ids.length, seenAt, now);
    const changes = ids.flatMap((id) => {
      const card = this.store.card(id);
      return card ? [this.changeOf(card)] : [];
    });
    void this.recap
      .since(changes)
      .catch((error: unknown) => {
        console.error("Failed to say what changed in a Nest:", error);
        return null;
      })
      .then((text) => {
        // Opened again meanwhile, so this is about an older visit, and the newer one has its own.
        if (this.visits.get(nestId) !== visit || !this.store.board(nestId)) return;
        this.summing.delete(nestId);
        this.since.set(nestId, { id: ++this.sinceTurn, text: text ?? fallback, cards: ids });
        this.changed(nestId);
      });
  }

  // A changed card as the summary reads it: its bird, title, how it stands, and its newest answer, only its own words.
  private changeOf(card: NestCard): CardChange {
    const bird = this.labelOf(card);
    const title = card.title ?? null;
    if (card.each) {
      const { runs } = card.each;
      const threads = runs.map((run) => (run.chatId ? this.chats.thread(run.chatId) : null));
      const asking = threads.some((thread) => !!thread?.approval);
      const going = runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
      const failed = runs.filter((run, index) => run.state === "failed" || !!threads[index]?.error).length;
      const status = asking ? "Waiting for you" : going ? "Still working" : failed > 0 ? `${failed} of ${runs.length} didn’t finish` : `Done, ${runs.length} ${runs.length === 1 ? "row" : "rows"}`;
      return { bird, title: title ?? card.each.column, status, answer: null };
    }
    // A card of versions says how its versions stand, and the pick's answer when there is one.
    const chatId = card.versions ? (card.versions.runs.find((run) => run.id === card.versions!.pick)?.chatId ?? null) : card.chatId;
    if (card.versions) {
      const threads = card.versions.runs.map((run) => (run.chatId ? this.chats.thread(run.chatId) : null));
      const going = card.versions.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
      const status = threads.some((thread) => !!thread?.approval) ? "Waiting for you" : going ? "Still working" : `${card.versions.runs.length} versions${card.versions.pick ? ", one picked" : ", none picked yet"}`;
      return { bird, title, status, answer: chatId ? this.answerOf(chatId) : null };
    }
    const thread = chatId ? this.chats.thread(chatId) : null;
    const status = thread?.approval ? "Waiting for you" : thread?.error ? "Didn’t finish" : "Done";
    return { bird, title, status, answer: chatId ? this.answerOf(chatId) : null };
  }

  // Says a card just started with work from the card its line comes from. A card that reads from nothing has nobody to
  // carry it.
  private handedOff(cardId: string): void {
    // A file's card has no bird to carry it. With several inputs, the first bird carries it.
    const line = this.store.linesTo(cardId).find((each) => !each.source.table && !each.source.file && !each.source.page && !each.source.note);
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

  // Whether For each row can run on what a planned card reads from: a planned card that will answer with a table, or
  // run for each row and so make one, or a card that has a table now.
  private getsTable(cardId: string): boolean {
    return this.store.linesTo(cardId).some(({ source }) => {
      if (source.plan) return source.plan.each || source.plan.table !== null;
      if (source.table) return source.table.count > 0;
      if (source.file || source.page || source.note) return false;
      return this.tableOf(source) !== null;
    });
  }

  // A card's table as it is now: a file's rows, a For-each card's rows with its column, or the table in a sent card's
  // latest answer, the one it shows. Null when it has none.
  private tableOf(card: NestCard): PickedRows | null {
    if (card.table) return { header: card.table.header, rows: this.store.tableRows(card.id) ?? [] };
    if (card.each) return combinedTable(card.each);
    const answer = card.chatId ? this.answerOf(card.chatId) : null;
    const table = answer ? findTable(answer) : null;
    return table && { header: table.header, rows: table.rows };
  }

  // What a card's table is called when it's copied or saved: a file's title, or its bird's name and the Nest's.
  exportOf(cardId: string): { title: string; table: PickedRows } | null {
    const card = this.store.card(cardId);
    const table = card && this.tableOf(card);
    if (!card || !table) return null;
    return { title: card.table ? card.table.name : `${this.title(card.nestId) ?? "Nest"} - ${this.labelOf(card)}`, table };
  }

  // Renames a For-each card's column. The user's name is final, and a generated one never replaces it.
  renameColumn(cardId: unknown, name: unknown): boolean {
    const words = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const card = typeof cardId === "string" ? this.store.card(cardId) : null;
    if (!card?.each || !words || !this.store.nameColumn(card.id, words, true)) return false;
    this.columnNaming.delete(card.id);
    this.changed(card.nestId);
    return true;
  }

  // A CSV or TSV file the user picked, already read in main, as a table card of its own, in the first free place in sight.
  addTableFile(nestId: string, name: string, bytes: Uint8Array, options: Pick<NestAskOptions, "at" | "taken">): NestTableResult {
    if (!this.store.board(nestId)) return { ok: false, error: "That Nest isn’t there any more." };
    const parsed = tableFromFile(name, bytes);
    if (!parsed.ok) return parsed;
    const place = this.placing(options);
    const card = this.store.addTableCard(nestId, { ...freeSpot(place.taken, place.at), table: parsed.table });
    if (!card) return { ok: false, error: "That Nest isn’t there any more." };
    this.changed(nestId);
    return { ok: true, cardId: card.id };
  }

  // A file the user dropped on the board, already read in main, as a card of its own where they let go, or a little below
  // if that's taken. A CSV or TSV file is a table card, as from Add a table from a file. Anything else is checked as a file
  // added with + is, by its name and its own bytes, what the model reads, and its size.
  dropFile(nestId: string, name: string, bytes: Uint8Array, inputs: ModelInputs, options: Pick<NestAskOptions, "at" | "taken">): NestTableResult {
    if (!this.store.board(nestId)) return { ok: false, error: "That Nest isn’t there any more." };
    if (/\.(csv|tsv)$/i.test(name)) return this.addTableFile(nestId, name, bytes, options);
    const checked = checkFile(name, bytes, inputs);
    if (!checked.ok) return checked;
    const place = this.placing(options);
    // Files dropped together land one under another, though the chrome measured the board before any of them.
    const known = this.store.board(nestId)?.cards ?? [];
    const taken = [...place.taken, ...known.filter((card) => !place.taken.some((rect) => rect.x === card.x && rect.y === card.y)).map((card) => ({ x: card.x, y: card.y, width: card.size?.width ?? CARD_WIDTH, height: card.size?.height ?? CARD_HEIGHT }))];
    const { type, size, pages } = checked.file;
    const card = this.store.addFileCard(nestId, { ...freeSpot(taken, place.at), file: { name, type, size, pages, data: bytes }, preview: filePreview(type, bytes) });
    if (!card) return { ok: false, error: "That Nest isn’t there any more." };
    this.changed(nestId);
    return { ok: true, cardId: card.id };
  }

  // Where save_file puts what a card's bird made: a file's card beside that card, joined to it by a line, placed clear of
  // every card as main knows them. Only for a card's own replies, never a run's. It writes nothing but the Nest's own
  // data. Says why when it can't.
  private fileSink(cardId: string): (file: MadeFile) => string | null {
    return (file) => {
      const card = this.store.card(cardId);
      const board = card && this.store.board(card.nestId);
      if (!card || !board) return "Nothing was saved: this card was deleted.";
      const rectOf = (each: NestCard): Rect => ({ x: each.x, y: each.y, width: each.size?.width ?? CARD_WIDTH, height: each.size?.height ?? CARD_HEIGHT });
      const from = rectOf(card);
      const spot = freeSpot(board.cards.map(rectOf), { x: from.x + from.width + CARD_GAP, y: from.y });
      const size = file.data.length;
      const made = this.store.addFileCard(card.nestId, { ...spot, file: { ...file, size, pages: null }, preview: filePreview(file.type, file.data), madeBy: card.id });
      if (!made) return "Nothing was saved: this card was deleted.";
      this.changed(card.nestId);
      return null;
    };
  }

  // What a file's card shows when it's opened, or as its picture: a text file's words, a CSV file's rows, an image. Read
  // here, and never handed to anything but the chrome, which draws it. A PDF has nothing to show but its card.
  fileContent(cardId: unknown): NestFileContent | null {
    const file = typeof cardId === "string" ? this.store.fileOf(cardId) : null;
    if (!file) return null;
    if (file.type.startsWith("image/")) return { image: `data:${file.type};base64,${Buffer.from(file.data).toString("base64")}` };
    if (file.type === "application/pdf") return {};
    if (file.type === "text/html") return { html: this.htmlPage(cardId as string, file.data) };
    const text = Buffer.from(file.data).toString("utf8").replace(/^\uFEFF/, "");
    if (file.type === "text/csv") {
      const parsed = tableFromFile(/\.csv$/i.test(file.name) ? file.name : `${file.name}.csv`, file.data);
      if (parsed.ok) return { table: { header: parsed.table.header, rows: parsed.table.rows } };
    }
    return { text };
  }

  // A file's card's file, for Download, which writes it only where the user chooses.
  // An HTML card's page goes as the bird wrote it, with its policy and its library in the same sandboxed frame, and with
  // `window.nest.data` empty: the board's data stays here, since a browser it's opened in later can still look up a host
  // name the page spells it out in (see `htmlCardDownload`). What the bird wrote into the page itself goes with it.
  fileDownload(cardId: unknown): { name: string; type: string; data: Uint8Array } | null {
    const file = typeof cardId === "string" ? this.store.fileOf(cardId) : null;
    if (file?.type === "text/html") {
      const page = htmlCardDownload(htmlSource(file.data), CHART_LIBRARY, sha256, file.name.replace(/\.html$/i, ""));
      return { name: file.name, type: file.type, data: new Uint8Array(Buffer.from(page, "utf8")) };
    }
    return file && { name: file.name, type: file.type, data: file.data };
  }

  // An HTML card's whole page: what the bird wrote, after the policy and the data it reads. Only ever drawn in the
  // chrome's sandboxed frame, or written where the user chooses.
  private htmlPage(cardId: string, data: Uint8Array): string {
    return htmlCardDocument(htmlSource(data), this.htmlData(cardId), CHART_LIBRARY, sha256);
  }

  // What an HTML card's page reads as `window.nest.data`: what the card that made it has now, its latest answer and the
  // table in it, each card it reads from with theirs, or the rows a line picked, and the pictures on it, as its bird saw
  // them. Codes the user typed are taken out, as from anything that leaves a card. Empty once that card is gone.
  private htmlData(cardId: string): HtmlCardData {
    const maker = this.store.linesTo(cardId).find((line) => !!line.source.chatId)?.source;
    if (!maker?.chatId) return EMPTY_HTML_DATA;
    const text = (value: string | null) => (value === null ? null : this.clean(value));
    const table = (rows: PickedRows | null): HtmlCardTable | null => rows && { header: rows.header.map(this.clean), rows: rows.rows.map((row) => row.map(this.clean)) };
    const own = (card: NestCard) => ({ answer: text(card.note ? card.note.text : card.chatId ? this.answerOf(card.chatId) : card.versions ? this.versionsAnswer(card.versions) : null), table: table(this.tableOf(card)) });
    // What the maker has sent with, not a line its next message is the first to get.
    const lines = this.store.linesTo(maker.id).filter((line) => !line.fresh);
    const images: HtmlCardData["images"] = [];
    let room = MAX_HTML_IMAGE_BYTES;
    const offer = (name: string, type: string, bytes: Uint8Array) => {
      if (!type.startsWith("image/") || bytes.length > room) return;
      room -= bytes.length;
      images.push({ name, src: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` });
    };
    for (const attachment of this.store.sentAttachments(maker.id)) if (attachment.kind === "file") offer(attachment.name, attachment.type, attachment.data);
    for (const { source } of lines) {
      const file = source.file && !this.store.copiedFrom(maker.id).has(source.id) ? this.store.fileOf(source.id) : null;
      if (file) offer(file.name, file.type, file.data);
    }
    return {
      card: { bird: this.labelOf(maker), ...own(maker) },
      // Picked rows only while they're all still in their card's table, as a send checks, so rows taken out never reach it.
      inputs: lines.map(({ source, picked }) => ({
        name: this.labelOf(source),
        ...(picked ? { answer: null, table: missingRows(picked, this.tableOf(source)).length > 0 ? null : table(picked) } : own(source)),
      })),
      images,
    };
  }

  // The cheap model names a For-each card's column from its job, in the background. Until then, and if it can't, the
  // column is "Result". A name the user gave meanwhile stays.
  private nameColumn(cardId: string, job: string): void {
    this.columnNaming.add(cardId);
    void this.writer
      .column(job)
      .catch((error) => {
        console.error("Couldn't name a column:", error instanceof Error ? error.message : "unknown error");
        return null;
      })
      .then((name) => {
        if (name && this.columnNaming.has(cardId)) this.store.nameColumn(cardId, name, false);
      })
      .finally(() => {
        this.columnNaming.delete(cardId);
        const nestId = this.store.card(cardId)?.nestId;
        if (nestId) this.changed(nestId);
      });
  }

  // A run's value in its card's column, from its latest answer, once its reply has ended: the whole answer when it's
  // short, or else what the cheap model makes of it, or else its first line. A run whose reply came back empty has none.
  // The answer is read now, and a value written for an older answer never lands.
  private fillCell(runId: string): void {
    const run = this.store.run(runId);
    const card = run && this.store.card(run.cardId);
    if (!run?.chatId || !card?.each || this.chats.isRunning(run.chatId)) return;
    const answer = this.answerOf(run.chatId);
    const ready = answer === null ? null : shortCell(answer);
    const turn = ++this.fillTurn;
    if (answer === null || ready !== null) {
      const was = this.fills.delete(runId);
      if (!was && ready === run.cell) return;
      this.store.setRunCell(runId, ready);
      this.changed(card.nestId);
      return;
    }
    this.fills.set(runId, turn);
    this.changed(card.nestId);
    const { prompt, column, header } = card.each;
    void this.writer
      .cell({ job: prompt, column, header, row: run.row, answer })
      .catch((error) => {
        console.error("Couldn't write a cell:", error instanceof Error ? error.message : "unknown error");
        return null;
      })
      .then((cell) => {
        if (this.fills.get(runId) !== turn) return;
        this.fills.delete(runId);
        // Whoever wrote it, it links only where the answer does.
        this.store.setRunCell(runId, linkChecked(cell ?? fallbackCell(answer), answer));
        const nestId = this.store.card(card.id)?.nestId;
        if (!nestId) return;
        this.changed(nestId);
        // The cards of a run plan after it start once every value is in.
        this.advance(nestId);
      });
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
      const first = card.from[0];
      const from = first && ("plan" in first ? placed.get(first.plan) : board.cards.find((each) => each.id === first.card && !replaced.has(each.id)));
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
    planKeys: ReadonlyMap<string, string>,
    // The cards the user selected, the only ones Berry then reads and a plan may read from. Null for the whole board.
    about: ReadonlySet<string> | null = null
  ): { digest: string; sources: PlanSource[] } {
    const sent = board.cards.filter((card) => (card.chatId || card.each || card.versions || card.table || card.file || card.note) && (!about || about.has(card.id)));
    // Cleaned before the planner's room is measured, for the same reason as a card's inputs.
    const cleanTable = ({ header, rows }: PickedRows): PickedRows => ({ header: header.map(this.clean), rows: rows.map((row) => row.map(this.clean)) });
    const keyOf = new Map(sent.map((card, index) => [card.id, `e${index + 1}`]));
    const sources: PlanSource[] = [];
    const cards: BoardCardDigest[] = sent.map((card) => {
      const key = keyOf.get(card.id)!;
      const bird = this.mascots.resolve(card.mascotId).name;
      // A file on its own card, by its name, type and size only, never what's in it, as the composer's files are.
      if (card.file) {
        sources.push({ key, cardId: card.id, table: false });
        const by = card.file.made ? "a file a bird made" : "a file the user added";
        return { key, bird: `none, ${by}`, status: `The ${typeInWords(card.file.type)} ${card.file.name}, ${sizeInWords(card.file.size)}`, asked: null };
      }
      // One of Berry's own answers the user put on the board, written from cards that came from web pages.
      if (card.note) {
        sources.push({ key, cardId: card.id, table: false });
        return { key, bird: "none, an answer of yours the user put on the board", status: "A note", asked: null, note: this.clean(card.note.text) };
      }
      // A file the user added, by its title and its first rows, untrusted like any file.
      if (card.table) {
        sources.push({ key, cardId: card.id, table: true });
        return { key, bird: "none, a file the user added", status: `A table from ${card.table.name}`, asked: null, table: cleanTable(this.tableOf(card)!) };
      }
      if (card.each) {
        const answered = card.each.runs.filter((run) => run.cell !== null).length;
        sources.push({ key, cardId: card.id, table: true });
        return { key, bird, status: `${answered} of ${card.each.runs.length} answered`, asked: card.each.prompt, table: cleanTable(combinedTable(card.each)), runs: card.each.runs.length };
      }
      // A card of versions, as what crosses its lines: the pick's thread, or each answered version's, under its letter and note.
      if (card.versions) {
        const part = this.versionsPart(card.versions, bird);
        const label = (letter: string, note: string, asked: string) => `[Version ${letter}${note ? `, ${note}` : ""}] ${asked}`;
        const exchanges =
          part?.part === "thread" ? part.exchanges : part?.part === "versions" ? part.versions.flatMap(({ letter, note, exchanges: each }) => each.map((exchange) => ({ ...exchange, asked: label(letter, note, exchange.asked) }))) : [];
        sources.push({ key, cardId: card.id, table: false });
        const going = card.versions.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)));
        const status = `${card.versions.runs.length} versions, ${card.versions.pick ? "one picked" : "none picked"}${going ? ", still working" : ""}`;
        return {
          key,
          bird,
          status,
          asked: exchanges.length > 0 ? null : card.versions.prompt,
          ...(exchanges.length > 0 ? { thread: exchanges.map(({ asked, answer: said }) => ({ asked: this.clean(asked), answer: this.clean(said) })) } : {}),
        };
      }
      const thread = card.chatId ? this.chats.thread(card.chatId) : null;
      const answer = thread ? latestAnswer(thread.messages) : null;
      const running = !!card.chatId && this.chats.isRunning(card.chatId);
      sources.push({ key, cardId: card.id, table: !!answer && findTable(answer) !== null });
      // Its whole thread once it has an answer, and what was asked last while it has none.
      const exchanges = (thread ? threadOf(thread.messages) : []).map(({ asked, answer: said }) => ({ asked: this.clean(asked), answer: this.clean(said) }));
      return {
        key,
        bird,
        status: running ? "Working" : answer ? "Done" : "No answer",
        asked: exchanges.length > 0 ? null : (thread?.messages.findLast((message) => message.role === "user")?.content ?? null),
        ...(exchanges.length > 0 ? { thread: exchanges } : {}),
      };
    });
    const keyOfPlanned = new Map([...planKeys].map(([key, id]) => [id, key]));
    const plan: PlannedDigest[] = pending.map((card) => {
      return {
        key: keyOfPlanned.get(card.id)!,
        bird: card.mascotId ?? BERRY.id,
        prompt: card.plan!.prompt,
        from: this.store.linesTo(card.id).flatMap(({ source }) => keyOfPlanned.get(source.id) ?? keyOf.get(source.id) ?? []),
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
    return { digest: planDigest({ flock, chosen: this.mascots.resolve(chosen), board: cards, plan, attached, scoped: about !== null }), sources };
  }

  // What a card gets from the cards its lines come from, each in the order the card shows them, fitted into one room
  // together. Never sends while the rows picked on any line have gone from their source.
  inputFor(cardId: string): CardInput {
    const lines = this.store.linesTo(cardId);
    const inputs = lines.map((line) => this.lineInput(line));
    if (inputs.includes("stale")) return { problem: STALE_ROWS };
    const direct = lines.map((line, index) => ({ lineId: line.lineId, from: line.source.id, name: this.labelOf(line.source), input: inputs[index] as RawInput | null }));
    return { answers: fitChain(this.chainOf(cardId, direct), MAX_CONTEXT_LENGTH, this.clean).map(({ answer }) => answer) };
  }

  // One line's input: its source's thread, the rows the user picked from its table as long as they're still in it, or
  // the whole table of a For-each card or of a file.
  private lineInput({ source, picked }: CardLine): LineInput {
    if (picked) return missingRows(picked, this.tableOf(source)).length > 0 ? "stale" : { name: this.labelOf(source), fromFile: !!source.table, part: "rows", table: picked };
    return this.ownPart(source);
  }

  // Codes the user typed and an address's details after a handoff come out before anything is fitted, since taking
  // them out can make the text longer. `Chats` takes them out again as it sends, which then changes nothing.
  private readonly clean = (text: string) => this.chats.withoutCodes(text);

  // What a card gives of its own: a file's table, a For-each card's once a row has a value, or a chat card's thread
  // once its newest reply has an answer. Nothing from a card that hasn't run.
  private ownPart(source: NestCard): RawInput | null {
    const name = this.labelOf(source);
    // A file goes as a file, with the card's own files, never as words here.
    if (source.file) return null;
    if (source.page) return this.pageInput(source);
    // Berry wrote it from the board's cards, so it goes as untrusted data, like the answers it came from.
    if (source.note) return { name, part: "note", text: source.note.text };
    if (source.table) return { name, fromFile: true, part: "table", table: this.tableOf(source)! };
    if (source.each) return source.each.runs.some((run) => run.cell !== null) ? { name, part: "table", table: combinedTable(source.each) } : null;
    if (source.versions) return this.versionsPart(source.versions, name);
    const thread = source.chatId ? this.chats.thread(source.chatId) : null;
    const exchanges = thread ? threadOf(thread.messages) : [];
    return exchanges.length > 0 ? { name, part: "thread", exchanges } : null;
  }

  // A page card's input: the open tab it shows, whose text is read when the card sends, or once that tab has closed, the
  // address it was put there with. Its name is where the page is now.
  private pageInput(card: NestCard): RawInput | null {
    if (!card.page) return null;
    const tabId = this.tabOfCard(card.id);
    const info = tabId ? this.tabs.info(tabId) : null;
    const live = info && checkAddress(info.url);
    const url = live && live.ok ? live.url : card.page.url;
    return { name: pageName(url), part: "page", url, title: live && live.ok ? cleanTitle(info.title) : card.page.title, tabId: live && live.ok ? tabId : null };
  }

  // What a card got from further up the chain: what each line into it gave, read now. Picked rows are what the line
  // kept, since that's what the card got. A For-each card's own rows are in its table already, so its driving line
  // only lets through what's further up.
  private chainOf(cardId: string, direct: Parameters<typeof gatherChain>[1]) {
    const edgesInto = (intoId: string): ChainEdge[] => {
      const into = this.store.card(intoId);
      // A page card reads from nothing: a line into it only joins it to the card whose job it showed.
      if (into?.page) return [];
      // Only what that card has sent with: a line its next message is the first to get isn't its yet.
      const lines = this.store.linesTo(intoId).filter((line) => !line.fresh);
      const driving = into?.each ? (this.store.eachLine(intoId) ?? lines[0]?.lineId) : null;
      return lines.map((line) => ({
        lineId: line.lineId,
        from: line.source.id,
        name: this.labelOf(line.source),
        give: () => {
          if (line.lineId === driving) return "skip";
          if (line.picked) return { name: this.labelOf(line.source), fromFile: !!line.source.table, part: "rows", table: line.picked };
          return this.ownPart(line.source);
        },
      }));
    };
    return gatherChain(cardId, direct, edgesInto);
  }

  // What one run of For each row gets, fitted into a run's room, for the row that leaves the least room for the rest.
  private longestRun(cardId: string, rows: PickedRows & { lineId: string }, direct: Parameters<typeof gatherChain>[1]) {
    const sentRow = (row: string[]) => sentLength({ name: "", part: "row", header: rows.header, row }, this.clean);
    const longest = rows.rows.reduce((most, row) => (sentRow(row) > sentRow(most) ? row : most), rows.rows[0]);
    // The row first, as `runInputs` puts it, so a card reached two ways up the chain is reached the same way here.
    const driving = direct.find((line) => line.lineId === rows.lineId)!;
    const runDirect = [{ ...driving, input: { name: "", part: "row" as const, header: rows.header, row: longest } }, ...direct.filter((line) => line !== driving)];
    return fitChain(this.chainOf(cardId, runDirect), MAX_CROSSING_LENGTH, this.clean);
  }

  // The one line For each row runs on: the first, in the card's order, that brings rows.
  private drivingLine(cardId: string): CardLine | null {
    return this.store.linesTo(cardId).find((line) => line.picked !== null || (this.tableOf(line.source)?.rows.length ?? 0) > 0) ?? null;
  }

  // The rows For each row runs on: the ones picked on its line, if they're all still there, or else that source's whole
  // table.
  private rowsFor(cardId: string): (PickedRows & { lineId: string }) | { problem: string } {
    const line = this.drivingLine(cardId);
    const table = line ? this.tableOf(line.source) : null;
    if (!line || !table || table.rows.length === 0) return { problem: "For each row needs a line from a card with a table." };
    if (!line.picked) return { ...table, lineId: line.lineId };
    return missingRows(line.picked, table).length > 0 ? { problem: STALE_ROWS } : { ...line.picked, lineId: line.lineId };
  }

  // What one run gets: its own row, labelled with the line it came from when the card was sent, and every other input
  // whole, as context shared by every run, all in one room. Null when rows picked on another input have gone, so the run
  // doesn't go without them.
  private runInputs(cardId: string, header: readonly string[], row: readonly string[]): CardAnswer[] | null {
    const lines = this.store.linesTo(cardId);
    const lineId = this.store.eachLine(cardId);
    // A card sent before the line was kept could only read from one.
    const driving = lineId ? lines.find((line) => line.lineId === lineId) : lines[0];
    const inputs = lines.map((line) => (line.lineId === driving?.lineId ? null : this.lineInput(line)));
    if (inputs.includes("stale")) return null;
    const rowInput: RawInput = { name: driving ? this.labelOf(driving.source) : "Another card", fromFile: !!driving?.source.table, part: "row", header, row };
    // The row first among its own inputs, as it always was. What's further up goes before them all, as background.
    const direct = [
      { lineId: driving?.lineId ?? "", from: driving?.source.id ?? "", name: rowInput.name, input: rowInput },
      ...lines.flatMap((line, index) => (line.lineId === driving?.lineId ? [] : [{ lineId: line.lineId, from: line.source.id, name: this.labelOf(line.source), input: inputs[index] as RawInput | null }])),
    ];
    return fitChain(this.chainOf(cardId, direct), MAX_CROSSING_LENGTH, this.clean).map(({ answer }) => answer);
  }

  // What a card's chats cost, with what its runs cost on tries Retry replaced.
  private costOf(card: NestCard): number | null {
    const chats = this.chats.costOf(this.chatsOf(card));
    const spent = card.each || card.versions ? this.store.spentOn(card.id) : 0;
    return chats === null && spent === 0 ? null : (chats ?? 0) + spent;
  }

  // What a card is called to the model and on screen: its bird's name, or a file's title.
  private labelOf(card: NestCard): string {
    if (card.page) return pageName(card.page.url);
    if (card.note) return NOTE_NAME;
    return card.table ? card.table.name : card.file ? card.file.name : this.mascots.resolve(card.mascotId).name;
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
    // Closing with a Nest open is leaving it.
    if (this.here) this.store.seeNest(this.here, Date.now());
  }

  private startRun(run: { id: string; cardId: string; row: string[] }): boolean {
    const card = this.store.card(run.cardId);
    if (card?.versions) return this.startVersion(card, run.id);
    if (!card?.each) return false;
    const cardAnswers = this.runInputs(card.id, card.each.header, run.row);
    const sent = cardAnswers && this.chats.send(null, card.each.prompt, {
      seePage: false,
      mascotId: card.mascotId,
      cardAnswers,
      started: (chatId) => this.store.setRunChat(run.id, chatId),
      onEnd: (end) => {
        this.pump();
        this.endGrantIfDone(card.id);
        this.fillCell(run.id);
        this.runEnded(card.id, card.nestId, end);
        this.advance(card.nestId);
      },
      cardGrant: this.grantFor(card.id),
      ...this.userSaid(card.id, null, null),
      ...this.givenAddresses(card.id),
      ...this.attachmentsFor(card.id),
      ...this.heard(card.id, card.nestId, run.id),
    });
    // Its bird has gone from the flock, rows picked on another input have gone, or the chat couldn't start. The others
    // still try.
    if (!sent) this.store.setRunState(run.id, "failed");
    else this.remember(card.id, run.id);
    this.changed(card.nestId);
    return !!sent;
  }

  // What one run of For each row will likely cost, on a draft that could run it and on a For-each card, for its runs again:
  // its own runs, or the card its rows come from, or a rough guess. Null on any other card.
  private perRunOf(card: NestCard): { cost: number; rough: boolean } | null {
    const costs = (chatIds: readonly (string | null)[]) => chatIds.flatMap((chatId) => (chatId ? [this.chats.costOf([chatId])] : [])).filter((cost): cost is number => cost !== null);
    const draft = !card.chatId && !card.each && !card.versions && !card.table && !card.file && !card.page && !card.note && card.plan?.state !== "armed";
    if (!card.each && !card.versions && !draft) return null;
    // A file's rows aren't read for this, since boards are sent often and a file costs nothing to read from.
    const lines = card.each || card.versions ? [] : this.store.linesTo(card.id);
    const source = lines.find((line) => !!line.source.table || line.picked !== null || (this.tableOf(line.source)?.rows.length ?? 0) > 0)?.source;
    // A draft with nothing to run each row on can still be sent as versions, each costing about what the card it reads
    // from did, or a typical job for the model.
    const reads = source ?? lines.find((line) => !!line.source.chatId)?.source;
    const fromSource = reads?.each ? costs(reads.each.runs.map((run) => run.chatId)) : costs([reads?.chatId ?? null]);
    const own = (card.each ?? card.versions)?.runs.map((run) => run.chatId) ?? [];
    return perRunEstimate({ own: costs(own), source: fromSource, rough: this.chats.roughJobCost() });
  }

  // What a run of this card may do without asking, read live, so it ends for every run the moment the card does.
  private grantFor(cardId: string): CardGrantAccess {
    return { covers: (key) => this.grants.covers(cardId, key), add: (key) => this.grants.add(cardId, key) };
  }

  // A grant lasts until the card finishes: once no run of it waits or goes, it's gone, and a retry asks again.
  private endGrantIfDone(cardId: string): void {
    const card = this.store.card(cardId);
    if (!card?.each) return this.grants.end(cardId);
    if (!card.each.runs.some((run) => run.state === "waiting" || (!!run.chatId && this.chats.isRunning(run.chatId)))) this.grants.end(cardId);
  }

  private answerOf(chatId: string): string | null {
    const thread = this.chats.thread(chatId);
    return thread ? latestAnswer(thread.messages) : null;
  }

  // What the user picked, if every row of it is in the source's table now. Undefined if not.
  private pickedFrom(source: NestCard | null, picked: unknown): PickedRows | undefined {
    const rows = picked as PickedRows;
    const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((cell) => typeof cell === "string");
    if (!source || !rows || !strings(rows.header) || !Array.isArray(rows.rows) || rows.rows.length === 0 || !rows.rows.every(strings)) return undefined;
    const table = this.tableOf(source);
    if (!table || missingRows(rows, table).length > 0) return undefined;
    return { header: rows.header, rows: rows.rows };
  }

  private chatsOf(card: NestCard): string[] {
    return [...(card.chatId ? [card.chatId] : []), ...((card.each ?? card.versions)?.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])) ?? [])];
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
