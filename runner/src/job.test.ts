import { describe, expect, it } from "vitest";
import type { StreamReply } from "../../src/main/agent";
import type { ChatCloud } from "../../src/main/Chats";
import { dbConfig, type ClaimedJob, type Decision, type JobUpdate, type RunnerDb } from "./db";
import { NO_ANSWER, runJob, SHUT_DOWN, type JobBrowser } from "./job";

const ASKED = "Click the button “Place order” on shop.example";

// Asks once, the way an action that needs approval does, and says how it went.
const askingReply: StreamReply = async function* (_messages, _signal, { approve }) {
  const allowed = await approve(ASKED);
  yield allowed ? "Ordered it" : "Left it";
};

const JOB: ClaimedJob = { id: "job-1", prompt: "Order the thing", history: [], mascot: { id: "berry" }, actionApproval: "risky", contextId: "ctx-1" };

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

const fakeBrowser = () => {
  const seen = { contextId: undefined as string | null | undefined, ended: false };
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
      return { cloud, liveView: async () => null, end: async () => void (seen.ended = true) };
    },
  };
};

const options = { pollMs: 5, heartbeatMs: 1_000, answerTimeoutMs: 1_000, log: () => {} };

describe("a job on the runner", () => {
  it("writes the approval and waits until the user decides", async () => {
    const { db, calls, final } = fakeDb([{ decision: null, answer: null }, { decision: null, answer: null }, { decision: "allow", answer: null }]);
    const { seen, browser } = fakeBrowser();
    expect(await runJob(JOB, { ...options, db, browser, streamReply: askingReply })).toBe("done");
    expect(calls.find(({ name }) => name === "ask")?.args).toEqual(["job-1", { kind: "approval", text: ASKED, need: null, site: null }]);
    expect(calls.filter(({ name }) => name === "decision")).toHaveLength(3);
    expect(final()).toMatchObject({ status: "done", reply: "Ordered it" });
    expect(seen).toEqual({ contextId: "ctx-1", ended: true });
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
    expect(final()).toEqual({ status: "stopped", steps: [], reply: "" });
  });

  it("stops when the runner shuts down", async () => {
    const { db, final } = fakeDb();
    const shutdown = new AbortController();
    setTimeout(() => shutdown.abort(), 20);
    expect(await runJob(JOB, { ...options, db, browser: fakeBrowser().browser, streamReply: askingReply, signal: shutdown.signal })).toBe("stopped");
    expect(final()).toMatchObject({ status: "stopped", error: SHUT_DOWN });
  });

  it("doesn't run as a bird it can't read", async () => {
    const { db, final } = fakeDb();
    const { seen, browser } = fakeBrowser();
    const job = { ...JOB, mascot: { id: "scout", name: "Scout", instructions: "", sites: [], tools: [] } };
    expect(await runJob(job, { ...options, db, browser, streamReply: askingReply })).toBe("failed");
    expect(final()?.status).toBe("failed");
    expect(seen.contextId).toBeUndefined();
  });
});

describe("the runner's keys", () => {
  const token = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", BLUEBERRY_RUNNER_TOKEN: token({ role: "blueberry_runner", sub: "u1" }) };

  it("takes the runner's own role and the publishable key", () => {
    expect(dbConfig(env)).toEqual({ url: "https://abc.supabase.co", key: "sb_publishable_x", token: env.BLUEBERRY_RUNNER_TOKEN });
  });

  it.each([
    ["a secret key", { SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }],
    ["a service role token", { BLUEBERRY_RUNNER_TOKEN: token({ role: "service_role" }) }],
    ["a user's session", { BLUEBERRY_RUNNER_TOKEN: token({ role: "authenticated", sub: "u1" }) }],
    ["a token for no one", { BLUEBERRY_RUNNER_TOKEN: token({ role: "blueberry_runner" }) }],
    ["plain http", { SUPABASE_URL: "http://abc.supabase.co" }],
  ])("refuses %s", (_, change) => {
    expect(typeof dbConfig({ ...env, ...change })).toBe("string");
  });
});
