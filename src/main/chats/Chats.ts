import type { GenerateTitle, ReplyMessage, StreamReply } from "./agent";
import { siteOf } from "../tools/browserTools";
import type { ActionApproval } from "../../shared/ipc";
import type { StoredChat } from "./ChatStore";
import type { Tab } from "../tabs/Tab";
import { REPLY_NOT_SAVED, type ChatStep, type ChatThread, type MascotProfile, type WorkOutcome } from "../../shared/library";
import { BERRY, narrowSites } from "../../shared/mascots";
import { sentAttachment, type PreparedFile } from "./Attachments";
import { MAX_FILES, MAX_TABS, type SentAttachment, type TabChoice } from "../../shared/attachments";
import type { JobWork } from "../window/WorkViews";
import { Approvals, publicApproval } from "./Approvals";
import { ChatTitles, MAX_RENAME_LENGTH, titleFrom } from "./chatTitles";
import type {
  ChatBrowser,
  ChatCloud,
  ChatEvents,
  ChatParts,
  ChatRunner,
  ChatStoreLike,
  EndedReply,
  Run,
  TaskProgress,
  TaskResult,
  WaitingRun,
} from "./chatTypes";
import { Handoffs } from "./Handoffs";
import { JobMemory, type ChatMemory } from "./jobMemory";
import { Jobs } from "./Jobs";
import { JobTools } from "./JobTools";
import { ModelMessages } from "./modelMessages";
import { Replies } from "./Replies";
import { RunnerChats } from "./RunnerChats";
import { newRun } from "./run";
import { WorkView } from "./WorkView";

// Callers take these from here, as they always have.
export type { ChatCloud, ChatEvents, ChatRunner, ChatStoreLike, EndedReply, RunnerJobInput } from "./chatTypes";
export type { RunnerProgress, TaskProgress, TaskResult, WaitingRun } from "./chatTypes";
export type { ChatMemory } from "./jobMemory";

// Every conversation with the model, whichever screen it's on. Replies are saved once they end. Each job here has a
// part of its own, which `Chats` makes and hands the same state: `Replies` runs a reply, `JobTools` gives it its tools,
// `Jobs` keeps which tabs are whose, `Handoffs` hands a tab to the user, `Approvals` waits on their answer, `JobMemory`
// recalls and offers to remember, `ModelMessages` is what the model reads, `WorkView` what the working view shows, and
// `RunnerChats` the chats on the cloud runner.
export class Chats {
  private readonly runs = new Map<string, Run>();
  private readonly errors = new Map<string, string>();
  private pageAccess = true;
  private readonly finished: ChatParts["finished"] = new Map();
  // Chats started in the cloud, whose later messages go there too. Memory only, so after a restart a chat works here.
  private readonly cloudChats = new Set<string>();
  private readonly handoffs: Handoffs;
  private readonly jobs: Jobs;
  private readonly approvals: Approvals;
  private readonly workView: WorkView;
  private readonly runnerChats: RunnerChats;
  private readonly replies: Replies;

  constructor(
    private readonly store: ChatStoreLike,
    streamReply: StreamReply,
    generateTitle: GenerateTitle,
    private readonly browser: ChatBrowser,
    private readonly events: ChatEvents,
    // Who a chat runs as, read when each reply starts. It must never answer with more than the mascot was given.
    private readonly mascotOf: (id: string | null) => MascotProfile = () => BERRY,
    private readonly memory: ChatMemory | null = null,
    private readonly cloud: ChatCloud | null = null,
    private readonly runner: ChatRunner | null = null,
  ) {
    const parts: ChatParts = {
      store,
      // Called on Chats, as they always were, wherever the call now is.
      streamReply: streamReply.bind(this),
      generateTitle: generateTitle.bind(this),
      browser,
      events,
      mascotOf: (id) => this.mascotOf(id),
      memory,
      cloud,
      runner,
      runs: this.runs,
      errors: this.errors,
      finished: this.finished,
      pageAccess: () => this.pageAccess,
      publish: (chatId, run) => this.publish(chatId, run),
      publishWorkingTabs: () => this.publishWorkingTabs(),
      notify: (chatId) => this.notify(chatId),
      withoutCodes: (text) => this.withoutCodes(text),
    };
    const decide: Approvals["decide"] = (...args) => this.decide(...args);
    const handoffs = (this.handoffs = new Handoffs({ ...parts, wait: (...args) => this.approvals.wait(...args), decide }));
    const jobs = (this.jobs = new Jobs({ ...parts, handoffs, decide }));
    const approvals = (this.approvals = new Approvals({ ...parts, jobs }));
    const titles = new ChatTitles(parts);
    const tools = new JobTools({ ...parts, jobs, handoffs, approvals });
    const reader = new ModelMessages({ ...parts, jobs, handoffs });
    const jobMemory = new JobMemory({ ...parts, jobs, handoffs });
    this.workView = new WorkView({ ...parts, jobs });
    this.runnerChats = new RunnerChats({ ...parts, titles, thread: (id) => this.thread(id) });
    this.replies = new Replies({ ...parts, jobs, handoffs, approvals, tools, reader, jobMemory, titles });
  }

