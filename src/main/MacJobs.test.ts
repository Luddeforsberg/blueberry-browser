import { describe, expect, it, vi } from "vitest";
import type { AccountState } from "../shared/ipc";
import type { GalleryServer } from "./galleryServer";
import { MacJobs, RELAY_FROM, type MacRun } from "./MacJobs";

const ANA = "ana@example.com";

// The server's side, as the signed-in owner sees it: one queue of jobs for the Mac, which only the switch lets out.
const setUp = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const queue: Record<string, unknown>[] = [{ id: "job-1", prompt: "Find the tea", mascot: { id: "scout", sites: ["tea.example"] } }];
  const rows = new Map<string, { status: string; reply: string; error: string | null; steps: unknown[]; stopRequested: boolean }>();
  const presence: boolean[] = [];
  const server = {
    macPresence: vi.fn(async (_token: string, on: boolean) => {
      presence.push(on);
    }),
    macClaimJob: vi.fn(async () => {
      const row = queue.shift() ?? null;
      if (row) rows.set(String(row.id), { status: "running", reply: "", error: null, steps: [], stopRequested: false });
      return row;
    }),
    macUpdateJob: vi.fn(async (_token: string, id: string, update: { status?: string; steps?: unknown[]; reply?: string; error?: string }) => {
      const row = rows.get(id);
      if (!row || !["running", "waiting"].includes(row.status)) return true;
      Object.assign(row, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
      return row.stopRequested;
    }),
  } as unknown as GalleryServer;
  const switchOn = { value: enabled };
  const chats = new Map<string, MacRun>();
  const host = {
    enabled: () => switchOn.value,
    linked: () => true,
    start: vi.fn((prompt: string, options: { mascotId: string | null; sites: string[]; from: string }) => {
      void prompt;
      if (options.mascotId === "gone") return null;
      const id = `chat-${chats.size + 1}`;
      chats.set(id, { running: true, waiting: false, reply: "", steps: [], outcome: null, error: null });
      return id;
    }),
    run: (chatId: string) => chats.get(chatId) ?? null,
    stop: vi.fn((chatId: string) => {
      const run = chats.get(chatId);
      if (run?.running) Object.assign(run, { running: false, outcome: "stopped" });
    }),
  };
  let time = 0;
  const jobs = new MacJobs(server, { state: account.state, accessToken: async () => "token" } as never, host, 60_000, () => time);
  return { jobs, server, host, chats, rows, queue, presence, switchOn, account, later: (ms: number) => (time += ms) };
};

describe("MacJobs", () => {
  it("claims one job at a time, runs it as a chat from the relay, and writes its reply back", async () => {
    const { jobs, host, chats, rows, queue, presence } = setUp();
    queue.push({ id: "job-2", prompt: "Then this", mascot: { id: "berry", sites: [] } });
    await jobs.tick();
    expect(presence).toEqual([true]);
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(host.start).toHaveBeenCalledWith("Find the tea", { mascotId: "scout", sites: ["tea.example"], from: RELAY_FROM });
    expect(jobs.running).toEqual({ jobId: "job-1", chatId: "chat-1" });

    // While it runs, its steps and words so far go up, and nothing else is claimed.
    Object.assign(chats.get("chat-1")!, { waiting: true, reply: "Looking", steps: [{ text: "Opened tea.example", done: false }] });
    await jobs.tick();
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(rows.get("job-1")).toMatchObject({ status: "waiting", reply: "Looking", steps: [{ text: "Opened tea.example", done: false }] });

    Object.assign(chats.get("chat-1")!, { running: false, waiting: false, outcome: "done", reply: "It's £4.", steps: [{ text: "Opened tea.example", done: true }] });
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "done", reply: "It's £4.", error: null });
    // Then the next, as Berry.
    await jobs.tick();
    expect(host.start).toHaveBeenLastCalledWith("Then this", { mascotId: null, sites: [], from: RELAY_FROM });
  });

  it("stops the chat when the relay asks, and says it stopped", async () => {
    const { jobs, host, rows } = setUp();
    await jobs.tick();
    rows.get("job-1")!.stopRequested = true;
    await jobs.tick();
    expect(host.stop).toHaveBeenCalledWith("chat-1");
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "stopped", error: null });
    expect(jobs.running).toBeNull();
  });

  it("takes nothing with the switch off, and turning it off stops the job and tells the server", async () => {
    const { jobs, server, host, rows, presence, switchOn } = setUp({ enabled: false });
    await jobs.tick();
    expect(server.macClaimJob).not.toHaveBeenCalled();
    expect(presence).toEqual([]);

    switchOn.value = true;
    await jobs.tick();
    expect(jobs.running?.jobId).toBe("job-1");
    switchOn.value = false;
    await jobs.tick();
    expect(presence).toEqual([true, false]);
    expect(host.stop).toHaveBeenCalledWith("chat-1");
    expect(rows.get("job-1")).toMatchObject({ status: "stopped", error: expect.stringMatching(/turned off on the Mac/) });
    expect(server.macClaimJob).toHaveBeenCalledTimes(1);
  });

  it("says it's there again every half a minute, and fails a job whose bird isn't here", async () => {
    const { jobs, server, rows, queue, presence, later } = setUp();
    queue[0] = { id: "job-1", prompt: "Go", mascot: { id: "gone", sites: [] } };
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/isn't in Blueberry on the Mac/) });
    await jobs.tick();
    expect(presence).toEqual([true]);
    later(30_000);
    await jobs.tick();
    expect(presence).toEqual([true, true]);
    expect(server.macClaimJob).toHaveBeenCalledTimes(3);
  });

  it("does nothing signed out, and a job of the last account stops here", async () => {
    const { jobs, server, host, account } = setUp();
    await jobs.tick();
    account.state.status = "signed-out";
    account.state.email = null;
    await jobs.tick();
    expect(host.stop).toHaveBeenCalledWith("chat-1");
    expect(jobs.running).toBeNull();
    expect(server.macClaimJob).toHaveBeenCalledTimes(1);
  });
});
