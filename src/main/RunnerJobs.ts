import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Account } from "./Account";
import { isLiveView } from "./browserbase";
import type { ChatRunner, RunnerJobInput, RunnerProgress } from "./Chats";
import { approvalFromRow, FINISHED, historyFromRow, mascotSnapshot, stepsFromRow, type CloudJobStatus } from "./cloudJobs";
import { ServerError, type GalleryServer } from "./galleryServer";
import type { RunnerState } from "../shared/ipc";
import type { ChatStep, MascotProfile } from "../shared/library";
import { flockRows } from "../shared/phone";

// Chats whose jobs went to the cloud runner, which keeps going with this computer off. The jobs, their steps and their
// approvals are rows in Supabase, read as the signed-in user, so nobody else's can come back. Only the user's own answer
// from this window is written back, through `decide_cloud_approval`: the runner can't write one, and neither can the phone
// or an app here. Which chat is which job is kept in a file of ids. The live view address goes to the chrome and nowhere else.

const POLL_MS = 2_000;

const NOT_SET_UP = "This copy of Blueberry has no account server, so it can't send jobs to the runner.";
const SIGN_IN = "Sign in to your Blueberry account in Settings to send jobs to the runner.";
const NOT_TAKEN = "The runner's queue didn't take the job. Try again in a moment.";
const TOO_MANY = "Five jobs are already waiting or going on the runner. Try again when one is done.";
const FAILED = "The job failed on the runner.";
const GONE = "This job isn't on your account any more.";
const NO_SUCH_RUNNER = "There's no Blueberry account with that email that can be your runner. Create it in Supabase first, and don't use your own.";
const LINK_FAILED = "The runner couldn't be linked. Try again in a moment.";
// The link is looked up again this often while the runner hasn't accepted, and less often once it has, in case it's
// been unlinked elsewhere. Opening the composer looks too.
const LINK_POLL_MS = 10_000;
const LINKED_POLL_MS = 5 * 60_000;
const NO_RUNNER = "Your runner isn't linked any more, so this wasn't sent. Link it again in Settings > Cloud.";
const SWITCHED = "You signed in to another account while this was being sent, so it wasn't sent. Send it again.";
const OTHER_ACCOUNT = (email: string) => `This chat's jobs are on ${email}. Sign in to that account to go on with it.`;

interface Entry {
  // The account that sent it, by email. Only that account, signed in, sees anything of it.
  account: string;
  // Null while it's being sent.
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
}

const fresh = (account: string, jobId: string | null, active: boolean): Entry => ({ account, jobId, cancel: null, active, status: "queued", steps: [], reply: "", error: null, liveView: null, approval: null });

export class RunnerJobs implements ChatRunner {
  private readonly entries = new Map<string, Entry>();
  // Answered here and on its way, so a poll that crosses it doesn't bring the card back.
  private readonly answered = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  // Who was signed in when the account last changed, so a change clears what the last one saw.
  private seenAccount: string | null;
  // The runner linked to the signed-in account, as the server last said, and why linking last failed.
  private link: { email: string; accepted: boolean } | null = null;
  private linkProblem: string | null = null;
  private linkTimer: ReturnType<typeof setTimeout> | null = null;
  // What was last shared, and by whom, so an unchanged flock isn't sent again.
  private sharedFlock: string | null = null;

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
    if (!this.server) return { status: "not-set-up", email: null, problem: null };
    if (!this.signedIn) return { status: "signed-out", email: null, problem: null };
    if (!this.link) return { status: "none", email: null, problem: this.linkProblem };
    return { status: this.link.accepted ? "linked" : "waiting", email: this.link.email, problem: this.linkProblem };
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
    }
    if (this.link) this.linkTimer = setTimeout(() => void this.refreshLink(), this.link.accepted ? LINKED_POLL_MS : LINK_POLL_MS);
    this.hooks.runnerUpdated?.(this.runnerState);
    void this.flockChanged();
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
  // A bird's name, look, instructions and limits go, and nothing it remembers.
  async flockChanged(): Promise<void> {
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
    // It shows as going at once, while it's sent.
    const entry = fresh(account, null, true);
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
      const jobId = await this.server.startCloudJob(token, {
        prompt,
        history: historyFromRow(earlier),
        mascot: mascotSnapshot(mascot),
        actionApproval,
        contextId: this.hooks.contextId(),
      });
      if (!jobId) return fail(NOT_TAKEN);
      entry.jobId = jobId;
      if (entry.cancel === "forget") {
        void this.server.forgetCloudJob(token, jobId).catch(() => console.error("Couldn't remove a job from the runner."));
        return null;
      }
      if (entry.cancel === "stop") void this.server.stopCloudJob(token, jobId).catch(() => console.error("Couldn't stop a job on the runner."));
    } catch (error) {
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

  forget(chatId: string): void {
    const entry = this.entries.get(chatId);
    const jobId = entry?.jobId;
    const ours = this.mine(entry);
    if (ours && entry.active && !jobId) entry.cancel = "forget";
    this.entries.delete(chatId);
    this.save();
    if (ours && jobId) void this.withToken(entry.account, (token) => this.server!.forgetCloudJob(token, jobId));
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
    const next: Omit<Entry, "account" | "jobId" | "cancel" | "active"> = {
      status,
      steps: stepsFromRow(row.steps),
      reply: typeof row.reply === "string" ? row.reply : "",
      error: typeof row.error === "string" ? row.error : null,
      liveView: typeof row.live_view_url === "string" ? row.live_view_url : null,
      approval: approval && !this.answered.has(approval.id) ? approval : null,
    };
    const same = JSON.stringify(next) === JSON.stringify({ status: entry.status, steps: entry.steps, reply: entry.reply, error: entry.error, liveView: entry.liveView, approval: entry.approval });
    Object.assign(entry, next);
    if (FINISHED.includes(status)) return this.finish(chatId, entry, status === "failed" ? (entry.error ?? FAILED) : status === "stopped" ? entry.error : null);
    if (!same) this.hooks.changed(chatId);
  }

  private finish(chatId: string, entry: Entry, error: string | null): void {
    entry.active = false;
    entry.approval = null;
    entry.liveView = null;
    this.save();
    this.hooks.finished(chatId, { reply: entry.reply, steps: entry.steps, error });
  }

  private load(): void {
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      Object.entries(saved?.chats ?? {}).forEach(([chatId, value]) => {
        const { account, jobId, active } = (value ?? {}) as Record<string, unknown>;
        if (typeof account === "string" && typeof jobId === "string" && jobId.length <= 100) this.entries.set(chatId, fresh(account, jobId, active === true));
      });
    } catch {
      // Nothing sent there yet.
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const chats = Object.fromEntries([...this.entries].filter(([, entry]) => entry.jobId).map(([chatId, { account, jobId, active }]) => [chatId, { account, jobId, active }]));
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ chats }));
      renameSync(temp, this.file);
    } catch {
      console.error("Couldn't save which chats are on the runner.");
    }
  }
}
