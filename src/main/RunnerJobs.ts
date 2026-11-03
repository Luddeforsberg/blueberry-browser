import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Account } from "./Account";
import { isLiveView } from "./browserbase";
import type { ChatRunner, RunnerJobInput, RunnerProgress } from "./Chats";
import { approvalFromRow, FINISHED, historyFromRow, mascotSnapshot, stepsFromRow, type CloudJobStatus, type CloudRoutineRow } from "./cloudJobs";
import { ServerError, type GalleryServer } from "./galleryServer";
import type { RunnerState } from "../shared/ipc";
import type { ChatStep, MascotProfile } from "../shared/library";
import { flockRows } from "../shared/phone";

// Chats whose jobs went to the cloud runner, which keeps going with this computer off. The jobs, their steps and their
// approvals are rows in Supabase, read as the signed-in user, so nobody else's can come back. Only the user's own answer
// from this window is written back, through `decide_cloud_approval`: the runner can't write one, and neither can the phone
// or an app here. Which chat is which conversation, and which of its jobs it has, is kept in a file of ids. A conversation
// started or followed up on the phone shows here as a runner chat too, found by looking now and then. The live view
// address goes to the chrome and nowhere else.

const POLL_MS = 2_000;
// How often to look for conversations started or followed up elsewhere, while a linked runner has accepted.
const DISCOVER_MS = 10_000;
// Conversations deleted here, kept so a slow delete on the server can't bring one back as a chat started elsewhere.
const MAX_FORGOTTEN = 500;

const NOT_SET_UP = "This copy of Blueberry has no account server, so it can't send jobs to the cloud.";
const SIGN_IN = "Sign in to your Blueberry account in Settings to send jobs to the cloud.";
const NOT_TAKEN = "The cloud didn't take the job. Try again in a moment.";
const TOO_MANY = "Five jobs are already waiting or going in the cloud. Try again when one is done.";
const FAILED = "The job failed in the cloud.";
const BUSY = "This chat already has a job going in the cloud, maybe sent from your phone. Send this again once it's done.";
const GONE = "This job isn't on your account any more.";
const NO_SUCH_RUNNER = "There's no Blueberry account with that email that can run your jobs. Create it in Supabase first, and don't use your own.";
const LINK_FAILED = "That account couldn't be linked. Try again in a moment.";
// The link is looked up again this often while the runner hasn't accepted, and less often once it has, in case it's
// been unlinked elsewhere. Opening the composer looks too.
const LINK_POLL_MS = 10_000;
const LINKED_POLL_MS = 5 * 60_000;
const NO_RUNNER = "Jobs with your Mac off aren't linked any more, so this wasn't sent. Link them again in Settings > Cloud.";
const SWITCHED = "You signed in to another account while this was being sent, so it wasn't sent. Send it again.";
const OTHER_ACCOUNT = (email: string) => `This chat's jobs are on ${email}. Sign in to that account to go on with it.`;

interface Entry {
  // The account that sent it, by email. Only that account, signed in, sees anything of it.
  account: string;
  // The conversation its jobs are in, which the phone shows as one too.
  conversationId: string;
  // Every job of it this chat already has, so one sent from elsewhere can be told apart.
  jobIds: string[];
  // The newest job. Null while it's being sent.
  jobId: string | null;
  // Stopped or deleted while it was being sent, which is done as soon as its id comes back.
  cancel: "stop" | "forget" | null;
  active: boolean;
  status: CloudJobStatus;
  steps: ChatStep[];
  reply: string;
  error: string | null;
  liveView: string | null;
  approval: RunnerProgress["approval"];
}

export interface RunnerJobsHooks {
  changed: (chatId: string) => void;
  finished: (chatId: string, result: { reply: string; steps: ChatStep[]; error: string | null }) => void;
  // The user's Browserbase Context, so the sites they brought along are signed in there too.
  contextId: () => string | null;
  runnerUpdated?: (state: RunnerState) => void;
  // The flock, shared with the phone page while a linked runner has accepted, so a job can be sent from there as any bird.
  flock?: () => MascotProfile[];
  // A conversation started elsewhere becomes a chat here, as the bird its first job ran as. Says the chat's id.
  adopt?: (first: { prompt: string; mascotId: string | null }) => string | null;
  // A message sent in that chat from elsewhere, saved as the user's.
  followedUp?: (chatId: string, prompt: string) => void;
  // The routines that run in the cloud, as rows for it, kept there while a linked runner has accepted.
  routines?: () => CloudRoutineRow[];
  // What `stillInCloud` or `cloudFailed` says about a routine changed.
  routinesSettled?: () => void;
}

