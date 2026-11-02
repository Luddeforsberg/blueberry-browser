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
  const jobs = new Map<string, { owner: string; row: Record<string, unknown> }>();
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const tokenOf = () => account.state.email ?? "";
  const server = {
    startCloudJob: async (token: string) => {
      const id = `job-${jobs.size + 1}`;
      jobs.set(id, { owner: token, row: { id, status: "waiting", steps: [{ text: "Opened shop.example", done: true }], reply: "", live_view_url: LIVE, approval_id: `${id}-a`, approval_kind: "approval", approval_text: "Click Place order" } });
      return id;
    },
    cloudJobs: async (token: string, ids: string[]) => ids.flatMap((id) => (jobs.get(id)?.owner === token ? [jobs.get(id)!.row] : [])),
    decideCloudApproval: vi.fn(async () => true),
    stopCloudJob: async () => {},
    forgetCloudJob: async () => {},
  } as unknown as GalleryServer;
  const changed = vi.fn();
  const finished = vi.fn();
  const runner = new RunnerJobs(
    server,
    { get state() { return account.state; }, accessToken: async () => (account.state.status === "signed-in" ? tokenOf() : null) },
    join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
    { changed, finished, contextId: () => null },
    5
  );
  const signIn = (email: string | null) => {
    account.state = email ? { status: "signed-in", email, problem: null } : { status: "signed-out", email: null, problem: null };
    runner.accountChanged();
  };
  const send = () => runner.start("chat-1", { prompt: "Order it", earlier: [], mascot: BERRY, actionApproval: "risky" });
  return { runner, jobs, signIn, send, changed, finished, server };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

describe("runner jobs in the app", () => {
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
