import { randomUUID } from "node:crypto";
import { streamReply as agentReply, type StreamReply } from "../../src/main/chats/agent";
import { isLiveView } from "../../src/main/cloud/browserbase";
import { Chats, type ChatCloud, type ChatStoreLike, type TaskProgress } from "../../src/main/chats/Chats";
import { approvalToAsk, JOB_LEASE_MS, mascotFromSnapshot } from "../../src/main/remoteJobs/cloudJobs";
import type { CloudSessions } from "../../src/main/cloud/cloudBrowser";
import type { ChatApproval } from "../../src/shared/library";
import type { ClaimedJob, JobUpdate, RunnerDb } from "./db";
import type { PushKind } from "./push";
import { Latest, Lease } from "../../src/shared/lateWork";

// One job, run the way a chat with no page runs in the app: the same `Chats.runTask`, agent, tools, mascot limits,
// approvals and step limit, in the cloud browser's pages. What it does is written to the job's row as it happens. An
// approval is written as a row and the job waits for the user's answer, which only they can write. The runner never
// answers, and with no answer in time the job stops. It goes on only while the server keeps answering its writes, within
// the job's lease, and it has ended only once the server has answered the write that ends it.

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const ANSWER_TIMEOUT_MS = 30 * 60_000;

export const NO_ANSWER = "Nobody answered in time, so the job stopped there. Nothing waiting was done.";
export const SHUT_DOWN = "The runner was restarting, so the job stopped there.";
export const LOST_TOUCH = "The runner lost touch with Blueberry's server, so the job stopped there.";
const BAD_MASCOT = "The mascot this job was sent as couldn't be read, so it didn't run.";

// The cloud browser for one job, which ends with it, so nothing is left running or costing.
export interface JobBrowser {
  cloud: ChatCloud;
  // The live view of that page, or null where there's none.
  liveView(pageId: string): Promise<string | null>;
  // True once the provider has confirmed it ended. Until then it may still be running, and costing.
  end(): Promise<boolean>;
}

export const sessionBrowser = (sessions: CloudSessions): JobBrowser => ({
  cloud: {
    available: () => true,
    claim: (jobId) => sessions.claim(jobId),
    release: (jobId) => sessions.release(jobId),
    open: (jobId, url, allows) => sessions.open(jobId, randomUUID(), url, { onChange: () => {} }, allows),
    pagesOf: (jobId) => sessions.pagesOf(jobId),
    page: (id) => sessions.page(id),
    close: (id) => {
      if (!sessions.page(id)) return false;
      void sessions.close(id);
      return true;
    },
    // Nobody takes a page over in a window here: the user signs in through the live view, and I'm done answers the handoff.
    giveBack: () => {},
  },
  liveView: (pageId) => sessions.liveView(pageId),
  end: async () => {
    await sessions.end();
    return !sessions.unreleased;
  },
});

// Browsers whose end the provider didn't confirm, tried again until it does, so a passing failure doesn't leave a paid
// session running until it times out.
export class UnreleasedBrowsers {
  private readonly waiting = new Set<JobBrowser>();

  constructor(private readonly log: (line: string) => void = console.log) {}

  keep(browser: JobBrowser): void {
    this.waiting.add(browser);
  }

  get count(): number {
    return this.waiting.size;
  }

  async retry(): Promise<void> {
    for (const browser of this.waiting) {
      if (await browser.end().catch(() => false)) {
        this.waiting.delete(browser);
        this.log("A cloud browser that hadn't ended has now.");
      }
    }
  }
}

// A runner has no saved chats. A task never reads or writes one, so this only has to say there are none.
const NO_CHATS: ChatStoreLike = {
  chat: () => null,
  createChat: () => {
    throw new Error("The runner has no chats.");
  },
  addMessage: () => {},
  filesOf: () => [],
  renameChat: () => false,
  deleteChat: () => false,
  needsTitle: () => false,
  setGeneratedTitle: () => false,
  setSeen: () => false,
};