const fresh = (account: string, conversationId: string, jobIds: string[], jobId: string | null, active: boolean): Entry => ({ account, conversationId, jobIds, jobId, cancel: null, active, status: "queued", steps: [], reply: "", error: null, liveView: null, approval: null });

type NewJob = Record<string, unknown> & { id: string; prompt: string };

// A conversation's jobs, oldest first, that this chat doesn't have yet.
const newJobs = (rows: Record<string, unknown>[], known: string[]): NewJob[] =>
  rows.filter((row): row is NewJob => typeof row.id === "string" && typeof row.prompt === "string" && !known.includes(row.id));

// How a job that's over ended, as the chat says it.
const endError = (status: CloudJobStatus, error: string | null): string | null => (status === "failed" ? (error ?? FAILED) : status === "stopped" ? error : null);

export class RunnerJobs implements ChatRunner {
  private readonly entries = new Map<string, Entry>();
  // Answered here and on its way, so a poll that crosses it doesn't bring the card back.
  private readonly answered = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private readonly discoverTimer: ReturnType<typeof setInterval>;
  private discovering = false;
  private readonly forgotten: string[] = [];
  // Who was signed in when the account last changed, so a change clears what the last one saw.
  private seenAccount: string | null;
  // The runner linked to the signed-in account, as the server last said, and why linking last failed.
  private link: { email: string; accepted: boolean; relayUrl: string | null } | null = null;
  private linkProblem: string | null = null;
  private linkTimer: ReturnType<typeof setTimeout> | null = null;
  // What was last shared, and by whom, so an unchanged flock isn't sent again.
  private sharedFlock: string | null = null;
  // What was last sent of each routine, by key, and for which account. Its first time isn't part of it, as the server
  // owns when it's due. `reconciled` is the set of keys last checked against the server's, null until that's worked.
  private sharedRoutines: { account: string; rows: Map<string, string>; reconciled: string | null } | null = null;
  private routinesSending: Promise<void> | null = null;
  // Routines that may be in the cloud, by key: sent there, and not yet known to be gone. Saved, so one turned off before
  // a restart stays held back here until the server confirms it's gone.
  private readonly routinesThere = new Set<string>();
  // Routines whose last send failed.
  private readonly routinesFailed = new Set<string>();
  private routinesAgain = false;
  private flockSending: Promise<void> | null = null;
  private flockAgain = false;

  constructor(
    private readonly server: GalleryServer | null,
    private readonly account: Pick<Account, "state" | "accessToken">,
    private readonly file: string,
    private readonly hooks: RunnerJobsHooks,
    private readonly pollMs = POLL_MS
  ) {
    this.seenAccount = this.signedIn;
    this.load();
    this.schedule();
    this.discoverTimer = setInterval(() => void this.discover(), DISCOVER_MS);
    this.discoverTimer.unref?.();
    void this.refreshLink();
  }

  private get signedIn(): string | null {
    const { status, email } = this.account.state;
    return status === "signed-in" ? email : null;
  }

  // An entry only counts while the account that sent it is signed in. Anyone else's waits, untouched, until it is again.
  private mine(entry: Entry | undefined): entry is Entry {
    return !!entry && entry.account === this.signedIn;
  }

  // Only with a runner that has accepted the link, so a job never waits in a queue nobody takes from.
  available(): boolean {
    return this.server !== null && this.signedIn !== null && this.link?.accepted === true;
  }

  get runnerState(): RunnerState {
    if (!this.server) return { status: "not-set-up", email: null, problem: null, relayUrl: null };
    if (!this.signedIn) return { status: "signed-out", email: null, problem: null, relayUrl: null };
    if (!this.link) return { status: "none", email: null, problem: this.linkProblem, relayUrl: null };
    const linked = this.link.accepted;
    return { status: linked ? "linked" : "waiting", email: this.link.email, problem: this.linkProblem, relayUrl: linked ? this.link.relayUrl : null };
  }

