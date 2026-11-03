import type { Account } from "./Account";
import type { EndedReply } from "./Chats";
import { actionApprovalFromRow, fitJobUpdate, mascotFromSnapshot, stepsFromRow } from "./cloudJobs";
import type { GalleryServer } from "./galleryServer";
import type { ActionApproval } from "../shared/ipc";
import type { ChatStep, MascotProfile } from "../shared/library";

// Jobs from ChatGPT or Claude, through the relay, that run here in the user's own Blueberry rather than in the cloud.
// Only while Settings > Cloud allows it, signed in with an accepted runner: then this says every half a minute that the
// Mac is there, and takes the account's jobs for the Mac one at a time, as the signed-in owner. Each runs as an MCP job
// does, through `Chats.send` with no page and a `from`, so every limit, approval and handoff is the chat's, and its
// approvals stay here: nothing is written back but status, step notes and the reply. A Stop from the relay stops it.
// The bird in the row is checked as the runner checks it, and only narrows the one here: tools, sites and how much it
// asks. The job is that one reply, so nothing the user asks in the chat afterwards goes back to the relay.

const POLL_MS = 3_000;
const PRESENCE_MS = 30_000;
const FINAL_TRIES = 5;

// What the chat says it came from.
export const RELAY_FROM = "ChatGPT or Claude";

const NO_BIRD = "That bird isn't in Blueberry on the Mac, so the job didn't start.";
const BAD_BIRD = "This job's bird didn't pass Blueberry's checks, so it didn't start.";
const OFF_BEFORE = "Jobs from ChatGPT and Claude were turned off on the Mac before this one started.";
const QUIT_BEFORE = "Blueberry quit on the Mac before this job started.";
const SWITCHED_OFF = "Jobs from ChatGPT and Claude were turned off on the Mac, so it stopped there.";
const DELETED = "The chat was deleted on the Mac, so the job stopped there.";

export interface MacJobsHost {
  // The switch in Settings.
  enabled: () => boolean;
  // Signed in with a runner that has accepted, which the relay needs.
  linked: () => boolean;
  // Starts the reply as `bird`, which only narrows the one in the flock with the same id. Says the chat's id, or null if
  // it couldn't start, such as for a bird that isn't in the flock. `onEnd` hears how that reply ended, and no later one.
  start: (prompt: string, options: { bird: MascotProfile; askAtLeast: ActionApproval; from: string }, onEnd: (ended: EndedReply) => void) => string | null;
  // The reply so far, while it runs. Null once the chat is gone.
  progress: (chatId: string) => { reply: string; steps: ChatStep[]; waiting: boolean } | null;
  stop: (chatId: string) => void;
}

interface Current {
  account: string;
  jobId: string;
  chatId: string;
  // Set once, when its reply ends.
  ended: EndedReply | null;
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
  private again = false;
  // The account this Mac last said it's there for, and when.
  private reporting: string | null = null;
  private reportedAt = 0;
  // Quitting. Nothing that comes back after it starts or follows a job.
  private destroyed = false;

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

  // The switch, the account or the link changed. Turned off, what's running stops here at once, before the server hears.
  sync(): void {
    if (this.current && !this.wanted(this.current.account)) this.stopHere(this.current, SWITCHED_OFF);
    void this.tick();
  }

