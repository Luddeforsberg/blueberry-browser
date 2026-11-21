import { randomUUID } from "crypto";
import type { Account } from "../account/Account";
import { isLiveView } from "../cloud/browserbase";
import type { ChatRunner, RunnerJobInput, RunnerProgress } from "../chats/Chats";
import { historyFromRow, mascotSnapshot } from "./cloudJobs";
import { ServerError, type GalleryServer } from "../account/galleryServer";
import type { RunnerState } from "../../shared/ipc";
import { CloudSharing } from "./CloudSharing";
import { RunnerDiscovery } from "./RunnerDiscovery";
import { loadRunnerJobs, MAX_FORGOTTEN, saveRunnerJobs } from "./runnerJobsFile";
import { RunnerPolls } from "./RunnerPolls";
import { startUntilAnswered, UNANSWERED } from "./startUntilAnswered";
import { fresh, type Entry, type RunnerJobsHooks, type RunnerParts } from "./runnerTypes";

export type { RunnerJobsHooks } from "./runnerTypes";

// Chats whose jobs went to the cloud runner, which keeps going with this computer off. The jobs, their steps and their
// approvals are rows in Supabase, read as the signed-in user, so nobody else's can come back. Only the user's own answer
// from this window is written back, through `decide_cloud_approval`: the runner can't write one, and neither can the phone
// or an app here. Which chat is which conversation, and which of its jobs it has, is kept in a file of ids. A conversation
// started or followed up on the phone shows here as a runner chat too, found by looking now and then. The live view
// address goes to the chrome and nowhere else.

const POLL_MS = 2_000;
// How often to look for conversations started or followed up elsewhere, while a linked runner has accepted.
const DISCOVER_MS = 10_000;

const NOT_SET_UP = "This copy of Blueberry has no account server, so it can't send jobs to the cloud.";
const SIGN_IN = "Sign in to your Blueberry account in Settings to send jobs to the cloud.";
const NOT_TAKEN = "The cloud didn't take the job. Try again in a moment.";
const UNSURE =
  "You signed out or changed accounts before the cloud said whether it took this. If it did, it shows here once you're back on that account.";
const TOO_MANY = "Five jobs are already waiting or going in the cloud. Try again when one is done.";
const BUSY = "This chat already has a job going in the cloud, maybe sent from your phone. Send this again once it's done.";
const NO_SUCH_RUNNER =
  "There's no Blueberry account with that email that can run your jobs. Create it in Supabase first, and don't use your own.";
const LINK_FAILED = "That account couldn't be linked. Try again in a moment.";
// The link is looked up again this often while the runner hasn't accepted, and less often once it has, in case it's
// been unlinked elsewhere. Opening the composer looks too.
const LINK_POLL_MS = 10_000;
const LINKED_POLL_MS = 5 * 60_000;
const NO_RUNNER = "Jobs with your computer off aren't linked any more, so this wasn't sent. Link them again in Settings > Cloud.";
const SWITCHED = "You signed in to another account while this was being sent, so it wasn't sent. Send it again.";
// What tokenFor gives when someone else signed in while the token was coming.
const SWITCHED_ACCOUNT = Symbol("switched account");
const OTHER_ACCOUNT = (email: string) => `This chat's jobs are on ${email}. Sign in to that account to go on with it.`;

export class RunnerJobs implements ChatRunner {
  private readonly entries = new Map<string, Entry>();
  // Answered here and on its way, so a poll that crosses it doesn't bring the card back.
  private readonly answered = new Set<string>();
  private readonly discoverTimer: ReturnType<typeof setInterval>;
  private readonly forgotten: string[] = [];
  // Who was signed in when the account last changed, so a change clears what the last one saw.
  private seenAccount: string | null;
  // The runner linked to the signed-in account, as the server last said, and why linking last failed.
  private link: { email: string; accepted: boolean; relayUrl: string | null } | null = null;
  private linkProblem: string | null = null;
  private linkTimer: ReturnType<typeof setTimeout> | null = null;
  // Quitting. Nothing that comes back after it is used, and nothing is asked again.
  private destroyed = false;
  // Each does one part of the work, through what RunnerJobs hands it.
  private readonly sharing: CloudSharing;
  private readonly discovery: RunnerDiscovery;
  private readonly polls: RunnerPolls;