  // Asks the server who the runner is, and again now and then while someone's signed in.
  async refreshLink(): Promise<RunnerState> {
    if (this.linkTimer) clearTimeout(this.linkTimer);
    this.linkTimer = null;
    const account = this.signedIn;
    if (!account) this.link = null;
    else {
      const link = await this.withToken(account, (token) => this.server!.myCloudRunner(token).then((found) => ({ found })));
      if (link && this.signedIn === account) this.link = link.found;
      // No runner has accepted, so nothing in the cloud can run a routine, and none needs holding back here.
      if (link && this.signedIn === account && !link.found?.accepted && this.routinesThere.size > 0) {
        this.routinesThere.clear();
        this.save();
        this.hooks.routinesSettled?.();
      }
    }
    if (this.link) this.linkTimer = setTimeout(() => void this.refreshLink(), this.link.accepted ? LINKED_POLL_MS : LINK_POLL_MS);
    this.hooks.runnerUpdated?.(this.runnerState);
    void this.flockChanged();
    void this.routinesChanged();
    void this.discover();
    return this.runnerState;
  }

  async linkRunner(email: unknown): Promise<RunnerState> {
    const account = this.signedIn;
    const address = typeof email === "string" ? email.trim() : "";
    this.linkProblem = null;
    if (!account || !address || address.length > 320 || !address.includes("@")) {
      this.linkProblem = NO_SUCH_RUNNER;
      return this.refreshLink();
    }
    const linked = await this.withToken(account, (token) => this.server!.linkCloudRunner(token, address));
    if (linked !== true) this.linkProblem = linked === false ? NO_SUCH_RUNNER : LINK_FAILED;
    return this.refreshLink();
  }

  async unlinkRunner(): Promise<RunnerState> {
    const account = this.signedIn;
    this.linkProblem = null;
    if (account) await this.withToken(account, (token) => this.server!.unlinkCloudRunner(token));
    return this.refreshLink();
  }

  // Shares the flock with the phone page, only while signed in with a runner that has accepted, and only if it changed.
  // A bird's name, look, instructions and limits go, and nothing it remembers. One send at a time, and a change that
  // comes in meanwhile is sent after it, so an older flock never lands after a newer one.
  // Keeps the routines that run in the cloud there, one call per routine that changed or went, one round at a time.
  async routinesChanged(): Promise<void> {
    if (this.routinesSending) {
      this.routinesAgain = true;
      return this.routinesSending;
    }
    this.routinesSending = (async () => {
      do {
        this.routinesAgain = false;
        await this.shareRoutines();
      } while (this.routinesAgain);
    })().finally(() => {
      this.routinesSending = null;
    });
    return this.routinesSending;
  }

  private async shareRoutines(): Promise<void> {
    const account = this.signedIn;
    if (!account || !this.link?.accepted || !this.hooks.routines) return;
    if (this.sharedRoutines?.account !== account) this.sharedRoutines = { account, rows: new Map(), reconciled: null };
    const shared = this.sharedRoutines;
    const rows = this.hooks.routines();
    const before = JSON.stringify([[...this.routinesThere].sort(), [...this.routinesFailed].sort()]);
    for (const row of rows) {
      const shape = JSON.stringify({ ...row, firstRunAt: null });
      if (shared.rows.get(row.key) === shape) continue;
      // Tried again on the next change or the next look at the link.
      if (await this.withToken(account, (token) => this.server!.syncCloudRoutine(token, row).then(() => true))) {
        shared.rows.set(row.key, shape);
        this.routinesThere.add(row.key);
        this.routinesFailed.delete(row.key);
      } else this.routinesFailed.add(row.key);
    }
    await this.reconcileRoutines(account, shared, rows);
    [...this.routinesFailed].filter((key) => !rows.some((row) => row.key === key)).forEach((key) => this.routinesFailed.delete(key));
    if (JSON.stringify([[...this.routinesThere].sort(), [...this.routinesFailed].sort()]) !== before) {
      this.save();
      this.hooks.routinesSettled?.();
    }
  }

