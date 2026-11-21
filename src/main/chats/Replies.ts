import { ModelConfigError, type ReplyMessage } from "./agent";
import type { PageTool } from "../tools/browserTools";
import { mascotNote } from "./mascotNote";
import type { ActionApproval } from "../../shared/ipc";
import type { Tab } from "../tabs/Tab";
import type { ChatStep, SaidOnTheWay, StepKind } from "../../shared/library";
import { BERRY, narrowSites } from "../../shared/mascots";
import { publicApproval, type Approvals } from "./Approvals";
import type { ChatTitles } from "./chatTitles";
import type { ChatParts, Run, TaskProgress, TaskResult } from "./chatTypes";
import { endedRun, newRun } from "./run";
import type { Handoffs } from "./Handoffs";
import type { JobMemory } from "./jobMemory";
import type { Jobs } from "./Jobs";
import { CloudBusyError, type JobTools } from "./JobTools";
import type { ModelMessages } from "./modelMessages";

// The step a stopped reply ends with. The chat's trail always shows it, by these words.
const STOPPED_STEP = "Stopped here";

// How a reply's steps are kept once it's over, in a chat, a routine or on the runner: a step cut off by Stop is over
// too, and a stopped one says where it was stopped, so it never ends in nothing.
const endedSteps = (steps: ChatStep[], stopped: boolean): ChatStep[] => [
  ...steps.map((step) => ({ ...step, done: true })),
  ...(stopped ? [{ text: STOPPED_STEP, done: true }] : []),
];

const errorMessage = (error: unknown): string => {
  if (error instanceof ModelConfigError || error instanceof CloudBusyError) return error.message;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("unauthorized")) {
    return "The AI service turned down the key. Check it in Settings, under Connections.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "The model is rate limited right now. Try again in a moment.";
  }
  // LangChain's OpenAI client says only "Connection error." with no network.
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econnrefused") ||
    message.includes("connection error")
  ) {
    return "Couldn't reach the model. Check your connection and try again.";
  }
  return "Something went wrong with this reply. Try again.";
};

// A status line grows as its message streams, so it replaces what that message said so far, until a step comes between.
const keepSaid = (said: SaidOnTheWay[], after: number, text: string): void => {
  const last = said.at(-1);
  if (last && last.after === after && text.startsWith(last.text)) last.text = text;
  else said.push({ after, text });
};

const ASKING: readonly ActionApproval[] = ["never", "risky", "always"];
// The one that asks more.
const stricter = (a: ActionApproval, b: ActionApproval | undefined): ActionApproval => (b && ASKING.indexOf(b) > ASKING.indexOf(a) ? b : a);

// Running a reply, a chat's or a task's: the model's words and steps as they come, and what's saved once it's over.
export class Replies {
  private readonly store: ChatParts["store"];
  private readonly streamReply: ChatParts["streamReply"];
  private readonly browser: ChatParts["browser"];
  private readonly events: ChatParts["events"];
  private readonly mascotOf: ChatParts["mascotOf"];
  private readonly cloud: ChatParts["cloud"];
  private readonly runs: ChatParts["runs"];
  private readonly errors: ChatParts["errors"];
  private readonly finished: ChatParts["finished"];
  private readonly pageAccess: ChatParts["pageAccess"];
  private readonly publish: ChatParts["publish"];
  private readonly publishWorkingTabs: ChatParts["publishWorkingTabs"];
  private readonly notify: ChatParts["notify"];
  private readonly withoutCodes: ChatParts["withoutCodes"];
  private readonly jobs: Jobs;
  private readonly handoffs: Handoffs;
  private readonly approvals: Approvals;
  private readonly tools: JobTools;
  private readonly reader: ModelMessages;
  private readonly jobMemory: JobMemory;
  private readonly titles: ChatTitles;

  constructor(
    parts: Pick<
      ChatParts,
      | "store"
      | "streamReply"
      | "browser"
      | "events"
      | "mascotOf"
      | "cloud"
      | "runs"
      | "errors"
      | "finished"
      | "pageAccess"
      | "publish"
      | "publishWorkingTabs"
      | "notify"
      | "withoutCodes"
    > & {
      jobs: Jobs;
      handoffs: Handoffs;
      approvals: Approvals;
      tools: JobTools;
      reader: ModelMessages;
      jobMemory: JobMemory;
      titles: ChatTitles;
    },
  ) {
    this.store = parts.store;
    this.streamReply = parts.streamReply;
    this.browser = parts.browser;
    this.events = parts.events;
    this.mascotOf = parts.mascotOf;
    this.cloud = parts.cloud;
    this.runs = parts.runs;
    this.errors = parts.errors;
    this.finished = parts.finished;
    this.pageAccess = parts.pageAccess;
    this.publish = parts.publish;
    this.publishWorkingTabs = parts.publishWorkingTabs;
    this.notify = parts.notify;
    this.withoutCodes = parts.withoutCodes;
    this.jobs = parts.jobs;
    this.handoffs = parts.handoffs;
    this.approvals = parts.approvals;
    this.tools = parts.tools;
    this.reader = parts.reader;
    this.jobMemory = parts.jobMemory;
    this.titles = parts.titles;
  }

