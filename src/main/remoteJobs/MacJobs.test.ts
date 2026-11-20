import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountState } from "../../shared/ipc";
import type { ChatStep, MascotProfile } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import type { EndedReply } from "../chats/Chats";
import type { GalleryServer } from "../account/galleryServer";
import { JOB_LEASE_MS } from "./cloudJobs";
import { MacJobs, RELAY_FROM } from "./MacJobs";
import { defined } from "../../shared/testing";

const ANA = "ana@example.com";
const SCOUT = { id: "scout", name: "Scout", instructions: "Finds prices.", sites: ["tea.example"], tools: ["visit"], fromGallery: false };

// The server's side, as the signed-in owner sees it: one queue of jobs for the Mac, which only the switch lets out.
const setUp = ({ enabled = true, mascot = SCOUT as unknown }: { enabled?: boolean; mascot?: unknown } = {}) => {
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const queue: Record<string, unknown>[] = [{ id: "job-1", prompt: "Find the tea", mascot, action_approval: "risky" }];
  const rows = new Map<string, { status: string; reply: string; error: string | null; steps: unknown[]; stopRequested: boolean }>();
  const presence: boolean[] = [];
  // While set, a claim waits for it, as a slow server would.
  let claiming: Promise<void> | null = null;
  const server = {
    macPresence: vi.fn(async (_token: string, on: boolean) => {
      presence.push(on);
    }),
    macClaimJob: vi.fn(async () => {
      await claiming;
      const row = queue.shift() ?? null;
      if (row) rows.set(String(row.id), { status: "running", reply: "", error: null, steps: [], stopRequested: false });
      return row;
    }),
    macUpdateJob: vi.fn(
      async (_token: string, id: string, update: { status?: string; steps?: unknown[]; reply?: string; error?: string }) => {
        const row = rows.get(id);
        if (!row || !["running", "waiting"].includes(row.status)) return true;
        Object.assign(row, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
        return row.stopRequested;
      },
    ),
  } as unknown as GalleryServer;
  const switchOn = { value: enabled };
  // Each chat's reply as it runs, and how to end it, which is what `Chats` tells `onEnd`.
  const chats = new Map<string, { reply: string; steps: ChatStep[]; waiting: boolean; end: (ended: EndedReply) => void }>();
  const host = {
    enabled: () => switchOn.value,
    linked: () => true,
    start: vi.fn(
      (prompt: string, options: { mascot: MascotProfile; askAtLeast: string; from: string }, onEnd: (ended: EndedReply) => void) => {
        void prompt;
        if (options.mascot.id === "gone") return null;
        const id = `chat-${chats.size + 1}`;
        chats.set(id, { reply: "", steps: [], waiting: false, end: onEnd });
        return id;
      },
    ),
    progress: (chatId: string) => chats.get(chatId) ?? null,
    stop: vi.fn((chatId: string) => chats.get(chatId)?.end({ reply: "", steps: [], outcome: "stopped", error: null })),
  };
  let time = 0;
  const jobs = new MacJobs(server, { state: account.state, accessToken: async () => "token" } as never, host, 60_000, () => time);
  return {
    jobs,
    server,
    host,
    chats,
    rows,
    queue,
    presence,
    switchOn,
    account,
    later: (ms: number) => (time += ms),
    holdClaims: () => {
      let release = () => {};
      claiming = new Promise<void>((resolve) => (release = resolve));
      return () => {
        claiming = null;
        release();
      };
    },
  };
};

describe("MacJobs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("claims one job at a time, runs it as a chat from the relay, and writes its reply back", async () => {
    const { jobs, host, chats, rows, queue, presence } = setUp();
    queue.push({
      id: "job-2",
      prompt: "Then this",
      mascot: { id: "berry", name: "Berry", instructions: "", sites: [], tools: ["visit", "click", "type"] },
    });
    await jobs.tick();
    expect(presence).toEqual([true]);
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(defined(host.start.mock.calls[0])[1]).toMatchObject({
      mascot: { id: "scout", sites: ["tea.example"], tools: ["visit"] },
      askAtLeast: "risky",
      from: RELAY_FROM,
    });
    expect(jobs.running).toEqual({ jobId: "job-1", chatId: "chat-1" });

    // While it runs, its steps and words so far go up, and nothing else is claimed.
    Object.assign(chats.get("chat-1")!, { waiting: true, reply: "Looking", steps: [{ text: "Opened tea.example", done: false }] });
    await jobs.tick();
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(rows.get("job-1")).toMatchObject({ status: "waiting", reply: "Looking", steps: [{ text: "Opened tea.example", done: false }] });

    chats.get("chat-1")!.end({ reply: "It's £4.", steps: [{ text: "Opened tea.example", done: true }], outcome: "done", error: null });
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "done", reply: "It's £4.", error: null });
    // Then the next, as Berry.
    await jobs.tick();
    expect(defined(host.start.mock.calls[1])[1].mascot).toBe(BERRY);
  });

  it("reports only the reply it started, not one the user asks for in the chat afterwards", async () => {
    const { jobs, chats, rows } = setUp();
    await jobs.tick();
    chats.get("chat-1")!.end({ reply: "It's £4.", steps: [], outcome: "done", error: null });
    // The user follows up in the chat before the next round: that's theirs, not the relay's.
    Object.assign(chats.get("chat-1")!, { reply: "Only for me", steps: [{ text: "Opened my bank", done: false }] });
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "done", reply: "It's £4.", steps: [] });
    expect(jobs.running).toBeNull();
  });

  it("checks the row's mascot as the runner does, and refuses what's malformed or missing", async () => {
    for (const mascot of [
      // Berry's id with tools taken away isn't Berry.
      { id: "berry", name: "Berry", instructions: "", sites: [], tools: [] },
      { name: "Scout", instructions: "", sites: [], tools: ["visit"] },
      { ...SCOUT, sites: [42] },
      { ...SCOUT, tools: "visit" },
      null,
    ]) {
      const { jobs, host, rows } = setUp({ mascot });
      await jobs.tick();
      expect(host.start, JSON.stringify(mascot)).not.toHaveBeenCalled();
      expect(rows.get("job-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/didn't pass Blueberry's checks/) });
    }
    // One that passes but isn't here.
    const { jobs, rows } = setUp({ mascot: { ...SCOUT, id: "gone" } });
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/isn't in Blueberry on the Mac/) });
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

  it("takes nothing with the switch off, and turning it off stops the job at once and tells the server", async () => {
    const { jobs, server, host, rows, presence, switchOn } = setUp({ enabled: false });
    await jobs.tick();
    expect(server.macClaimJob).not.toHaveBeenCalled();
    expect(presence).toEqual([]);

    switchOn.value = true;
    await jobs.tick();
    expect(jobs.running?.jobId).toBe("job-1");
    switchOn.value = false;
    jobs.sync();
    // Here, before the server hears anything.
    expect(host.stop).toHaveBeenCalledWith("chat-1");
    await jobs.tick();
    expect(presence).toEqual([true, false]);
    expect(rows.get("job-1")).toMatchObject({ status: "stopped", error: expect.stringMatching(/turned off on the Mac/) });
    expect(server.macClaimJob).toHaveBeenCalledTimes(1);
  });

  it("doesn't start a job whose claim comes back after the switch went off", async () => {
    const { jobs, server, host, rows, switchOn, holdClaims } = setUp();
    const release = holdClaims();
    const round = jobs.tick();
    await vi.waitFor(() => expect(server.macClaimJob).toHaveBeenCalled());
    switchOn.value = false;
    jobs.sync();
    release();
    await round;
    expect(host.start).not.toHaveBeenCalled();
    expect(rows.get("job-1")).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/turned off on the Mac before this one started/),
    });
  });

  it("doesn't start a job whose claim comes back after the app quit, and nothing runs after it", async () => {
    const { jobs, server, host, rows, holdClaims } = setUp();
    const release = holdClaims();
    const round = jobs.tick();
    await vi.waitFor(() => expect(server.macClaimJob).toHaveBeenCalled());
    jobs.destroy();
    release();
    await round;
    expect(host.start).not.toHaveBeenCalled();
    expect(jobs.running).toBeNull();
    expect(rows.get("job-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/quit on the Mac before this job started/) });
    await jobs.tick();
    expect(server.macClaimJob).toHaveBeenCalledTimes(1);
  });

  it("writes a reply too long for the row cut short, so how it ended is saved", async () => {
    const { jobs, chats, rows } = setUp();
    await jobs.tick();
    chats.get("chat-1")!.end({ reply: "🫐".repeat(40_001), steps: [], outcome: "failed", error: "x".repeat(501) });
    await jobs.tick();
    const { status, reply, error } = rows.get("job-1")!;
    expect(status).toBe("failed");
    expect(Array.from(reply)).toHaveLength(40_000);
    expect(reply.endsWith(" (cut short)")).toBe(true);
    expect(error).toHaveLength(500);
  });

  it("says it's there again every half a minute", async () => {
    const { jobs, server, presence, queue, later } = setUp();
    queue.length = 0;
    await jobs.tick();
    await jobs.tick();
    expect(presence).toEqual([true]);
    later(30_000);
    await jobs.tick();
    expect(presence).toEqual([true, true]);
    expect(server.macClaimJob).toHaveBeenCalledTimes(3);
  });

  it("stops the chat once the server hasn't answered for as long as its lease, though the site is still there", async () => {
    const { jobs, server, host, later } = setUp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await jobs.tick();
    vi.mocked(server.macUpdateJob).mockRejectedValue(new Error("Couldn't reach Supabase."));
    later(JOB_LEASE_MS - 1);
    await jobs.tick();
    expect(host.stop).not.toHaveBeenCalled();
    later(1);
    await jobs.tick();
    expect(host.stop).toHaveBeenCalledWith("chat-1");
  });

  it("writes how it ended once the server answers again, while the lease holds", async () => {
    const { jobs, server, chats, rows, later } = setUp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await jobs.tick();
    chats.get("chat-1")!.end({ reply: "It's £4.", steps: [], outcome: "done", error: null });
    // Six rounds go unanswered, a minute in all.
    for (let round = 0; round < 6; round++) vi.mocked(server.macUpdateJob).mockRejectedValueOnce(new Error("Couldn't reach Supabase."));
    for (let round = 0; round < 6; round++) {
      await jobs.tick();
      later(10_000);
    }
    expect(jobs.running).not.toBeNull();
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "done", reply: "It's £4." });
    expect(jobs.running).toBeNull();
  });

  it("leaves how it ended to time out there once the lease has run out with no answer", async () => {
    const { jobs, server, chats, rows, later } = setUp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await jobs.tick();
    chats.get("chat-1")!.end({ reply: "It's £4.", steps: [], outcome: "done", error: null });
    vi.mocked(server.macUpdateJob).mockRejectedValue(new Error("Couldn't reach Supabase."));
    await jobs.tick();
    expect(jobs.running).not.toBeNull();
    later(JOB_LEASE_MS);
    await jobs.tick();
    expect(jobs.running).toBeNull();
    expect(rows.get("job-1")?.status).toBe("running");
    expect(log).toHaveBeenCalledWith("Mac job job-1: couldn't write how it ended, so it's left to time out there.");
  });

  it("counts an answer from when its write was sent, so a slow one doesn't stretch the lease", async () => {
    const { jobs, server, host, later } = setUp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await jobs.tick();
    later(20_000);
    // Answered ten seconds after it was sent, and nothing after that is.
    const answer = vi.mocked(server.macUpdateJob).getMockImplementation()!;
    vi.mocked(server.macUpdateJob)
      .mockImplementationOnce(async (...args) => {
        later(10_000);
        return answer(...args);
      })
      .mockRejectedValue(new Error("Couldn't reach Supabase."));
    await jobs.tick();
    later(JOB_LEASE_MS - 10_000);
    await jobs.tick();
    expect(host.stop).toHaveBeenCalledWith("chat-1");
  });

  it("says when the server had already ended the job it ended here", async () => {
    const { jobs, chats, rows } = setUp();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await jobs.tick();
    rows.get("job-1")!.status = "failed";
    chats.get("chat-1")!.end({ reply: "It's £4.", steps: [], outcome: "done", error: null });
    await jobs.tick();
    expect(jobs.running).toBeNull();
    expect(log).toHaveBeenCalledWith("Mac job job-1: done here, but the server had already ended it or been asked to stop it.");
  });

  it("writes that a job it couldn't start failed once the server answers again", async () => {
    const { jobs, server, host, rows } = setUp({ mascot: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(server.macUpdateJob).mockRejectedValueOnce(new Error("Couldn't reach Supabase."));
    await jobs.tick();
    expect(rows.get("job-1")?.status).toBe("running");
    await jobs.tick();
    expect(rows.get("job-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/didn't pass Blueberry's checks/) });
    expect(host.start).not.toHaveBeenCalled();
    expect(host.stop).not.toHaveBeenCalled();
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