  private async reconcileRoutines(account: string, shared: NonNullable<RunnerJobs["sharedRoutines"]>, rows: CloudRoutineRow[]): Promise<void> {
    // Anything there that this no longer has goes, checked against the server's own keys, so one deleted or turned off
    // while it couldn't be reached, or before a restart, still goes. Only when the keys here change, or until it's worked.
    const keys = rows.map(({ key }) => key);
    const local = JSON.stringify([...keys].sort());
    if (shared.reconciled === local) return;
    const there = await this.withToken(account, (token) => this.server!.myCloudRoutineKeys(token));
    if (!there) return;
    // Whatever the server doesn't have is known to be gone.
    [...this.routinesThere].filter((key) => !there.includes(key)).forEach((key) => this.routinesThere.delete(key));
    there.forEach((key) => this.routinesThere.add(key));
    let gone = true;
    for (const key of there.filter((key) => !keys.includes(key))) {
      const forgotten = await this.withToken(account, (token) => this.server!.forgetCloudRoutine(token, key).then(() => true));
      if (forgotten) {
        shared.rows.delete(key);
        this.routinesThere.delete(key);
      } else gone = false;
    }
    if (gone) shared.reconciled = local;
  }

  // A routine that may still be in the cloud, where it could run. One turned off stays so until the server says it's gone.
  stillInCloud(key: string): boolean {
    return this.routinesThere.has(key);
  }

  cloudFailed(key: string): boolean {
    return this.routinesFailed.has(key);
  }

  async flockChanged(): Promise<void> {
    if (this.flockSending) {
      this.flockAgain = true;
      return this.flockSending;
    }
    this.flockSending = (async () => {
      do {
        this.flockAgain = false;
        await this.shareFlock();
      } while (this.flockAgain);
    })().finally(() => {
      this.flockSending = null;
    });
    return this.flockSending;
  }

  private async shareFlock(): Promise<void> {
    const account = this.signedIn;
    if (!account || !this.link?.accepted || !this.hooks.flock) return;
    const birds = flockRows(this.hooks.flock());
    const shared = JSON.stringify([account, birds]);
    if (shared === this.sharedFlock) return;
    this.sharedFlock = shared;
    const sent = await this.withToken(account, (token) => this.server!.syncCloudFlock(token, birds).then(() => true));
    // Tried again on the next change or the next look at the link.
    if (!sent && this.sharedFlock === shared) this.sharedFlock = null;
  }

  has(chatId: string): boolean {
    return this.entries.has(chatId);
  }

  active(): string[] {
    return [...this.entries].filter(([, entry]) => entry.active && this.mine(entry)).map(([chatId]) => chatId);
  }

  progress(chatId: string): RunnerProgress | null {
    const entry = this.entries.get(chatId);
    return this.mine(entry) && entry.active ? { reply: entry.reply, steps: entry.steps, approval: entry.approval } : null;
  }

  // For the chrome only.
  liveView(chatId: string): string | null {
    const entry = this.entries.get(chatId);
    return this.mine(entry) && entry.active && entry.liveView && isLiveView(entry.liveView) ? entry.liveView : null;
  }

