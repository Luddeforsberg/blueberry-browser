import { describe, expect, it } from "vitest";
import type { StreamReply } from "../../src/main/chats/agent";
import type { ChatCloud } from "../../src/main/chats/Chats";
import { JOB_LEASE_MS, mascotSnapshot } from "../../src/main/remoteJobs/cloudJobs";
import { BERRY } from "../../src/shared/mascots";
import { dbConfig, type ClaimedJob, type Decision, type JobUpdate, type RunnerDb } from "./db";
import { LOST_TOUCH, NO_ANSWER, runJob, SHUT_DOWN, UnreleasedBrowsers, type JobBrowser } from "./job";

const ASKED = "Click the button “Place order” on shop.example";

// Asks once, the way an action that needs approval does, and says how it went.
const askingReply: StreamReply = async function* (_messages, _signal, { approve }) {
  const allowed = await approve(ASKED);
  yield allowed ? "Ordered it" : "Left it";
};

const JOB: ClaimedJob = {
  id: "job-1",
  prompt: "Order the thing",
  history: [],
  mascot: mascotSnapshot(BERRY),
  actionApproval: "risky",
  contextId: "ctx-1",
};

// The runner's side of the database, recording everything it's asked to do. It has nothing that could decide.
const fakeDb = (answers: (Decision | "stop")[] = []) => {
  const calls: { name: keyof RunnerDb; args: unknown[] }[] = [];
  const updates: JobUpdate[] = [];
  let stopping = false;
  const db: RunnerDb = {
    claim: async () => null,
    update: async (jobId, update) => {
      calls.push({ name: "update", args: [jobId, update] });
      updates.push(update);
      return stopping;
    },
    ask: async (...args) => {
      calls.push({ name: "ask", args });
      return "approval-1";
    },
    decision: async (...args) => {
      calls.push({ name: "decision", args });
      const next = answers.shift() ?? { decision: null, answer: null };
      if (next === "stop") {
        stopping = true;
        return { decision: null, answer: null };
      }
      return next;
    },
  };
  return { db, calls, updates, final: () => updates.at(-1) };
};

// `releases` says how each end goes at the provider, in order. Every end after them is confirmed.
const fakeBrowser = (releases: boolean[] = []) => {
  const seen = { contextId: undefined as string | null | undefined, ended: false, ends: 0 };
  const cloud: ChatCloud = {
    available: () => true,
    claim: () => true,
    release: () => {},
    open: async () => {
      throw new Error("No pages here");
    },
    pagesOf: () => [],
    page: () => null,
    close: () => false,
    giveBack: () => {},
  };
  return {
    seen,
    browser: (contextId: string | null): JobBrowser => {
      seen.contextId = contextId;
      return {
        cloud,
        liveView: async () => null,
        end: async () => {
          seen.ends++;
          seen.ended = releases.shift() ?? true;
          return seen.ended;
        },
      };
    },
  };
};

const options = { pollMs: 5, heartbeatMs: 1_000, answerTimeoutMs: 1_000, log: () => {} };