  // Never rejects: whatever goes wrong ends up on the thread.
  async reply(chatId: string, run: Run, seePage: boolean, attachedTabs: readonly Tab[]): Promise<void> {
    const { signal } = run.controller;
    const probeAt = performance.now();
    console.error("[probe] reply starts", Math.round(probeAt));
    try {
      // Read before anything waits, so it's the page the message was sent from wherever the user has gone since.
      const page = seePage && this.pageAccess() ? this.reader.activeTab : null;
      if (page) run.sentPage = page;
      // Sending a page with a message is the user sharing it, so one they kept back is theirs to give.
      if (page) this.handoffs.letGo(page);
      run.withPage = page !== null;
      const messages = await this.reader.requestMessages(chatId, seePage, run.mascot, attachedTabs);
      console.error("[probe] page read +", Math.round(performance.now() - probeAt));
      // Only what the user typed. Nothing attached is their words, so no address in a file or a page skips a card.
      const said = this.jobMemory.userWords(chatId).join("\n");
      const tools = this.tools.jobTools(chatId, run, page, said, attachedTabs);
      this.jobMemory.recall(chatId, run, said);
      await this.consume(chatId, run, messages, tools, (content) => {
        if (content) this.events.onChunk(chatId, content);
      });
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error in chat reply:", error);
        this.errors.set(chatId, errorMessage(error));
      }
    }