  // What a page might say back after a code went in.
  withoutCodes(text: string): string {
    return this.handoffs.withoutCodes(text);
  }

  enterCode(chatId: string, approvalId: string, code: string) {
    return this.handoffs.enterCode(chatId, approvalId, code);
  }

  tabClosed(tabId: string): void {
    this.jobs.tabClosed(tabId);
  }

  waiting(): WaitingRun[] {
    return this.approvals.waiting();
  }

  notePopup(openerId: string, tabId: string): void {
    this.jobs.notePopup(openerId, tabId);
  }

  isOwnTab(tabId: string): boolean {
    return this.jobs.isOwnTab(tabId);
  }

  tabProblem(tab: Tab, chatId: string | null, mascot: MascotProfile): string | null {
    return this.jobs.tabProblem(tab, chatId, mascot);
  }

  attachableTabs(chatId: string | null, mascotId: string | null): TabChoice[] {
    return this.jobs.attachableTabs(chatId, mascotId);
  }

  jobChatOf(tabId: string): string | null {
    return this.jobs.jobChatOf(tabId);
  }

  releaseTab(tabId: string): void {
    this.jobs.releaseTab(tabId);
  }

  work(chatId: string): JobWork | null {
    return this.workView.work(chatId);
  }

  // How a chat's last reply since launch ended. Null while one runs, and for a chat with none since launch.
  outcome(chatId: string): WorkOutcome | null {
    return this.finished.get(chatId)?.outcome ?? null;
  }

  thread(id: string): ChatThread | null {
    const chat = this.store.chat(id);
    return chat && this.toThread(chat);
  }

  private toThread(chat: StoredChat): ChatThread {
    const run = this.runs.get(chat.id);
    if (this.runner?.has(chat.id)) return this.runnerChats.threadOf(chat);
    const unsaved = this.finished.get(chat.id)?.unsaved;
    return {
      ...chat,
      messages: unsaved ? [...chat.messages, unsaved] : chat.messages,
      partial: run?.partial ?? null,
      statusLine: run?.statusLine ?? null,
      steps: run?.steps ?? [],
      said: run ? this.replies.saidOf(run) : [],
      startedAt: run?.startedAt ?? null,
      approval: run?.approval ? publicApproval(run.approval) : null,
      error: this.errors.get(chat.id) ?? null,
      memoryIds: run?.memoryIds ?? [],
    };
  }

  // Whether its jobs go to the cloud, on the runner or in a cloud tab.
  inCloud(chatId: string): boolean {
    return this.cloudChats.has(chatId) || !!this.runner?.has(chatId);
  }

  isRunning(chatId: string): boolean {
    return this.runs.has(chatId) || !!this.runner?.progress(chatId);
  }

