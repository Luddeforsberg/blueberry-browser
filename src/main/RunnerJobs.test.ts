import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccountState } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import type { GalleryServer } from "./galleryServer";
import { RunnerJobs } from "./RunnerJobs";

const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html";
const ANA = "ana@example.com";
const BO = "bo@example.com";

// The server as each account sees it: its own jobs only, as row-level security has it.
const setUp = () => {
  // While set, every token waits for it, as a refresh does.
  let refreshing: Promise<void> | null = null;
  // While set, the server's answer to a new job waits for it.
  let answering: Promise<void> | null = null;
  const jobs = new Map<string, { owner: string; row: Record<string, unknown> }>();
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const tokenOf = () => account.state.email ?? "";
  const server = {
    startCloudJob: vi.fn(async (token: string) => {
      await answering;
      const id = `job-${jobs.size + 1}`;
      jobs.set(id, { owner: token, row: { id, status: "waiting", steps: [{ text: "Opened shop.example", done: true }], reply: "", live_view_url: LIVE, approval_id: `${id}-a`, approval_kind: "approval", approval_text: "Click Place order" } });
      return id;
    }),
    cloudJobs: async (token: string, ids: string[]) => ids.flatMap((id) => (jobs.get(id)?.owner === token ? [jobs.get(id)!.row] : [])),
    decideCloudApproval: vi.fn(async () => true),
    myCloudRunner: async () => ({ email: "runner@example.com", accepted: true }),
    stopCloudJob: vi.fn(async () => {}),
    forgetCloudJob: vi.fn(async () => {}),
  } as unknown as GalleryServer;
  const changed = vi.fn();
  const finished = vi.fn();
  const runner = new RunnerJobs(
    server,
    { get state() { return account.state; }, accessToken: async () => {
      await refreshing;
      return account.state.status === "signed-in" ? tokenOf() : null;
    } },
    join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
    { changed, finished, contextId: () => null },
    5
  );
  const signIn = (email: string | null) => {
    account.state = email ? { status: "signed-in", email, problem: null } : { status: "signed-out", email: null, problem: null };
    runner.accountChanged();
  };
  const send = () => runner.start("chat-1", { prompt: "Order it", earlier: [], mascot: BERRY, actionApproval: "risky" });
  const hold = (set: (gate: Promise<void> | null) => void) => {
    let release = () => {};
    set(new Promise((resolve) => (release = resolve)));
    return () => {
      set(null);
      release();
    };
  };
  const holdTokens = () => hold((gate) => (refreshing = gate));
  const holdAnswers = () => hold((gate) => (answering = gate));
  return { runner, jobs, signIn, send, changed, finished, server, holdTokens, holdAnswers };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

describe("runner jobs in the app", () => {
  it("doesn't send one account's job with a token that came back for another", async () => {
    const { runner, signIn, send, server, holdTokens } = setUp();
    const release = holdTokens();
    const sending = send();
    // Signed in as someone else while the refresh was out, which then hands back their token.
    signIn(BO);
    release();
    expect(await sending).toContain("another account");
    expect(server.startCloudJob).not.toHaveBeenCalled();
    expect(runner.progress("chat-1")).toBeNull();
  });

  it.each([
    ["Stop", "stopCloudJob" as const],
    ["deleting the chat", "forgetCloudJob" as const],
  ])("does %s on a job still being sent as soon as its id comes back", async (_, call) => {
    const { runner, send, server, holdAnswers } = setUp();
    const release = holdAnswers();
    const sending = send();
    await settle();
    if (call === "stopCloudJob") runner.stop("chat-1");
    else runner.forget("chat-1");
    release();
    await sending;
    await settle();
    expect(server[call]).toHaveBeenCalledWith(ANA, "job-1");
    runner.destroy();
  });

  it("shows nothing of a job once its account signs out, and can't answer it", async () => {
    const { runner, signIn, send, server } = setUp();
    expect(await send()).toBeNull();
    await settle();
    expect(runner.progress("chat-1")?.approval?.id).toBe("job-1-a");
    expect(runner.liveView("chat-1")).toBe(LIVE);

    signIn(null);
    expect(runner.progress("chat-1")).toBeNull();
    expect(runner.liveView("chat-1")).toBeNull();
    expect(runner.active()).toEqual([]);
    expect(runner.decide("chat-1", "job-1-a", true)).toBe(false);
    expect(server.decideCloudApproval).not.toHaveBeenCalled();
    // Still the runner's chat, so a message there doesn't quietly run on this computer.
    expect(runner.has("chat-1")).toBe(true);
  });

  it("keeps another account's job waiting, not gone, and brings it back for its own account", async () => {
    const { runner, jobs, signIn, send, finished } = setUp();
    await send();
    await settle();

    signIn(BO);
    await settle();
    expect(finished).not.toHaveBeenCalled();
    expect(runner.progress("chat-1")).toBeNull();
    expect(await send()).toContain(ANA);
    expect(jobs.size).toBe(1);

    signIn(ANA);
    await settle();
    expect(runner.progress("chat-1")?.approval?.id).toBe("job-1-a");
    expect(runner.decide("chat-1", "job-1-a", true)).toBe(true);

    jobs.get("job-1")!.row = { id: "job-1", status: "done", steps: [], reply: "Ordered it" };
    await settle();
    expect(finished).toHaveBeenCalledWith("chat-1", { reply: "Ordered it", steps: [], error: null });
    runner.destroy();
  });
});
