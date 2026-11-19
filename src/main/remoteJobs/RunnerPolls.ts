import { approvalFromRow, FINISHED, stepsFromRow, type CloudJobStatus } from "./cloudJobs";
import { endError, type Entry, type RunnerParts } from "./runnerTypes";

const GONE = "This job isn't on your account any more.";

// Follows the jobs going in the cloud, every few seconds and as the account that sent them, until each has ended.
export class RunnerPolls {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  private readonly server: RunnerParts["server"];
  private readonly hooks: RunnerParts["hooks"];
  private readonly entries: RunnerParts["entries"];
  private readonly answered: RunnerParts["answered"];
  private readonly pollMs: number;
  private readonly parts: Pick<RunnerParts, "signedIn" | "mine" | "destroyed" | "withToken" | "save">;

  constructor(
    parts: Pick<
      RunnerParts,
      "server" | "hooks" | "entries" | "answered" | "pollMs" | "signedIn" | "mine" | "destroyed" | "withToken" | "save"
    >,
  ) {
    this.server = parts.server;
    this.hooks = parts.hooks;
    this.entries = parts.entries;
    this.answered = parts.answered;
    this.pollMs = parts.pollMs;
    this.parts = parts;
  }

  private get signedIn(): string | null {
    return this.parts.signedIn();
  }

  private mine(entry: Entry | undefined): entry is Entry {
    return this.parts.mine(entry);
  }

  private get destroyed(): boolean {
    return this.parts.destroyed();
  }

  private withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    return this.parts.withToken(account, call);
  }

  private save(): void {
    this.parts.save();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(): void {
    if (this.destroyed || this.timer || !this.server) return;
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
      const rows = await this.withToken(account, (token) =>
        this.server!.cloudJobs(
          token,
          going.map(([, entry]) => entry.jobId!),
        ),
      );
      // Someone else signed in while it was asking, so none of this is theirs.
      if (rows && this.signedIn === account)
        going.forEach(([chatId, entry]) =>
          this.read(
            chatId,
            entry,
            rows.find((row) => row.id === entry.jobId),
          ),
        );
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
    const same =
      JSON.stringify(next) ===
      JSON.stringify({
        status: entry.status,
        steps: entry.steps,
        reply: entry.reply,
        error: entry.error,
        liveView: entry.liveView,
        approval: entry.approval,
      });
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
}