describe("a job on the runner", () => {
  it("writes the approval and waits until the user decides", async () => {
    const { db, calls, final } = fakeDb([
      { decision: null, answer: null },
      { decision: null, answer: null },
      { decision: "allow", answer: null },
    ]);
    const { seen, browser } = fakeBrowser();
    expect(await runJob(JOB, { ...options, db, browser, streamReply: askingReply })).toBe("done");
    expect(calls.find(({ name }) => name === "ask")?.args).toEqual(["job-1", { kind: "approval", text: ASKED, need: null, site: null }]);
    expect(calls.filter(({ name }) => name === "decision")).toHaveLength(3);
    expect(final()).toMatchObject({ status: "done", reply: "Ordered it" });
    expect(seen).toEqual({ contextId: "ctx-1", ended: true, ends: 1 });
  });

  it("saves the reply so far with the steps, before it waits", async () => {
    const { db, calls } = fakeDb([{ decision: "allow", answer: null }]);
    const talkative: StreamReply = async function* (_messages, _signal, { approve }) {
      yield "Found it. ";
      await approve(ASKED);
      yield "Ordered it";
    };
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: talkative })).toBe("done");
    const asked = calls.findIndex(({ name }) => name === "ask");
    const before = calls.slice(0, asked).map(({ args }) => (args[1] as JobUpdate | undefined)?.reply);
    expect(before).toContain("Found it. ");
  });

  it("keeps a browser whose end wasn't confirmed, and tries again until it is", async () => {
    const { db } = fakeDb([{ decision: "allow", answer: null }]);
    const { seen, browser } = fakeBrowser([false, false]);
    const unreleased = new UnreleasedBrowsers(() => {});
    expect(await runJob(JOB, { ...options, db, browser, streamReply: askingReply, unreleased })).toBe("done");
    expect(unreleased.count).toBe(1);
    await unreleased.retry();
    expect(unreleased.count).toBe(1);
    await unreleased.retry();
    expect(unreleased.count).toBe(0);
    expect(seen.ends).toBe(3);
  });

  it("passes on a no", async () => {
    const { db, final } = fakeDb([{ decision: "deny", answer: null }]);
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: askingReply })).toBe("done");
    expect(final()).toMatchObject({ status: "done", reply: "Left it" });
  });

  it("stops, and does nothing, when nobody answers in time", async () => {
    const { db, calls, final } = fakeDb();
    const { seen, browser } = fakeBrowser();
    expect(await runJob(JOB, { ...options, answerTimeoutMs: 30, db, browser, streamReply: askingReply })).toBe("stopped");
    expect(final()).toMatchObject({ status: "stopped", reply: "", error: NO_ANSWER });
    // It only ever asked and read: there is no way for it to answer.
    expect(new Set(calls.map(({ name }) => name))).toEqual(new Set(["update", "ask", "decision"]));
    expect(seen.ended).toBe(true);
  });

  it("stops when the user stops it while it waits", async () => {
    const { db, final } = fakeDb(["stop"]);
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: askingReply })).toBe("stopped");
    expect(final()).toEqual({ status: "stopped", steps: [{ text: "Stopped here", done: true }], reply: "" });
  });

  it("stops when the runner shuts down", async () => {
    const { db, final } = fakeDb();
    const shutdown = new AbortController();
    setTimeout(() => shutdown.abort(), 20);
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: askingReply, signal: shutdown.signal })).toBe(
      "stopped",
    );
    expect(final()).toMatchObject({ status: "stopped", error: SHUT_DOWN });
  });

  it("tells the phone when it asks and when it finishes, and nothing more", async () => {
    const { db } = fakeDb([{ decision: "allow", answer: null }]);
    const sent: string[] = [];
    const notify = async (kind: string) => void sent.push(kind);
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: askingReply, notify })).toBe("done");
    expect(sent).toEqual(["needs-you", "finished"]);
  });

  it("doesn't tell the phone about a stop the user asked for", async () => {
    const { db } = fakeDb(["stop"]);
    const sent: string[] = [];
    await runJob(JOB, {
      ...options,
      db,
      browser: fakeBrowser().browser,
      streamReply: askingReply,
      notify: async (kind) => void sent.push(kind),
    });
    expect(sent).toEqual(["needs-you"]);
  });

  // The database stops answering writes for a while, each try taking ten seconds of the clock, while the site stays up.
  const outage = (failing: (update: JobUpdate) => boolean) => {
    const { db, updates } = fakeDb();
    const clock = { time: 0 };
    const update = db.update;
    db.update = async (jobId, change) => {
      if (failing(change)) {
        clock.time += 10_000;
        throw new Error("Couldn't reach Supabase.");
      }
      return update(jobId, change);
    };
    const lines: string[] = [];
    const sent: string[] = [];
    return {
      clock,
      updates,
      lines,
      sent,
      run: (streamReply: StreamReply, job = JOB, claimedAt?: number) =>
        runJob(job, {
          claimedAt,
          ...options,
          heartbeatMs: 5,
          now: () => clock.time,
          db,
          browser: fakeBrowser().browser,
          streamReply,
          log: (line) => lines.push(line),
          notify: async (kind) => void sent.push(kind),
        }),
    };
  };
  // Works for as long as it's let, as a job on a site that's still up would.
  const working: StreamReply = async function* (_messages, signal) {
    yield "Working on it. ";
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
  };
  const quick: StreamReply = async function* () {
    yield "Done it";
  };

  it("stops once the server hasn't answered for as long as its lease, though the site is still there", async () => {
    const { run, updates, lines, sent } = outage(() => true);
    expect(await run(working)).toBe("stopped");
    expect(updates).toEqual([]);
    expect(lines).toContain(`Job ${JOB.id}: couldn't write how it ended, so it's left to time out there.`);
    expect(sent).toEqual([]);
  });

  it("says it stopped for lost touch when the server is back in time to hear how it ended", async () => {
    const { run, updates, sent } = outage((update) => update.status === undefined);
    expect(await run(working)).toBe("stopped");
    expect(updates).toEqual([expect.objectContaining({ status: "stopped", error: LOST_TOUCH })]);
    expect(sent).toEqual(["finished"]);
  });

  it("doesn't say it finished when how it ended was never written", async () => {
    const { run, updates, lines, sent } = outage((update) => update.status !== undefined);
    expect(await run(quick)).toBe("done");
    expect(updates.some(({ status }) => status)).toBe(false);
    expect(lines).toContain(`Job ${JOB.id}: couldn't write how it ended, so it's left to time out there.`);
    expect(sent).toEqual([]);
  });

  it("writes how it ended once the server answers again, while the lease holds, and only then says it finished", async () => {
    // Four tries fail, forty seconds of the clock, well within the lease.
    let finals = 0;
    const { run, updates, sent } = outage((update) => update.status !== undefined && ++finals <= 4);
    expect(await run(quick)).toBe("done");
    expect(updates.at(-1)).toMatchObject({ status: "done", reply: "Done it" });
    expect(sent).toEqual(["finished"]);
  });

  it("counts an answer from when its write was sent, so a slow one doesn't stretch the lease", async () => {
    let first = true;
    let stoppedAt = 0;
    const { run, clock } = outage(() => {
      if (!first) return true;
      // Answered a minute after it was sent, and nothing after that is.
      first = false;
      clock.time += 60_000;
      return false;
    });
    const timed: StreamReply = async function* (messages, signal, tools) {
      yield* working(messages, signal, tools);
      stoppedAt = clock.time;
    };
    expect(await run(timed)).toBe("stopped");
    expect(stoppedAt).toBeGreaterThanOrEqual(JOB_LEASE_MS);
    // Counted from the answer, it would have held until a minute later.
    expect(stoppedAt).toBeLessThan(60_000 + JOB_LEASE_MS);
  });

  it("counts the lease from when the claim was sent", async () => {
    let stoppedAt = 0;
    const { run, clock } = outage(() => true);
    const timed: StreamReply = async function* (messages, signal, tools) {
      yield* working(messages, signal, tools);
      stoppedAt = clock.time;
    };
    // Sent a minute before the job started here.
    expect(await run(timed, JOB, -60_000)).toBe("stopped");
    expect(stoppedAt).toBeLessThan(JOB_LEASE_MS - 40_000);
  });

  it("doesn't say it finished when the server had already ended the job", async () => {
    const lines: string[] = [];
    const sent: string[] = [];
    const { db } = fakeDb();
    // The row was failed there after its progress was written, so the final write is answered with true.
    db.update = async (_jobId, change) => change.status !== undefined;
    const notify = async (kind: string) => void sent.push(kind);
    const ran = await runJob(JOB, {
      ...options,
      db,
      browser: fakeBrowser().browser,
      streamReply: quick,
      log: (line) => lines.push(line),
      notify,
    });
    expect(ran).toBe("done");
    expect(lines).toContain(`Job ${JOB.id}: done here, but the server had already ended it or been asked to stop it.`);
    expect(sent).toEqual([]);
  });

  it("writes that a mascot it can't read failed once the server answers again", async () => {
    let tries = 0;
    const { run, updates } = outage(() => ++tries <= 2);
    const job = { ...JOB, mascot: { id: "scout", name: "Scout", instructions: "", sites: [], tools: [] } };
    expect(await run(quick, job)).toBe("failed");
    expect(updates).toEqual([expect.objectContaining({ status: "failed" })]);
  });

  it("doesn't run as a mascot it can't read", async () => {
    const { db, final } = fakeDb();
    const { seen, browser } = fakeBrowser();
    const job = { ...JOB, mascot: { id: "scout", name: "Scout", instructions: "", sites: [], tools: [] } };
    expect(await runJob(job, { ...options, db, browser, streamReply: askingReply })).toBe("failed");
    expect(final()?.status).toBe("failed");
    expect(seen.contextId).toBeUndefined();
  });
});

describe("the runner's keys", () => {
  const env = {
    SUPABASE_URL: "https://abc.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    BLUEBERRY_RUNNER_EMAIL: "runner@example.com",
    BLUEBERRY_RUNNER_PASSWORD: "long and random",
    BLUEBERRY_RUNNER_OWNER: "ana@example.com",
  };

  it("takes its own account and the publishable key", () => {
    expect(dbConfig(env)).toEqual({
      url: "https://abc.supabase.co",
      key: "sb_publishable_x",
      email: "runner@example.com",
      password: "long and random",
      owner: "ana@example.com",
    });
  });

  it.each([
    ["a secret key", { SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }],
    ["a legacy service role key", { SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x" }],
    ["no password", { BLUEBERRY_RUNNER_PASSWORD: "" }],
    ["no owner", { BLUEBERRY_RUNNER_OWNER: undefined }],
    ["the owner's own account", { BLUEBERRY_RUNNER_EMAIL: "Ana@example.com" }],
    ["plain http", { SUPABASE_URL: "http://abc.supabase.co" }],
  ])("refuses %s", (_, change) => {
    expect(typeof dbConfig({ ...env, ...change })).toBe("string");
  });
});