  // Starts a chat when `chatId` is null, as `mascotId` if it's given. An existing chat stays with its own mascot.
  // The reply follows through the events. `from` names the app outside Blueberry that started a new chat, and `sites`,
  // `tools` and `askAtLeast` can only narrow what this reply may do, on top of the mascot's own and the setting.
  // `onEnd` hears how this reply ended, and nothing of a later one. `userPresent` is only for a message the user typed in
  // one of Blueberry's own composers, where they're there to answer a question before it starts.
  send(
    chatId: string | null,
    text: string,
    {
      seePage,
      mascotId,
      from = null,
      sites = [],
      tools,
      askAtLeast,
      onEnd,
      cloud = false,
      runner = false,
      userPresent = false,
      files = [],
      tabs: tabIds = [],
    }: {
      seePage: boolean;
      mascotId?: string | null | undefined;
      from?: string | null;
      sites?: string[];
      tools?: string[];
      askAtLeast?: ActionApproval;
      onEnd?: (ended: EndedReply) => void;
      cloud?: boolean;
      runner?: boolean;
      userPresent?: boolean;
      // What the user attached in the prompt box: files main read and checked, and the ids of their tabs.
      files?: readonly PreparedFile[];
      tabs?: readonly string[];
    },
  ): ChatThread | null {
    const message = text.trim();
    if (!message) return null;
    if (chatId && (!this.store.chat(chatId) || this.isRunning(chatId))) return null;
    if (files.length > MAX_FILES || tabIds.length > MAX_TABS || new Set(tabIds).size !== tabIds.length) return null;
    if (chatId) this.saveUnsaved(chatId);
    const attaching = files.length > 0 || tabIds.length > 0;
    // Only the user starts one there, from this window, so not an app and never with a page. What's attached would go
    // to our server with the job, so nothing attached goes there.
    const inRunner = (runner === true && from === null) || (chatId !== null && !!this.runner?.has(chatId));
    if (inRunner) return attaching ? null : this.runnerChats.sendToRunner(chatId, message, mascotId ?? null);
    const inCloud = cloud === true || (chatId !== null && this.cloudChats.has(chatId));
    // Asked for the cloud with it off, the job doesn't quietly run in the user's own tabs instead.
    if (inCloud && !this.cloud?.available()) return null;
    // A job in the cloud works in its own browser there, never in a tab here. Files go to the model from here as ever.
    if (inCloud && tabIds.length > 0) return null;

    // The renderer's choice is checked here, so only a mascot that's here can start a chat.
    const chosen = typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null;
    if (!chatId && chosen && this.mascotOf(chosen).deletedAt !== null) return null;
    const profile = this.mascotOf(chatId ? (this.store.chat(chatId)?.mascotId ?? null) : chosen);
    const narrowed = sites.length > 0 ? { ...profile, sites: narrowSites(profile.sites, sites) } : profile;
    const mascot = tools ? { ...narrowed, tools: narrowed.tools.filter((tool) => tools.includes(tool)) } : narrowed;
    // Judged again here, as the message goes, since anything may have changed since the menu showed them.
    const tabsNow = tabIds.flatMap((tabId) => this.browser.allTabs().filter((tab) => tab.id === tabId));
    if (tabsNow.length !== tabIds.length || tabsNow.some((tab) => this.tabProblem(tab, chatId, mascot) !== null)) return null;
    const id = chatId ?? this.store.createChat(titleFrom(message), chosen, from);
    const attached: SentAttachment[] = [
      ...tabsNow.map((tab) => ({ kind: "tab" as const, title: this.withoutCodes(tab.title || siteOf(tab.url)), site: siteOf(tab.url) })),
      ...files.map(sentAttachment),
    ];
    this.store.addMessage(id, { role: "user", content: message, ...(attached.length > 0 ? { attached } : {}) }, files);
    if (tabsNow.length > 0) this.jobs.attach(id, tabsNow);
    this.errors.delete(id);
    const earlier = this.finished.get(id);
    this.finished.delete(id);
    this.memory?.dropOffers(id);

    const run = newRun({ mascot, earlierSites: new Set(earlier?.beenTo), cloud: inCloud, askAtLeast, onEnd, userPresent });
    if (inCloud) this.cloudChats.add(id);
    this.runs.set(id, run);
    // A page in this window never goes with a job in the cloud.
    void this.replies.reply(id, run, seePage && !inCloud, tabsNow);

    this.notify(id);
    return this.thread(id);
  }