  async start(chatId: string, { prompt, earlier, mascot, actionApproval }: RunnerJobInput): Promise<string | null> {
    if (!this.server) return NOT_SET_UP;
    const account = this.signedIn;
    if (!account) return SIGN_IN;
    const earlierEntry = this.entries.get(chatId);
    if (earlierEntry && earlierEntry.account !== account) return OTHER_ACCOUNT(earlierEntry.account);
    // It shows as going at once, while it's sent, in the same conversation as the chat's earlier jobs.
    const entry = fresh(account, earlierEntry?.conversationId ?? randomUUID(), earlierEntry?.jobIds ?? [], null, true);
    this.entries.set(chatId, entry);
    const fail = (problem: string) => {
      entry.active = false;
      this.save();
      return problem;
    };
    try {
      const token = await this.tokenFor(account);
      if (token === "switched") return fail(SWITCHED);
      if (!token) return fail(SIGN_IN);
      // Built on the newest job this chat has, which the server checks is the conversation's newest.
      const server = this.server;
      const send = () =>
        server.startCloudJob(token, {
          prompt,
          history: historyFromRow(earlier()),
          mascot: mascotSnapshot(mascot),
          actionApproval,
          contextId: this.hooks.contextId(),
          conversationId: entry.conversationId,
          afterJobId: entry.jobIds.at(-1) ?? null,
        });
      let jobId: string | null;
      try {
        jobId = await send();
      } catch (error) {
        // The conversation went on elsewhere since this chat last looked. That's brought in first, so this message comes
        // after it and carries it, and it's sent once more.
        if (!(error instanceof ServerError && error.status === 409) || !(await this.catchUp(account, chatId, entry))) throw error;
        jobId = await send();
      }
      if (!jobId) return fail(NOT_TAKEN);
      entry.jobId = jobId;
      entry.jobIds.push(jobId);
      if (entry.cancel === "forget") {
        void this.server.forgetCloudConversation(token, entry.conversationId).catch(() => console.error("Couldn't remove a job from the runner."));
        return null;
      }
      if (entry.cancel === "stop") void this.server.stopCloudJob(token, jobId).catch(() => console.error("Couldn't stop a job on the runner."));
    } catch (error) {
      // Another job of this conversation is going, sent from elsewhere, which the next look brings here.
      if (error instanceof ServerError && error.status === 409) {
        void this.discover();
        return fail(BUSY);
      }
      if (!(error instanceof ServerError && error.status === 400)) return fail(NOT_TAKEN);
      // Refused as too many, or because the runner was unlinked elsewhere. The link says which.
      await this.refreshLink();
      return fail(this.link?.accepted ? TOO_MANY : NO_RUNNER);
    }
    this.save();
    this.schedule();
    return null;
  }

  decide(chatId: string, approvalId: string, allow: boolean, answer?: string): boolean {
    const entry = this.entries.get(chatId);
    if (!this.mine(entry) || !entry.active || entry.approval?.id !== approvalId) return false;
    entry.approval = null;
    this.answered.add(approvalId);
    this.hooks.changed(chatId);
    void this.withToken(entry.account, (token) => this.server!.decideCloudApproval(token, approvalId, allow, answer ?? null)).then((written) => {
      // Still waiting on it, so the next look brings the card back.
      if (!written) this.answered.delete(approvalId);
    });
    return true;
  }

  stop(chatId: string): void {
    const entry = this.entries.get(chatId);
    const jobId = entry?.jobId;
    if (this.mine(entry) && entry.active && !jobId) entry.cancel = "stop";
    if (this.mine(entry) && jobId) void this.withToken(entry.account, (token) => this.server!.stopCloudJob(token, jobId));
  }

  // Deletes every job of the chat's conversation, wherever it was sent from.
  forget(chatId: string): void {
    const entry = this.entries.get(chatId);
    if (!entry) return;
    const ours = this.mine(entry);
    if (ours && entry.active && !entry.jobId) entry.cancel = "forget";
    this.entries.delete(chatId);
    this.forgotten.push(entry.conversationId);
    this.forgotten.splice(0, Math.max(0, this.forgotten.length - MAX_FORGOTTEN));
    this.save();
    if (ours && entry.jobIds.length > 0) void this.withToken(entry.account, (token) => this.server!.forgetCloudConversation(token, entry.conversationId));
  }

  // Signed in or out. Jobs carry on there either way. Nothing the last account saw stays here, not a card, a step or a
  // live view, and each comes back once its own account is signed in again.
  accountChanged(): void {
    const now = this.signedIn;
    if (now !== this.seenAccount) {
      this.seenAccount = now;
      this.answered.clear();
      this.entries.forEach((entry, chatId) => {
        Object.assign(entry, { steps: [], reply: "", error: null, liveView: null, approval: null });
        if (entry.active) this.hooks.changed(chatId);
      });
      this.link = null;
      this.linkProblem = null;
      void this.refreshLink();
    }
    this.schedule();
  }

  destroy(): void {
    clearInterval(this.discoverTimer);
    if (this.timer) clearTimeout(this.timer);
    if (this.linkTimer) clearTimeout(this.linkTimer);
    this.timer = null;
    this.linkTimer = null;
  }

  // A token for that account only. A refresh can end after someone else signs in and hand back their token, so who is
  // signed in is checked again once it's here, and nothing is sent with it otherwise.
  private async tokenFor(account: string): Promise<string | null | "switched"> {
    const token = await this.account.accessToken();
    return this.signedIn === account ? token : "switched";
  }