  // The app is quitting. What it was running ends with it, and the server is told, as far as there's time.
  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const account = this.reporting;
    this.reporting = null;
    if (account) void this.withToken(account, (token) => this.server!.macPresence(token, false));
  }

  // Which job it's running, for tests.
  get running(): { jobId: string; chatId: string } | null {
    return this.current && { jobId: this.current.jobId, chatId: this.current.chatId };
  }

  // One round at a time. Asked again during one, another follows it.
  tick(): Promise<void> {
    if (this.ticking) {
      this.again = true;
      return this.ticking;
    }
    this.ticking = (async () => {
      do {
        this.again = false;
        await this.round();
      } while (this.again && !this.destroyed);
    })().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private get signedIn(): string | null {
    const { status, email } = this.account.state;
    return status === "signed-in" ? email : null;
  }

  private wanted(account: string | null): account is string {
    return !this.destroyed && !!this.server && account !== null && this.signedIn === account && this.host.enabled() && this.host.linked();
  }

  private stopHere(job: Current, why: string): void {
    if (job.stopped) return;
    Object.assign(job, { stopped: true, why });
    this.host.stop(job.chatId);
  }

  private async round(): Promise<void> {
    if (this.destroyed) return;
    const account = this.signedIn;
    const wanted = this.wanted(account);
    if (wanted) {
      if (this.reporting !== account || this.now() - this.reportedAt >= PRESENCE_MS) {
        const told = await this.withToken(account, (token) => this.server!.macPresence(token, true).then(() => true));
        if (told && !this.destroyed) {
          this.reporting = account;
          this.reportedAt = this.now();
        }
      }
    } else if (this.reporting !== null) {
      // Turned off, or unlinked. Signed out, there's no one to tell, and it stops counting within a minute.
      if (this.reporting === account) await this.withToken(account, (token) => this.server!.macPresence(token, false));
      this.reporting = null;
    }
    if (this.destroyed) return;
    if (this.current) await this.follow();
    if (!this.current && this.wanted(account) && this.reporting === account) await this.claim(account);
  }

  private async claim(account: string): Promise<void> {
    const row = await this.withToken(account, (token) => this.server!.macClaimJob(token));
    if (!row) return;
    const jobId = String(row.id);
    const fail = (error: string) => this.withToken(account, (token) => this.server!.macUpdateJob(token, jobId, { status: "failed", error }));
    // Turned off, unlinked, signed out or quit while it was being taken: it doesn't start. Signed out, it times out there.
    if (!this.wanted(account)) {
      await fail(this.destroyed ? QUIT_BEFORE : OFF_BEFORE);
      return;
    }
    // Checked as the runner checks it, so a row that's odd or edited doesn't run at all.
    const bird = mascotFromSnapshot(row.mascot);
    if (!bird) {
      await fail(BAD_BIRD);
      return;
    }
    const job: Current = { account, jobId, chatId: "", ended: null, stopped: false, why: null, finalTries: 0 };
    const chatId = this.host.start(String(row.prompt), { bird, askAtLeast: actionApprovalFromRow(row.action_approval), from: RELAY_FROM }, (ended) => {
      job.ended = ended;
    });
    if (!chatId) {
      await fail(NO_BIRD);
      return;
    }
    console.log(`Mac job ${jobId}: started.`);
    job.chatId = chatId;
    this.current = job;
  }

  private async follow(): Promise<void> {
    const job = this.current!;
    // Someone else signed in: it can't be written as them, so it stops here and times out there.
    if (job.account !== this.signedIn) {
      this.stopHere(job, SWITCHED_OFF);
      this.current = null;
      return;
    }
    if (!this.wanted(job.account)) this.stopHere(job, SWITCHED_OFF);
    const { ended } = job;
    if (ended) {
      const error = ended.outcome === "stopped" ? job.why : ended.error;
      return this.end(job, { status: ended.outcome, steps: stepsFromRow(ended.steps), reply: ended.reply, ...(error ? { error } : {}) });
    }
    const now = this.host.progress(job.chatId);
    if (!now) return this.end(job, { status: "stopped", error: DELETED });
    const stop = await this.write(job, { status: now.waiting ? "waiting" : "running", steps: stepsFromRow(now.steps), reply: now.reply });
    if (stop === true && !job.stopped && !job.ended && !this.destroyed) {
      job.stopped = true;
      this.host.stop(job.chatId);
    }
  }

  // How it ended, tried a few rounds before it's left to time out there.
  private async end(job: Current, update: Update): Promise<void> {
    const written = await this.write(job, update);
    if (written === null && ++job.finalTries < FINAL_TRIES) return;
    console.log(`Mac job ${job.jobId}: ${update.status}.`);
    this.current = null;
  }

  // Cut to the row's limits, as the runner's are, so how it ended is always saved.
  private write(job: Current, update: Update): Promise<boolean | null> {
    return this.withToken(job.account, (token) => this.server!.macUpdateJob(token, job.jobId, fitJobUpdate(update)));
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