    if (run.cloud) this.cloud?.release(chatId);
    // Deleted while replying, so there's nowhere to save it.
    if (this.runs.get(chatId) !== run) return;
    const error = this.errors.get(chatId) ?? null;
    const outcome = signal.aborted ? "stopped" : error ? "failed" : "done";
    const ended = endedRun(run, outcome);
    this.finished.set(chatId, ended);
    this.runs.delete(chatId);
    const pages = this.jobs.closeJobTabs(chatId, run);
    this.publishWorkingTabs();
    const steps = endedSteps(run.steps, signal.aborted);
    if (run.partial || steps.length > 0) {
      this.store.addMessage(chatId, {
        role: "assistant",
        content: run.partial,
        steps,
        memoryIds: run.memoryIds,
        ...(pages.length > 0 ? { pages } : {}),
        said: this.saidOf(run),
        startedAt: run.startedAt,
        took: Date.now() - run.startedAt,
      });
    }
    // Finished while the user was somewhere else, so the sidebar shows it as done until they open it.
    if (!signal.aborted && this.browser.chatInFront && !this.browser.chatInFront(chatId)) this.store.setSeen(chatId, false);
    run.onEnd?.({ reply: run.partial, steps, outcome, error });
    this.notify(chatId);
    if (run.partial && !error) void this.titles.nameChat(chatId);
    // Another app wrote what this chat started with, so none of it is what the user said about themselves.
    if (this.store.chat(chatId)?.from) return;
    // An offer is only wanted while this is still the chat's last reply. Its summary says so, so nothing waiting on the
    // model holds on to the run.
    this.jobMemory.offerToRemember(chatId, run, error !== null, {
      said: this.jobMemory.userWords(chatId),
      routine: null,
      stillWanted: () => this.finished.get(chatId) === ended,
    });
  }

  private async consume(
    id: string,
    run: Run,
    messages: ReplyMessage[],
    tools: PageTool[],
    // Hears each piece of the answer as it's added, or nothing when the whole reply went out instead, as it does when the
    // answer is taken back or the status line goes.
    onWords: (content: string) => void,
    onUsage?: (tokens: number) => void,
  ): Promise<void> {
    for await (const part of this.streamReply(messages, run.controller.signal, {
      tools,
      actionApproval: () => stricter(this.browser.actionApproval(), run.askAtLeast),
      approve: (text, why) => this.approvals.askToAllow(id, run, text, why),
      onStep: (text, shown, kind) => this.startStep(id, run, text, shown, kind),
      onUsage,
      mascotNote: (run.mascot.id === BERRY.id ? "" : mascotNote(run.mascot)) + run.memoryNote || undefined,
      userPresent: run.userPresent,
    })) {
      if (typeof part !== "string") {
        // What streamed as the answer was on the way to it, so it comes out of the answer.
        const tookBack = run.partial !== "";
        run.partial = "";
        run.breakBeforeText = false;
        run.statusLine = part.statusLine;
        keepSaid(run.said, run.steps.length, part.statusLine);
        this.publish(id, run);
        if (tookBack) onWords("");
        continue;
      }
      const content = run.breakBeforeText ? `\n\n${part}` : part;
      run.breakBeforeText = false;
      run.partial += content;
      // The answer has started, so the line saying what it's doing goes, and the whole reply goes out with it.
      if (run.statusLine === null) onWords(content);
      else {
        // Words taken for a status line that turn out to be the answer, as a long job's last call can, are said once.
        if (run.said.at(-1)?.after === run.steps.length && run.said.at(-1)?.text === part.trim()) run.said.pop();
        run.statusLine = null;
        this.publish(id, run);
        onWords("");
      }
    }
  }

  // Runs one message as a chat with no page would, with the same tools and the same approvals, under an id of the
  // caller's. Nothing is saved here. `stop` and `decide` take that id. Never rejects.
  // With `cloud`, it works in the cloud browser's pages instead, as the cloud runner's jobs do, and `earlier` is the chat
  // that came before the message. `onText` is told the reply so far as it's written.
  async runTask(
    id: string,
    message: string,
    onProgress: (progress: TaskProgress) => void,
    mascotId: string | null = null,
    sites: string[] = [],
    { cloud = false, earlier = [], onText }: { cloud?: boolean; earlier?: ReplyMessage[]; onText?: (text: string) => void } = {},
  ): Promise<TaskResult> {
    let tokens = 0;
    const mascot = this.mascotOf(mascotId);
    const run: Run = newRun({
      // A routine's own sites can only narrow what its mascot may do.
      mascot: { ...mascot, sites: narrowSites(mascot.sites, sites) },
      onChange: () =>
        onProgress({
          steps: run.steps.map((step) => ({ ...step })),
          statusLine: run.statusLine,
          approval: run.approval && publicApproval(run.approval),
          tokens,
          memoryIds: run.memoryIds,
        }),
      earlierSites: new Set(),
      cloud,
      userPresent: false,
    });
    this.runs.set(id, run);
    this.jobs.taskPopups.set(id, new Set());
    let error: string | null = null;
    try {
      const said = [
        ...earlier.flatMap(({ role, content }) => (role === "user" && typeof content === "string" ? [content] : [])),
        message,
      ].join("\n");
      const tools = this.tools.jobTools(id, run, null, said);
      this.jobMemory.recall(id, run, message);
      await this.consume(
        id,
        run,
        [...earlier, { role: "user", content: message }],
        tools,
        () => onText?.(run.partial),
        (used) => (tokens += used),
      );
    } catch (caught) {
      if (!run.controller.signal.aborted) {
        console.error("Error in a task:", caught);
        error = errorMessage(caught);
      }
    }
    if (cloud) this.cloud?.release(id);
    this.runs.delete(id);
    this.publishWorkingTabs();
    this.jobMemory.offerToRemember(id, run, error !== null, { said: [], routine: message, stillWanted: () => true });
    const tabIds = [...(this.jobs.get(id)?.own ?? []), ...(this.jobs.taskPopups.get(id) ?? [])];
    this.jobs.delete(id);
    this.jobs.taskPopups.delete(id);
    return {
      text: run.partial,
      steps: endedSteps(run.steps, run.controller.signal.aborted),
      error,
      stopped: run.controller.signal.aborted,
      tokens,
      tabIds,
    };
  }

  // What it wrote on the way, cleaned as anything a page could have put in it.
  saidOf(run: Run): SaidOnTheWay[] {
    return run.said.map(({ after, text }) => ({ after, text: this.withoutCodes(text) }));
  }

  private startStep(chatId: string, run: Run, text: string, shown?: string, kind?: StepKind): () => void {
    const step: ChatStep = { text, done: false, ...(shown ? { shown } : {}), ...(kind ? { kind } : {}) };
    run.steps.push(step);
    run.breakBeforeText = run.partial !== "";
    this.publish(chatId, run);
    return () => {
      step.done = true;
      this.publish(chatId, run);
    };
  }
}
