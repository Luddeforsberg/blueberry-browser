import type { Account } from "./Account";
import { stepsFromRow } from "./cloudJobs";
import type { GalleryServer } from "./galleryServer";
import type { ChatStep } from "../shared/library";
import { BERRY } from "../shared/mascots";

// Jobs from ChatGPT or Claude, through the relay, that run here in the user's own Blueberry rather than in the cloud.
// Only while Settings > Cloud allows it, signed in with an accepted runner: then this says every half a minute that the
// Mac is there, and takes the account's jobs for the Mac one at a time, as the signed-in owner. Each runs as an MCP job
// does, through `Chats.send` with no page and a `from`, so every limit, approval and handoff is the chat's, and its
// approvals stay here: nothing is written back but status, step notes and the reply. A Stop from the relay stops it.

const POLL_MS = 3_000;
const PRESENCE_MS = 30_000;
const FINAL_TRIES = 5;
const MAX_REPLY = 40_000;
const MAX_ERROR = 500;

// What the chat says it came from.
export const RELAY_FROM = "ChatGPT or Claude";

const NO_BIRD = "That bird isn't in Blueberry on the Mac, so the job didn't start.";
const SWITCHED_OFF = "Jobs from ChatGPT and Claude were turned off on the Mac, so it stopped there.";
const DELETED = "The chat was deleted on the Mac, so the job stopped there.";

// A chat's latest reply, as the job's row takes it.
export interface MacRun {
  running: boolean;
  // An approval, question or handoff is waiting on the user here.
  waiting: boolean;
  reply: string;
  steps: ChatStep[];
  outcome: "done" | "failed" | "stopped" | null;
  error: string | null;
}

export interface MacJobsHost {
  // The switch in Settings.
  enabled: () => boolean;
  // Signed in with a runner that has accepted, which the relay needs.
  linked: () => boolean;
  // Says the chat's id, or null if it couldn't start, such as for a bird that isn't in the flock.
  start: (prompt: string, options: { mascotId: string | null; sites: string[]; from: string }) => string | null;
  // Null once the chat is gone.
  run: (chatId: string) => MacRun | null;
  stop: (chatId: string) => void;
}

interface Current {
  account: string;
  jobId: string;
  chatId: string;
  stopped: boolean;
  // Why, when it was stopped by something here rather than by the user or the relay.
  why: string | null;
  finalTries: number;
}

type Update = { status?: string; steps?: ChatStep[]; reply?: string; error?: string };

export class MacJobs {
  private current: Current | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking: Promise<void> | null = null;
  // The account this Mac last said it's there for, and when.
  private reporting: string | null = null;
  private reportedAt = 0;

  constructor(
    private readonly server: GalleryServer | null,
    private readonly account: Pick<Account, "state" | "accessToken">,
    private readonly host: MacJobsHost,
    private readonly pollMs = POLL_MS,
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    if (this.timer || !this.server) return;
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
    void this.tick();
  }

  // The switch, the account or the link changed, so it doesn't wait for the next round.
  sync(): void {
    void this.tick();
  }

  // The app is quitting. What it was running ends with it, and the server is told, as far as there's time.
  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const account = this.reporting;
    this.reporting = null;
    if (account) void this.withToken(account, (token) => this.server!.macPresence(token, false));
  }

  // Which job it's running, for tests and the chat.
  get running(): { jobId: string; chatId: string } | null {
    return this.current && { jobId: this.current.jobId, chatId: this.current.chatId };
  }

  tick(): Promise<void> {
    this.ticking ??= this.round().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private get signedIn(): string | null {
    const { status, email } = this.account.state;
    return status === "signed-in" ? email : null;
  }

  private async round(): Promise<void> {
    const account = this.signedIn;
    const wanted = !!this.server && account !== null && this.host.enabled() && this.host.linked();
    if (wanted) {
      if (this.reporting !== account || this.now() - this.reportedAt >= PRESENCE_MS) {
        const told = await this.withToken(account, (token) => this.server!.macPresence(token, true).then(() => true));
        if (told) {
          this.reporting = account;
          this.reportedAt = this.now();
        }
      }
    } else if (this.reporting !== null) {
      // Turned off, or unlinked. Signed out, there's no one to tell, and it stops counting within a minute.
      if (this.reporting === account) await this.withToken(account, (token) => this.server!.macPresence(token, false));
      this.reporting = null;
    }
    if (this.current) await this.follow(wanted);
    if (!this.current && wanted && this.reporting === account) await this.claim(account);
  }

  private async claim(account: string): Promise<void> {
    const row = await this.withToken(account, (token) => this.server!.macClaimJob(token));
    if (!row || this.signedIn !== account) return;
    const jobId = String(row.id);
    const mascot = (row.mascot && typeof row.mascot === "object" ? row.mascot : {}) as { id?: unknown; sites?: unknown };
    const mascotId = typeof mascot.id === "string" && mascot.id !== BERRY.id ? mascot.id : null;
    // The relay narrowed them already, and here they only narrow the bird's own again.
    const sites = Array.isArray(mascot.sites) ? mascot.sites.filter((site): site is string => typeof site === "string") : [];
    const chatId = this.host.start(String(row.prompt), { mascotId, sites, from: RELAY_FROM });
    if (!chatId) {
      await this.withToken(account, (token) => this.server!.macUpdateJob(token, jobId, { status: "failed", error: NO_BIRD }));
      return;
    }
    console.log(`Mac job ${jobId}: started.`);
    this.current = { account, jobId, chatId, stopped: false, why: null, finalTries: 0 };
  }

  private async follow(wanted: boolean): Promise<void> {
    const job = this.current!;
    // Someone else signed in: it can't be written as them, so it stops here and times out there.
    if (job.account !== this.signedIn) {
      this.host.stop(job.chatId);
      this.current = null;
      return;
    }
    if (!wanted && !job.stopped) {
      Object.assign(job, { stopped: true, why: SWITCHED_OFF });
      this.host.stop(job.chatId);
    }
    const run = this.host.run(job.chatId);
    if (!run) return this.end(job, { status: "stopped", error: DELETED });
    const steps = stepsFromRow(run.steps);
    const reply = run.reply.slice(0, MAX_REPLY);
    if (run.running) {
      const stop = await this.write(job, { status: run.waiting ? "waiting" : "running", steps, reply });
      if (stop === true && !job.stopped) {
        job.stopped = true;
        this.host.stop(job.chatId);
      }
      return;
    }
    const status = run.outcome ?? (run.error ? "failed" : "done");
    const error = (status === "stopped" ? job.why : run.error)?.slice(0, MAX_ERROR);
    return this.end(job, { status, steps, reply, ...(error ? { error } : {}) });
  }

  // How it ended, tried a few rounds before it's left to time out there.
  private async end(job: Current, update: Update): Promise<void> {
    const written = await this.write(job, update);
    if (written === null && ++job.finalTries < FINAL_TRIES) return;
    console.log(`Mac job ${job.jobId}: ${update.status}.`);
    this.current = null;
  }

  private write(job: Current, update: Update): Promise<boolean | null> {
    return this.withToken(job.account, (token) => this.server!.macUpdateJob(token, job.jobId, update));
  }

  // A token for that account only, checked again once it's here, as in `RunnerJobs`.
  private async withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    if (!this.server) return null;
    try {
      const token = await this.account.accessToken();
      return token && this.signedIn === account ? await call(token) : null;
    } catch {
      console.error("Couldn't reach the jobs for this Mac.");
      return null;
    }
  }
}