  constructor(
    private readonly server: GalleryServer | null,
    private readonly account: Pick<Account, "state" | "accessToken">,
    private readonly file: string,
    private readonly hooks: RunnerJobsHooks,
    private readonly pollMs = POLL_MS,
  ) {
    const parts: RunnerParts = {
      server,
      hooks,
      entries: this.entries,
      forgotten: this.forgotten,
      answered: this.answered,
      pollMs: this.pollMs,
      signedIn: () => this.signedIn,
      mine: (entry): entry is Entry => this.mine(entry),
      available: () => this.available(),
      link: () => this.link,
      destroyed: () => this.destroyed,
      withToken: (account, call) => this.withToken(account, call),
      save: () => this.save(),
      schedule: () => this.schedule(),
    };
    this.sharing = new CloudSharing(parts);
    this.discovery = new RunnerDiscovery(parts);
    this.polls = new RunnerPolls(parts);
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
    return {
      status: linked ? "linked" : "waiting",
      email: this.link.email,
      problem: this.linkProblem,
      relayUrl: linked ? this.link.relayUrl : null,
    };
  }

  // Asks the server who the runner is, and again now and then while someone's signed in.
  async refreshLink(): Promise<RunnerState> {
    if (this.linkTimer) clearTimeout(this.linkTimer);
    this.linkTimer = null;
    const account = this.signedIn;
    if (!account) this.link = null;
    else {
      const link = await this.withToken(account, (token) => this.server!.myCloudRunner(token).then((found) => ({ found })));
      if (this.destroyed) return this.runnerState;
      if (link && this.signedIn === account) this.link = link.found;
      // No runner has accepted, so nothing in the cloud can run a routine, and none needs holding back here.
      if (link && this.signedIn === account && !link.found?.accepted && this.sharing.routinesThere.size > 0) {
        this.sharing.routinesThere.clear();
        this.save();
        this.hooks.routinesSettled?.();
      }
    }
    if (this.link) this.linkTimer = setTimeout(() => void this.refreshLink(), this.link.accepted ? LINKED_POLL_MS : LINK_POLL_MS);
    this.hooks.runnerUpdated?.(this.runnerState);
    void this.mascotsChanged();
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

  // Every app connected through the relay has to sign in again.
  async disconnectRelay(): Promise<boolean> {
    const account = this.signedIn;
    if (!account) return false;
    return (await this.withToken(account, (token) => this.server!.revokeRelayGrants(token).then(() => true))) === true;
  }

  async unlinkRunner(): Promise<RunnerState> {
    const account = this.signedIn;
    this.linkProblem = null;
    if (account) await this.withToken(account, (token) => this.server!.unlinkCloudRunner(token));
    return this.refreshLink();
  }

  routinesChanged(): Promise<void> {
    return this.sharing.routinesChanged();
  }

  stillInCloud(key: string): boolean {
    return this.sharing.stillInCloud(key);
  }

  cloudFailed(key: string): boolean {
    return this.sharing.cloudFailed(key);
  }

  mascotsChanged(): Promise<void> {
    return this.sharing.mascotsChanged();
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
    const entry = fresh({
      account,
      conversationId: earlierEntry?.conversationId ?? randomUUID(),
      jobIds: earlierEntry?.jobIds ?? [],
      jobId: null,
      active: true,
    });
    this.entries.set(chatId, entry);
    const fail = (problem: string) => {
      entry.active = false;
      this.save();
      return problem;
    };
    try {
      const token = await this.tokenFor(account);
      if (token === SWITCHED_ACCOUNT) return fail(SWITCHED);
      if (!token) return fail(SIGN_IN);
      // Built on the newest job this chat has, which the server checks is the conversation's newest. Under one id for this
      // message, so sending it again can't make a second job.
      const server = this.server;
      const id = randomUUID();
      const sendOnce = async () => {
        const now = await this.tokenFor(account);
        return typeof now === "string"
          ? server.startCloudJob(now, {
              id,
              prompt,
              history: historyFromRow(earlier()),
              mascot: mascotSnapshot(mascot),
              actionApproval,
              contextId: this.hooks.contextId(),
              conversationId: entry.conversationId,
              afterJobId: entry.jobIds.at(-1) ?? null,
            })
          : null;
      };
      const send = () => startUntilAnswered(sendOnce, { going: () => !this.destroyed && this.signedIn === account, waitMs: this.pollMs });
      let jobId: string | typeof UNANSWERED;
      try {
        jobId = await send();
      } catch (error) {
        // The conversation went on elsewhere since this chat last looked. That's brought in first, so this message comes
        // after it and carries it, and it's sent once more.
        if (!(error instanceof ServerError && error.status === 409) || !(await this.discovery.catchUp(account, chatId, entry))) throw error;
        jobId = await send();
      }
      if (jobId === UNANSWERED) return fail(UNSURE);
      entry.jobId = jobId;
      entry.jobIds.push(jobId);
      if (entry.cancel === "forget") {
        void this.server
          .forgetCloudConversation(token, entry.conversationId)
          .catch(() => console.error("Couldn't remove a job from the runner."));
        return null;
      }
      if (entry.cancel === "stop")
        void this.server.stopCloudJob(token, jobId).catch(() => console.error("Couldn't stop a job on the runner."));
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
    void this.withToken(entry.account, (token) => this.server!.decideCloudApproval(token, approvalId, allow, answer ?? null)).then(
      (written) => {
        // Still waiting on it, so the next look brings the card back.
        if (!written) this.answered.delete(approvalId);
      },
    );
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
    if (ours && entry.jobIds.length > 0)
      void this.withToken(entry.account, (token) => this.server!.forgetCloudConversation(token, entry.conversationId));
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
    this.destroyed = true;
    clearInterval(this.discoverTimer);
    this.polls.stop();
    if (this.linkTimer) clearTimeout(this.linkTimer);
    this.linkTimer = null;
  }

  // A token for that account only. The token is whoever is signed in when it's asked for, which may be someone this hasn't
  // heard of yet, so who is signed in is checked again once it's here, and nothing is sent with it otherwise.
  private async tokenFor(account: string): Promise<string | null | typeof SWITCHED_ACCOUNT> {
    const token = await this.account.accessToken();
    // A token that is the word "switched" counted as a switch when that word was the answer, and still does.
    return this.signedIn === account && token !== "switched" ? token : SWITCHED_ACCOUNT;
  }

  private async withToken<T>(account: string, call: (token: string) => Promise<T>): Promise<T | null> {
    if (!this.server) return null;
    try {
      const token = await this.tokenFor(account);
      if (!token || token === SWITCHED_ACCOUNT || this.destroyed) return null;
      const result = await call(token);
      return this.destroyed ? null : result;
    } catch {
      console.error("Couldn't reach the runner's jobs.");
      return null;
    }
  }

  private schedule(): void {
    this.polls.schedule();
  }

  discover(): Promise<void> {
    return this.discovery.discover();
  }

  private load(): void {
    loadRunnerJobs(this.file, { entries: this.entries, forgotten: this.forgotten, routinesThere: this.sharing.routinesThere });
  }

  private save(): void {
    saveRunnerJobs(this.file, { entries: this.entries, forgotten: this.forgotten, routinesThere: this.sharing.routinesThere });
  }
}
