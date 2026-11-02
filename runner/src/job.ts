import { randomUUID } from "node:crypto";
import { streamReply as agentReply, type StreamReply } from "../../src/main/agent";
import { isLiveView } from "../../src/main/browserbase";
import { Chats, type ChatCloud, type ChatStoreLike, type TaskProgress } from "../../src/main/Chats";
import { approvalToAsk, mascotFromSnapshot } from "../../src/main/cloudJobs";
import type { CloudSessions } from "../../src/main/cloudBrowser";
import type { ChatApproval } from "../../src/shared/library";
import type { ClaimedJob, JobUpdate, RunnerDb } from "./db";

// One job, run the way a chat with no page runs in the app: the same `Chats.runTask`, agent, tools, mascot limits,
// approvals and step limit, in the cloud browser's pages. What it does is written to the job's row as it happens. An
// approval is written as a row and the job waits for the user's answer, which only they can write. The runner never
// answers, and with no answer in time the job stops.

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const ANSWER_TIMEOUT_MS = 30 * 60_000;
const FINAL_TRIES = 3;

export const NO_ANSWER = "Nobody answered in time, so the job stopped there. Nothing waiting was done.";
export const SHUT_DOWN = "The runner was restarting, so the job stopped there.";
const BAD_MASCOT = "The bird this job was sent as couldn't be read, so it didn't run.";

// The cloud browser for one job, which ends with it, so nothing is left running or costing.
export interface JobBrowser {
  cloud: ChatCloud;
  // The live view of the page it's on now, or null where there's none.
  liveView(): Promise<string | null>;
  end(): Promise<void>;
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
  liveView: async () => {
    const latest = sessions.pageIds.filter((id) => sessions.page(id) && !sessions.page(id)!.isClosed).at(-1);
    return latest ? sessions.liveView(latest) : null;
  },
  end: () => sessions.end(),
});

// A runner has no saved chats. A task never reads or writes one, so this only has to say there are none.
const NO_CHATS: ChatStoreLike = {
  chat: () => null,
  createChat: () => {
    throw new Error("The runner has no chats.");
  },
  addMessage: () => {},
  renameChat: () => false,
  deleteChat: () => false,
  needsTitle: () => false,
  setGeneratedTitle: () => false,
};

export interface RunJobOptions {
  db: RunnerDb;
  browser: (contextId: string | null) => JobBrowser;
  // The real agent, unless a test gives another.
  streamReply?: StreamReply;
  // Aborted when the runner shuts down.
  signal?: AbortSignal;
  pollMs?: number;
  heartbeatMs?: number;
  answerTimeoutMs?: number;
  log?: (line: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runJob = async (job: ClaimedJob, options: RunJobOptions): Promise<"done" | "failed" | "stopped"> => {
  const { db, streamReply = agentReply, signal, pollMs = POLL_MS, heartbeatMs = HEARTBEAT_MS, answerTimeoutMs = ANSWER_TIMEOUT_MS, log = console.log } = options;
  const mascot = mascotFromSnapshot(job.mascot);
  if (!mascot) {
    await db.update(job.id, { status: "failed", error: BAD_MASCOT }).catch(() => {});
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
    browser.cloud
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
      try {
        if (await db.update(job.id, next)) stop(null);
      } catch {
        log(`Job ${job.id}: couldn't write its progress.`);
      }
    });
    return writing;
  };

  let liveView: string | null = null;
  const showLiveView = async () => {
    const url = await browser.liveView().catch(() => null);
    const next = url && isLiveView(url) ? url : null;
    if (next === liveView) return;
    liveView = next;
    void write({ liveView: next ?? "" });
  };

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
    void showLiveView();
    if (approval && !asked.has(approval.id)) {
      asked.add(approval.id);
      void relay(approval);
    }
  };

  const heartbeat = setInterval(() => void write({}), heartbeatMs);
  log(`Job ${job.id}: started.`);
  try {
    if (signal?.aborted) stop(SHUT_DOWN);
    const result = await chats.runTask(job.id, job.prompt, onProgress, mascot.id, [], { cloud: true, earlier: job.history });
    clearInterval(heartbeat);
    await writing;
    const status = result.stopped ? "stopped" : result.error ? "failed" : "done";
    const error = result.stopped ? stopWords : result.error;
    const final: JobUpdate = { status, steps: result.steps, reply: result.text, ...(error ? { error } : {}) };
    for (let attempt = 1; attempt <= FINAL_TRIES; attempt++) {
      try {
        await db.update(job.id, final);
        break;
      } catch {
        if (attempt === FINAL_TRIES) log(`Job ${job.id}: couldn't write how it ended.`);
        else await sleep(pollMs);
      }
    }
    log(`Job ${job.id}: ${status}.`);
    return status;
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", onShutDown);
    await browser.end().catch(() => log(`Job ${job.id}: couldn't end its cloud browser.`));
  }
};