export interface RunJobOptions {
  db: RunnerDb;
  browser: (contextId: string | null) => JobBrowser;
  // The real agent, unless a test gives another.
  streamReply?: StreamReply;
  // Aborted when the runner shuts down.
  signal?: AbortSignal;
  // Told about a browser whose end wasn't confirmed, to try again later.
  unreleased?: UnreleasedBrowsers;
  pollMs?: number;
  heartbeatMs?: number;
  answerTimeoutMs?: number;
  leaseMs?: number;
  // When the claim that took this job was sent, which the lease counts from.
  claimedAt?: number;
  now?: () => number;
  log?: (line: string) => void;
  // Tells the owner's phone, with no content: when the job asks them, and when it ends other than by their own Stop.
  notify?: ((kind: PushKind) => Promise<void>) | undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// How the job ended, tried at least once and again while the lease holds. After that the server ends it as failed on
// its own. "saved" only once the server says it wrote it: "over" is an answer that it had already ended the job, or
// been asked to stop it, and "unanswered" means nothing was heard.
const writeEnd = async (write: () => Promise<boolean>, lease: Lease, pollMs: number): Promise<"saved" | "over" | "unanswered"> => {
  do {
    try {
      return (await write()) ? "over" : "saved";
    } catch {
      if (lease.live) await sleep(pollMs);
    }
  } while (lease.live);
  return "unanswered";
};

// What the log says about how a job ended, and whether the phone hears it finished: only once the server has it. A Stop
// the user asked for is answered as one, and that's how it ended, with no notification.
const howItEnded = (id: string, status: string, ended: Awaited<ReturnType<typeof writeEnd>>, noStopWords: boolean) => {
  const theirStop = status === "stopped" && noStopWords;
  if (ended === "unanswered") return { line: `Job ${id}: couldn't write how it ended, so it's left to time out there.`, notify: false };
  if (ended === "over" && !theirStop)
    return { line: `Job ${id}: ${status} here, but the server had already ended it or been asked to stop it.`, notify: false };
  return { line: `Job ${id}: ${status}.`, notify: !theirStop };
};

// The live view the job's row shows, for the page asked for last. Every step asks again, and a lookup can take a while,
// so one for an earlier page that answers late never replaces the page the user is being asked to type into.
export const followLiveView = (
  lookUp: (pageId: string) => Promise<string | null>,
  show: (liveView: string) => void,
): ((pageId: string | null) => Promise<void>) => {
  const lookups = new Latest();
  let shown: string | null = null;
  return async (pageId) => {
    const turn = lookups.next();
    const url = pageId ? await lookUp(pageId).catch(() => null) : null;
    const next = url && isLiveView(url) ? url : null;
    if (!turn.current || next === shown) return;
    shown = next;
    show(next ?? "");
  };
};

export const runJob = async (job: ClaimedJob, options: RunJobOptions): Promise<"done" | "failed" | "stopped"> => {
  const {
    db,
    streamReply = agentReply,
    signal,
    pollMs = POLL_MS,
    heartbeatMs = HEARTBEAT_MS,
    answerTimeoutMs = ANSWER_TIMEOUT_MS,
    leaseMs = JOB_LEASE_MS,
    now = Date.now,
    log = console.log,
  } = options;
  const notify = (kind: PushKind) => void options.notify?.(kind).catch(() => {});
  // Claimed just now, which was the server's answer.
  const lease = new Lease(leaseMs, now, options.claimedAt ?? now());
  const mascot = mascotFromSnapshot(job.mascot);
  if (!mascot) {
    await writeEnd(() => db.update(job.id, { status: "failed", error: BAD_MASCOT }), lease, pollMs);
    return "failed";
  }
  const browser = options.browser(job.contextId);
  const chats = new Chats(
    NO_CHATS,
    streamReply,
    async () => null,
    {
      activeTab: () => null,
      allTabs: () => [],
      openBackgroundTab: () => {
        throw new Error("The runner has no window.");
      },
      closeTab: () => false,
      actionApproval: () => job.actionApproval,
    },
    { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
    () => mascot,
    null,
    browser.cloud,
  );

  // Why it was stopped from here, if it was. A stop the user asked for needs no words.
  let stopWords: string | null = null;
  const stop = (words: string | null) => {
    stopWords ??= words;
    chats.stop(job.id);
  };
  const onShutDown = () => stop(SHUT_DOWN);
  signal?.addEventListener("abort", onShutDown, { once: true });

  // One write at a time, in order, with whatever came in meanwhile folded into the next. Every write is a heartbeat too.
  let pending: JobUpdate | null = null;
  let writing: Promise<void> = Promise.resolve();
  const write = (update: JobUpdate) => {
    pending = { ...pending, ...update };
    writing = writing.then(async () => {
      const next = pending;
      pending = null;
      if (!next) return;
      const sentAt = now();
      try {
        const stopping = await db.update(job.id, next);
        lease.renew(sentAt);
        if (stopping) stop(null);
      } catch {
        log(`Job ${job.id}: couldn't write its progress.`);
      }
    });
    return writing;
  };

  // The page handed to the user while they're asked to do something there, and otherwise the one the job used last.
  const follow = followLiveView(
    (pageId) => browser.liveView(pageId),
    (liveView) => void write({ liveView }),
  );
  const showLiveView = (approval: ChatApproval | null) => follow(approval?.handoff?.tabId || chats.work(job.id)?.currentId || null);

  const waitingOn = (approval: ChatApproval) => chats.waiting().some((run) => run.id === job.id && run.approval.id === approval.id);

  // The user's answer is the only thing that lets it go on. The runner reads it and passes it on, and nothing else.
  const relay = async (approval: ChatApproval) => {
    await writing;
    let approvalId: string;
    try {
      approvalId = await db.ask(job.id, approvalToAsk(approval));
    } catch {
      log(`Job ${job.id}: couldn't ask the user.`);
      return stop("The runner couldn't ask you about the next step, so it stopped there.");
    }
    notify("needs-you");
    const until = Date.now() + answerTimeoutMs;
    while (waitingOn(approval)) {
      await sleep(pollMs);
      if (!waitingOn(approval)) return;
      const { decision, answer } = await db.decision(approvalId).catch(() => ({ decision: null, answer: null }));
      if (decision) {
        await write({ status: "running" });
        chats.decide(job.id, approval.id, decision === "allow", answer ?? undefined);
        return;
      }
      if (Date.now() > until) return stop(NO_ANSWER);
      await write({});
    }
  };

  const asked = new Set<string>();
  const onProgress = ({ steps, approval }: TaskProgress) => {
    void write({ steps });
    void showLiveView(approval);
    if (approval && !asked.has(approval.id)) {
      asked.add(approval.id);
      void relay(approval);
    }
  };

  // Checked here rather than when a write comes back, so one that never does can't keep the job going.
  const heartbeat = setInterval(() => {
    if (!lease.live) stop(LOST_TOUCH);
    void write({});
  }, heartbeatMs);
  log(`Job ${job.id}: started.`);
  try {
    if (signal?.aborted) stop(SHUT_DOWN);
    // The reply so far goes with the steps, so words written before a long wait show while it waits.
    const onText = (reply: string) => void write({ reply });
    const result = await chats.runTask(job.id, job.prompt, onProgress, mascot.id, [], { cloud: true, earlier: job.history, onText });
    clearInterval(heartbeat);
    await writing;
    const status = result.stopped ? "stopped" : result.error ? "failed" : "done";
    const error = result.stopped ? stopWords : result.error;
    const final: JobUpdate = { status, steps: result.steps, reply: result.text, ...(error ? { error } : {}) };
    const said = howItEnded(job.id, status, await writeEnd(() => db.update(job.id, final), lease, pollMs), !stopWords);
    log(said.line);
    if (said.notify) notify("finished");
    return status;
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", onShutDown);
    if (!(await browser.end().catch(() => false))) {
      log(`Job ${job.id}: its cloud browser didn't confirm it ended, so the runner will try again.`);
      options.unreleased?.keep(browser);
    }
  }
};