  private async withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    if (!this.server) return null;
    try {
      const token = await this.tokenFor(account);
      return token && token !== "switched" ? await call(token) : null;
    } catch {
      console.error("Couldn't reach the runner's jobs.");
      return null;
    }
  }

  private schedule(): void {
    if (this.timer || !this.server) return;
    if (![...this.entries.values()].some((entry) => entry.active && entry.jobId && this.mine(entry))) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll().finally(() => this.schedule());
    }, this.pollMs);
  }

  private async poll(): Promise<void> {
    const account = this.signedIn;
    if (this.polling || !account) return;
    const going = [...this.entries].filter(([, entry]) => entry.active && entry.jobId && entry.account === account);
    if (going.length === 0) return;
    this.polling = true;
    try {
      const rows = await this.withToken(account, (token) => this.server!.cloudJobs(token, going.map(([, entry]) => entry.jobId!)));
      // Someone else signed in while it was asking, so none of this is theirs.
      if (rows && this.signedIn === account) going.forEach(([chatId, entry]) => this.read(chatId, entry, rows.find((row) => row.id === entry.jobId)));
    } finally {
      this.polling = false;
    }
  }

  private read(chatId: string, entry: Entry, row: Record<string, unknown> | undefined): void {
    // Asked as the account that sent it, so it was deleted.
    if (!row) return this.finish(chatId, entry, GONE);
    const status = typeof row.status === "string" ? (row.status as CloudJobStatus) : entry.status;
    const approval = approvalFromRow(row);
    const next: Omit<Entry, "account" | "conversationId" | "jobIds" | "jobId" | "cancel" | "active"> = {
      status,
      steps: stepsFromRow(row.steps),
      reply: typeof row.reply === "string" ? row.reply : "",
      error: typeof row.error === "string" ? row.error : null,
      liveView: typeof row.live_view_url === "string" ? row.live_view_url : null,
      approval: approval && !this.answered.has(approval.id) ? approval : null,
    };
    const same = JSON.stringify(next) === JSON.stringify({ status: entry.status, steps: entry.steps, reply: entry.reply, error: entry.error, liveView: entry.liveView, approval: entry.approval });
    Object.assign(entry, next);
    if (FINISHED.includes(status)) return this.finish(chatId, entry, endError(status, entry.error));
    if (!same) this.hooks.changed(chatId);
  }

  private finish(chatId: string, entry: Entry, error: string | null): void {
    entry.active = false;
    entry.approval = null;
    entry.liveView = null;
    this.save();
    this.hooks.finished(chatId, { reply: entry.reply, steps: entry.steps, error });
  }

  // Looks for conversations on the account that this computer didn't send, or that went on elsewhere: a job from the phone
  // becomes a runner chat here, and a follow-up from there joins the chat it follows. Only while a linked runner has
  // accepted, as the signed-in account, and never for a chat with a job going or being sent from here.
  async discover(): Promise<void> {
    const account = this.signedIn;
    if (this.discovering || !account || !this.available()) return;
    this.discovering = true;
    try {
      const listed = await this.withToken(account, (token) => this.server!.cloudConversationJobs(token));
      if (!listed) return;
      const conversations = new Map<string, string[]>();
      listed.forEach(({ id, conversation_id: conversationId }) => conversations.set(conversationId, [...(conversations.get(conversationId) ?? []), id]));
      for (const [conversationId, jobIds] of conversations) {
        if (this.signedIn !== account) return;
        const known = this.chatOf(account, conversationId)?.[1];
        if (this.forgotten.includes(conversationId) || known?.active || (known && jobIds.every((id) => known.jobIds.includes(id)))) continue;
        const rows = await this.withToken(account, (token) => this.server!.cloudConversation(token, conversationId));
        if (rows && this.signedIn === account) this.take(account, conversationId, rows);
      }
    } finally {
      this.discovering = false;
    }
  }

  private chatOf(account: string, conversationId: string): [string, Entry] | undefined {
    return [...this.entries].find(([, entry]) => entry.account === account && entry.conversationId === conversationId);
  }

  // A conversation's jobs, oldest first, as the server has them now. What's new to this computer is saved as the chat
  // would have saved it, and a job still going is followed like one sent from here.
  private take(account: string, conversationId: string, rows: Record<string, unknown>[]): void {
    let found = this.chatOf(account, conversationId);
    // Checked again, since a message may have been sent from here while it asked.
    if (this.forgotten.includes(conversationId) || found?.[1].active) return;
    const fresher = newJobs(rows, found?.[1].jobIds ?? []);
    if (fresher.length === 0) return;
    if (!found) {
      const mascotId = (fresher[0].mascot as { id?: unknown } | null)?.id;
      const chatId = this.hooks.adopt?.({ prompt: fresher[0].prompt, mascotId: typeof mascotId === "string" ? mascotId : null });
      if (!chatId) return;
      found = [chatId, fresh(account, conversationId, [], null, false)];
      this.entries.set(...found);
    }
    this.apply(...found, fresher);
  }

  // While a message from here is being sent: brings in what was sent in the chat's conversation elsewhere since its newest
  // job here. False if a job there is still going, so this one can't go yet, or it couldn't be read.
  private async catchUp(account: string, chatId: string, entry: Entry): Promise<boolean> {
    const rows = await this.withToken(account, (token) => this.server!.cloudConversation(token, entry.conversationId));
    if (!rows || this.signedIn !== account || this.entries.get(chatId) !== entry) return false;
    const fresher = newJobs(rows, entry.jobIds);
    if (fresher.length === 0 || fresher.some((row) => !FINISHED.includes(row.status as CloudJobStatus))) return false;
    this.apply(chatId, entry, fresher);
    return true;
  }

  // Saves jobs new to this chat in order: each one's message, then how it ended, or follows the one still going.
  private apply(chatId: string, entry: Entry, fresher: NewJob[]): void {
    for (const row of fresher) {
      entry.jobIds.push(row.id);
      this.hooks.followedUp?.(chatId, row.prompt);
      const status = (typeof row.status === "string" ? row.status : "failed") as CloudJobStatus;
      if (FINISHED.includes(status)) {
        this.hooks.finished(chatId, { reply: typeof row.reply === "string" ? row.reply : "", steps: stepsFromRow(row.steps), error: endError(status, typeof row.error === "string" ? row.error : null) });
        continue;
      }
      // Only one in a conversation goes at a time, and it's the newest.
      Object.assign(entry, { jobId: row.id, active: true, status, steps: [], reply: "", error: null, liveView: null, approval: null });
      this.hooks.changed(chatId);
      break;
    }
    this.save();
    this.schedule();
  }

  private load(): void {
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100;
      Object.entries(saved?.chats ?? {}).forEach(([chatId, value]) => {
        const { account, jobId, active, conversationId, jobIds } = (value ?? {}) as Record<string, unknown>;
        if (typeof account !== "string" || (jobId !== null && !id(jobId))) return;
        const known = Array.isArray(jobIds) ? jobIds.filter(id) : id(jobId) ? [jobId] : [];
        // A chat saved before conversations is one under its job's id, which is what the server makes of it too.
        const conversation = id(conversationId) ? conversationId : id(jobId) ? jobId : null;
        if (conversation) this.entries.set(chatId, fresh(account, conversation, known, id(jobId) ? jobId : null, id(jobId) && active === true));
      });
      if (Array.isArray(saved?.forgotten)) this.forgotten.push(...saved.forgotten.filter(id).slice(-MAX_FORGOTTEN));
      if (Array.isArray(saved?.routinesInCloud)) saved.routinesInCloud.filter(id).slice(0, 100).forEach((key: string) => this.routinesThere.add(key));
    } catch {
      // Nothing sent there yet.
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const chats = Object.fromEntries(
        [...this.entries].filter(([, entry]) => entry.jobIds.length > 0).map(([chatId, { account, conversationId, jobIds, jobId, active }]) => [chatId, { account, conversationId, jobIds, jobId, active: active && !!jobId }])
      );
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ chats, forgotten: this.forgotten, routinesInCloud: [...this.routinesThere] }));
      renameSync(temp, this.file);
    } catch {
      console.error("Couldn't save which chats are on the runner.");
    }
  }
}
