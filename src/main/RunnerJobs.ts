import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Account } from "./Account";
import { isLiveView } from "./browserbase";
import type { ChatRunner, RunnerJobInput, RunnerProgress } from "./Chats";
import { approvalFromRow, FINISHED, historyFromRow, mascotSnapshot, stepsFromRow, type CloudJobStatus } from "./cloudJobs";
import { ServerError, type GalleryServer } from "./galleryServer";
import type { ChatStep } from "../shared/library";

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

interface Entry {
  // Null while it's being sent.
  jobId: string | null;
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
}

const fresh = (jobId: string | null, active: boolean): Entry => ({ jobId, active, status: "queued", steps: [], reply: "", error: null, liveView: null, approval: null });

export class RunnerJobs implements ChatRunner {
  private readonly entries = new Map<string, Entry>();
  // Answered here and on its way, so a poll that crosses it doesn't bring the card back.
  private readonly answered = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  constructor(
    private readonly server: GalleryServer | null,
    private readonly account: Pick<Account, "state" | "accessToken">,
    private readonly file: string,
    private readonly hooks: RunnerJobsHooks,
    private readonly pollMs = POLL_MS
  ) {
    this.load();
    this.schedule();
  }

  available(): boolean {
    return this.server !== null && this.account.state.status === "signed-in";
  }

  has(chatId: string): boolean {
    return this.entries.has(chatId);
  }

  active(): string[] {
    return [...this.entries].filter(([, entry]) => entry.active).map(([chatId]) => chatId);
  }

  progress(chatId: string): RunnerProgress | null {
    const entry = this.entries.get(chatId);
    return entry?.active ? { reply: entry.reply, steps: entry.steps, approval: entry.approval } : null;
  }

  // For the chrome only.
  liveView(chatId: string): string | null {
    const entry = this.entries.get(chatId);
    return entry?.active && entry.liveView && isLiveView(entry.liveView) ? entry.liveView : null;
  }

  async start(chatId: string, { prompt, earlier, mascot, actionApproval }: RunnerJobInput): Promise<string | null> {
    if (!this.server) return NOT_SET_UP;
    // It shows as going at once, while it's sent.
    const entry = fresh(null, true);
    this.entries.set(chatId, entry);
    const fail = (problem: string) => {
      entry.active = false;
      this.save();
      return problem;
    };
    try {
      const token = await this.account.accessToken();
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
    } catch (error) {
      return fail(error instanceof ServerError && error.status === 400 ? TOO_MANY : NOT_TAKEN);
    }
    this.save();
    this.schedule();
    return null;
  }

  decide(chatId: string, approvalId: string, allow: boolean, answer?: string): boolean {
    const entry = this.entries.get(chatId);
    if (!entry?.active || entry.approval?.id !== approvalId) return false;
    entry.approval = null;
    this.answered.add(approvalId);
    this.hooks.changed(chatId);
    void this.withToken((token) => this.server!.decideCloudApproval(token, approvalId, allow, answer ?? null)).then((written) => {
      // Still waiting on it, so the next look brings the card back.
      if (!written) this.answered.delete(approvalId);
    });
    return true;
  }

  stop(chatId: string): void {
    const jobId = this.entries.get(chatId)?.jobId;
    if (jobId) void this.withToken((token) => this.server!.stopCloudJob(token, jobId));
  }

  forget(chatId: string): void {
    const jobId = this.entries.get(chatId)?.jobId;
    this.entries.delete(chatId);
    this.save();
    if (jobId) void this.withToken((token) => this.server!.forgetCloudJob(token, jobId));
  }

  // Signed in or out. Jobs carry on there either way, and come back here once someone's signed in.
  accountChanged(): void {
    this.schedule();
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async withToken<T>(call: (token: string) => Promise<T>): Promise<T | null> {
    if (!this.server) return null;
    try {
      const token = await this.account.accessToken();
      return token ? await call(token) : null;
    } catch {
      console.error("Couldn't reach the runner's jobs.");
      return null;
    }
  }

  private schedule(): void {
    if (this.timer || !this.server) return;
    if (![...this.entries.values()].some(({ active, jobId }) => active && jobId)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll().finally(() => this.schedule());
    }, this.pollMs);
  }

  private async poll(): Promise<void> {
    if (this.polling || this.account.state.status !== "signed-in") return;
    const going = [...this.entries].filter(([, entry]) => entry.active && entry.jobId);
    if (going.length === 0) return;
    this.polling = true;
    try {
      const rows = await this.withToken((token) => this.server!.cloudJobs(token, going.map(([, entry]) => entry.jobId!)));
      if (rows) going.forEach(([chatId, entry]) => this.read(chatId, entry, rows.find((row) => row.id === entry.jobId)));
    } finally {
      this.polling = false;
    }
  }

  private read(chatId: string, entry: Entry, row: Record<string, unknown> | undefined): void {
    // Deleted, or another account is signed in now.
    if (!row) return this.finish(chatId, entry, GONE);
    const status = typeof row.status === "string" ? (row.status as CloudJobStatus) : entry.status;
    const approval = approvalFromRow(row);
    const next: Omit<Entry, "jobId" | "active"> = {
      status,
      steps: stepsFromRow(row.steps),
      reply: typeof row.reply === "string" ? row.reply : "",
      error: typeof row.error === "string" ? row.error : null,
      liveView: typeof row.live_view_url === "string" ? row.live_view_url : null,
      approval: approval && !this.answered.has(approval.id) ? approval : null,
    };
    const before = JSON.stringify({ ...entry, jobId: undefined, active: undefined });
    Object.assign(entry, next);
    if (FINISHED.includes(status)) return this.finish(chatId, entry, status === "failed" ? (entry.error ?? FAILED) : status === "stopped" ? entry.error : null);
    if (JSON.stringify({ ...entry, jobId: undefined, active: undefined }) !== before) this.hooks.changed(chatId);
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
        const { jobId, active } = (value ?? {}) as Record<string, unknown>;
        if (typeof jobId === "string" && jobId.length <= 100) this.entries.set(chatId, fresh(jobId, active === true));
      });
    } catch {
      // Nothing sent there yet.
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const chats = Object.fromEntries([...this.entries].filter(([, entry]) => entry.jobId).map(([chatId, { jobId, active }]) => [chatId, { jobId, active }]));
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ chats }));
      renameSync(temp, this.file);
    } catch {
      console.error("Couldn't save which chats are on the runner.");
    }
  }
}