  // An answer that couldn't be saved goes in before the next message, wherever that runs, so the model reads it. If it
  // still can't be saved, this throws and it stays on screen.
  private saveUnsaved(chatId: string): void {
    const ended = this.finished.get(chatId);
    if (!ended?.unsaved) return;
    const { unsaved, ...saved } = ended;
    this.store.addMessage(chatId, unsaved);
    this.finished.set(chatId, saved);
    if (this.errors.get(chatId) === REPLY_NOT_SAVED) this.errors.delete(chatId);
  }

  adoptRunnerChat(prompt: string, mascotId: string | null): string {
    return this.runnerChats.adoptRunnerChat(prompt, mascotId);
  }

  runnerFollowedUp(chatId: string, prompt: string): void {
    this.runnerChats.runnerFollowedUp(chatId, prompt);
  }

  // The runner's rows changed.
  runnerChanged(chatId: string): void {
    this.notify(chatId);
  }

  runnerFinished(chatId: string, finished: { reply: string; steps: ChatStep[]; error: string | null }): void {
    this.runnerChats.runnerFinished(chatId, finished);
  }

  private notify(chatId: string): void {
    const thread = this.thread(chatId);
    if (thread) this.events.onThread(thread);
    this.events.onListChanged();
  }

  // The chat's tab came to the front.
  markSeen(chatId: string): void {
    if (this.store.setSeen(chatId, true)) this.events.onListChanged();
  }

  rename(chatId: string, title: string): boolean {
    const name = title.trim().slice(0, MAX_RENAME_LENGTH);
    if (!name || !this.store.renameChat(chatId, name)) return false;
    this.notify(chatId);
    return true;
  }

  delete(chatId: string): boolean {
    this.stop(chatId);
    this.runs.delete(chatId);
    this.publishWorkingTabs();
    this.errors.delete(chatId);
    this.finished.delete(chatId);
    this.jobs.delete(chatId);
    this.cloudChats.delete(chatId);
    this.runnerChats.runnerPending.delete(chatId);
    this.runner?.forget(chatId);
    this.memory?.dropOffers(chatId);
    if (!this.store.deleteChat(chatId)) return false;
    this.events.onListChanged();
    return true;
  }

  stop(chatId: string): void {
    this.runs.get(chatId)?.controller.abort();
    if (this.runner?.has(chatId)) this.runner.stop(chatId);
  }

  // Stop in the toolbar, from the tab being worked in rather than from a chat. The same as Stop in the chat or on a routine.
  stopWorkIn(tabId: string): boolean {
    const working = [...this.runs.values()].filter((run) => [...run.tabs].some((tab) => tab.id === tabId));
    working.forEach((run) => run.controller.abort());
    return working.length > 0;
  }

  stopAll(): void {
    this.runs.forEach((run) => run.controller.abort());
  }

  runTask(
    id: string,
    message: string,
    onProgress: (progress: TaskProgress) => void,
    mascotId: string | null = null,
    sites: string[] = [],
    options: { cloud?: boolean; earlier?: ReplyMessage[]; onText?: (text: string) => void } = {},
  ): Promise<TaskResult> {
    return this.replies.runTask(id, message, onProgress, mascotId, sites, options);
  }

  private publishWorkingTabs(): void {
    const runs = [...this.runs.values()];
    const mascots = new Map(
      runs.filter((run) => run.mascot.id !== BERRY.id).flatMap((run) => [...run.tabs].map((tab) => [tab, run.mascot.id] as const)),
    );
    this.events.onWorkingTabs(new Set(runs.flatMap((run) => [...run.tabs])), mascots);
  }

  private publish(chatId: string, run: Run): void {
    if (run.onChange) return run.onChange();
    const thread = this.runs.get(chatId) === run ? this.thread(chatId) : null;
    if (thread) this.events.onThread(thread);
  }

  decide(
    chatId: string,
    approvalId: string,
    allow: boolean,
    answer?: string,
    from: { fromPhone?: boolean; fromApp?: boolean } = {},
  ): boolean {
    return this.approvals.decide(chatId, approvalId, allow, answer, from);
  }

  // The "Can see" toggle. Off means no page text or screenshot goes with a message.
  setPageAccess(enabled: boolean): boolean {
    this.pageAccess = enabled === true;
    return this.pageAccess;
  }

  get canSeePage(): boolean {
    return this.pageAccess;
  }
}
