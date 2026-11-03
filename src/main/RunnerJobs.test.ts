import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccountState } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { ServerError, type GalleryServer } from "./galleryServer";
import { RunnerJobs } from "./RunnerJobs";
import { mascotSnapshot, type CloudRoutineRow } from "./cloudJobs";

const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html";
const ANA = "ana@example.com";
const BO = "bo@example.com";

// The server as each account sees it: its own jobs only, as row-level security has it.
const setUp = () => {
  // While set, every token waits for it, as a refresh does.
  let refreshing: Promise<void> | null = null;
  // While set, the server's answer to a new job waits for it.
  let answering: Promise<void> | null = null;
  // Whether the runner is still linked, as the server would say.
  const link = { accepted: true };
  const jobs = new Map<string, { owner: string; row: Record<string, unknown> }>();
  let made = 0;
  const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
  const tokenOf = () => account.state.email ?? "";
  const server = {
    startCloudJob: vi.fn(async (token: string, job: { prompt: string; history: unknown[]; conversationId: string; afterJobId: string | null }) => {
      await answering;
      if (!link.accepted) throw new ServerError(400, "");
      const conversation = [...jobs.values()].filter(({ row }) => row.conversation_id === job.conversationId).map(({ row }) => row);
      if (conversation.some((row) => !["done", "failed", "stopped"].includes(String(row.status)))) throw new ServerError(409, "");
      // Refused unless it was built on the conversation's newest job, as the server does.
      if ((conversation.at(-1)?.id ?? null) !== job.afterJobId) throw new ServerError(409, "");
      const id = `job-${++made}`;
      jobs.set(id, { owner: token, row: { id, conversation_id: job.conversationId, prompt: job.prompt, mascot: { id: "berry" }, created_at: `2026-11-02T10:00:${String(made).padStart(2, "0")}Z`, status: "waiting", steps: [{ text: "Opened shop.example", done: true }], reply: "", live_view_url: LIVE, approval_id: `${id}-a`, approval_kind: "approval", approval_text: "Click Place order" } });
      return id;
    }),
    cloudConversationJobs: async (token: string) =>
      [...jobs.values()].filter(({ owner }) => owner === token).map(({ row }) => row).reverse(),
    cloudConversation: async (token: string, id: string) => [...jobs.values()].filter(({ owner, row }) => owner === token && row.conversation_id === id).map(({ row }) => row),
    forgetCloudConversation: vi.fn(async (token: string, id: string) => {
      jobs.forEach(({ owner, row }, key) => owner === token && row.conversation_id === id && jobs.delete(key));
    }),
    cloudJobs: async (token: string, ids: string[]) => ids.flatMap((id) => (jobs.get(id)?.owner === token ? [jobs.get(id)!.row] : [])),
    decideCloudApproval: vi.fn(async () => true),
    myCloudRunner: async () => (link.accepted ? { email: "runner@example.com", accepted: true, relayUrl: null } : null),
    stopCloudJob: vi.fn(async () => {}),
  } as unknown as GalleryServer;
  const changed = vi.fn();
  const finished = vi.fn();
  // The chats this computer has, as `Chats` keeps them, with the messages from elsewhere.
  const chats = new Map<string, { mascotId: string | null; said: string[] }>();
  const adopt = vi.fn(({ prompt, mascotId }: { prompt: string; mascotId: string | null }) => {
    const id = `adopted-${chats.size + 1}`;
    chats.set(id, { mascotId, said: [] });
    void prompt;
    return id;
  });
  const followedUp = vi.fn((chatId: string, prompt: string) => chats.get(chatId)?.said.push(prompt));
  // The Mac's own chat, as `Chats` keeps it: what's saved there, which a message sent from here builds its history on.
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  const runner = new RunnerJobs(
    server,
    { get state() { return account.state; }, accessToken: async () => {
      await refreshing;
      return account.state.status === "signed-in" ? tokenOf() : null;
    } },
    join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
    {
      changed,
      finished: (chatId: string, result: { reply: string; steps: unknown[]; error: string | null }) => {
        finished(chatId, result);
        if (chatId === "chat-1" && result.reply) transcript.push({ role: "assistant", content: result.reply });
      },
      contextId: () => null,
      adopt,
      followedUp: (chatId: string, prompt: string) => {
        followedUp(chatId, prompt);
        if (chatId === "chat-1") transcript.push({ role: "user", content: prompt });
      },
    },
    5
  );
  const signIn = (email: string | null) => {
    account.state = email ? { status: "signed-in", email, problem: null } : { status: "signed-out", email: null, problem: null };
    runner.accountChanged();
  };
  // As `Chats` sends: the history read from the chat when it goes, and the message saved once the runner has it.
  const send = async (chatId = "chat-1", prompt = "Order it") => {
    const problem = await runner.start(chatId, { prompt, earlier: () => (chatId === "chat-1" ? [...transcript] : []), mascot: BERRY, actionApproval: "risky" });
    if (chatId === "chat-1") transcript.push({ role: "user", content: prompt });
    return problem;
  };
  // A job sent from the phone, as Ana, in a conversation of its own or one it follows up.
  const fromPhone = (prompt: string, conversationId = `phone-${made + 1}`, status = "running") => {
    const id = `job-${++made}`;
    jobs.set(id, { owner: ANA, row: { id, conversation_id: conversationId, prompt, mascot: { id: "m-scout" }, created_at: `2026-11-02T10:00:${String(made).padStart(2, "0")}Z`, status, steps: [], reply: status === "done" ? "Done there" : "" } });
    return id;
  };
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
  return { runner, jobs, signIn, send, changed, finished, server, holdTokens, holdAnswers, link, fromPhone, adopt, followedUp, chats, transcript };
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
    ["deleting the chat", "forgetCloudConversation" as const],
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
    if (call === "stopCloudJob") expect(server.stopCloudJob).toHaveBeenCalledWith(ANA, "job-1");
    else expect(server.forgetCloudConversation).toHaveBeenCalledWith(ANA, expect.any(String));
    runner.destroy();
  });

  it("uses nothing that comes back after it's destroyed, and asks nothing again", async () => {
    const { runner, send, server, jobs, changed, finished, holdTokens } = setUp();
    expect(await send()).toBeNull();
    await settle();
    // A poll and a look at the link, each waiting for a token when the app quits.
    const release = holdTokens();
    await settle();
    const linking = runner.refreshLink();
    const polled = vi.spyOn(server, "cloudJobs");
    const linked = vi.spyOn(server, "myCloudRunner");
    jobs.get("job-1")!.row.status = "done";
    changed.mockClear();
    runner.destroy();
    release();
    await linking;
    await settle();
    expect(polled).not.toHaveBeenCalled();
    expect(linked).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("says a runner unlinked elsewhere is why a job wasn't taken, and stops offering it", async () => {
    const { runner, send, link } = setUp();
    await settle();
    expect(runner.available()).toBe(true);
    link.accepted = false;
    expect(await send()).toContain("aren't linked any more");
    expect(runner.available()).toBe(false);
    expect(runner.runnerState.status).toBe("none");
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

describe("conversations from elsewhere", () => {
  it("shows a job sent from the phone as a runner chat, with its messages, and follows it to the end", async () => {
    const { runner, jobs, fromPhone, adopt, chats, finished } = setUp();
    await settle();
    const id = fromPhone("Find a cable");
    await runner.discover();
    expect(adopt).toHaveBeenCalledWith({ prompt: "Find a cable", mascotId: "m-scout" });
    expect(chats.get("adopted-1")?.said).toEqual(["Find a cable"]);
    expect(runner.has("adopted-1")).toBe(true);
    expect(runner.active()).toEqual(["adopted-1"]);
    // Looking again adds nothing.
    await runner.discover();
    expect(adopt).toHaveBeenCalledTimes(1);

    jobs.get(id)!.row = { ...jobs.get(id)!.row, status: "done", reply: "This one" };
    await settle();
    expect(finished).toHaveBeenCalledWith("adopted-1", { reply: "This one", steps: [], error: null });
    runner.destroy();
  });

  it("adds a follow-up from the phone to the chat it follows, and sends the next from here in the same conversation", async () => {
    const { runner, jobs, send, fromPhone, adopt, followedUp, finished, server } = setUp();
    expect(await send()).toBeNull();
    await settle();
    const conversation = String(jobs.get("job-1")!.row.conversation_id);
    jobs.get("job-1")!.row = { ...jobs.get("job-1")!.row, status: "done", reply: "Ordered" };
    await settle();
    expect(finished).toHaveBeenCalledTimes(1);

    fromPhone("And the charger?", conversation, "done");
    await runner.discover();
    expect(adopt).not.toHaveBeenCalled();
    expect(followedUp).toHaveBeenCalledWith("chat-1", "And the charger?");
    expect(finished).toHaveBeenLastCalledWith("chat-1", { reply: "Done there", steps: [], error: null });

    expect(await send("chat-1", "Thanks")).toBeNull();
    expect(server.startCloudJob).toHaveBeenLastCalledWith(ANA, expect.objectContaining({ prompt: "Thanks", conversationId: conversation }));
    // This computer's own job isn't taken for one from elsewhere.
    await runner.discover();
    expect(followedUp).toHaveBeenCalledTimes(1);
    runner.destroy();
  });

  it("brings in an exchange sent from the phone since, before a message from here, and carries it", async () => {
    const { runner, jobs, send, fromPhone, server, transcript } = setUp();
    await send();
    await settle();
    const conversation = String(jobs.get("job-1")!.row.conversation_id);
    jobs.get("job-1")!.row = { ...jobs.get("job-1")!.row, status: "done", reply: "Ordered" };
    await settle();
    // Sent and finished on the phone before this computer looked.
    fromPhone("And the charger?", conversation, "done");
    expect(await send("chat-1", "Thanks")).toBeNull();
    const calls = (server.startCloudJob as unknown as { mock: { calls: [string, { prompt: string; history: unknown[]; afterJobId: string | null }][] } }).mock.calls;
    // Refused once as built on job-1, then sent after job-2 with its exchange.
    expect(calls.slice(-2).map(([, job]) => [job.prompt, job.afterJobId])).toEqual([["Thanks", "job-1"], ["Thanks", "job-2"]]);
    expect(calls.at(-1)?.[1].history).toEqual([
      { role: "user", content: "Order it" },
      { role: "assistant", content: "Ordered" },
      { role: "user", content: "And the charger?" },
      { role: "assistant", content: "Done there" },
    ]);
    // And saved in that order.
    expect(transcript.map(({ content }) => content)).toEqual(["Order it", "Ordered", "And the charger?", "Done there", "Thanks"]);
    expect(runner.active()).toEqual(["chat-1"]);
    runner.destroy();
  });

  it("says a job from elsewhere is going rather than sending a second one", async () => {
    const { runner, jobs, send, fromPhone } = setUp();
    await send();
    await settle();
    const conversation = String(jobs.get("job-1")!.row.conversation_id);
    jobs.get("job-1")!.row = { ...jobs.get("job-1")!.row, status: "done" };
    await settle();
    fromPhone("From the phone", conversation);
    expect(await send("chat-1", "From here")).toContain("already has a job going");
    expect([...jobs.values()].filter(({ row }) => row.conversation_id === conversation)).toHaveLength(2);
    runner.destroy();
  });

  it("deletes a chat's whole conversation, and never brings it back", async () => {
    const { runner, jobs, fromPhone, adopt, server } = setUp();
    await settle();
    fromPhone("Find a cable", "phone-x", "done");
    await runner.discover();
    runner.forget("adopted-1");
    await settle();
    expect(server.forgetCloudConversation).toHaveBeenCalledWith(ANA, "phone-x");
    // Even if the server still had it.
    fromPhone("Again", "phone-x", "done");
    await runner.discover();
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(jobs.size).toBe(1);
    runner.destroy();
  });

  it("finds nothing of another account's, or while signed out", async () => {
    const { runner, fromPhone, adopt, signIn } = setUp();
    await settle();
    fromPhone("Ana's");
    signIn(BO);
    await settle();
    await runner.discover();
    signIn(null);
    await runner.discover();
    expect(adopt).not.toHaveBeenCalled();
    runner.destroy();
  });
});

describe("the flock shared with the phone", () => {
  const SCOUT = { ...BERRY, id: "m-1", name: "Scout", instructions: "Find cables.", sites: ["webhallen.com"] };
  const make = (accepted: boolean) => {
    const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
    const syncCloudFlock = vi.fn(async () => {});
    const server = { myCloudRunner: async () => ({ email: "runner@example.com", accepted, relayUrl: null }), syncCloudFlock, cloudConversationJobs: async () => [] } as unknown as GalleryServer;
    const flock = [BERRY, SCOUT];
    const runner = new RunnerJobs(
      server,
      { get state() { return account.state; }, accessToken: async () => (account.state.status === "signed-in" ? "token" : null) },
      join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
      { changed: vi.fn(), finished: vi.fn(), contextId: () => null, flock: () => flock },
      5
    );
    return { runner, account, syncCloudFlock, flock };
  };

  it("goes once a runner has accepted, again only when it changes, and never while signed out", async () => {
    const { runner, account, syncCloudFlock, flock } = make(true);
    await settle();
    expect(syncCloudFlock).toHaveBeenCalledTimes(1);
    expect(syncCloudFlock).toHaveBeenLastCalledWith("token", [expect.objectContaining({ id: "m-1", name: "Scout", sites: ["webhallen.com"] })]);
    await runner.flockChanged();
    expect(syncCloudFlock).toHaveBeenCalledTimes(1);
    flock.push({ ...SCOUT, id: "m-2", name: "Penny" });
    await runner.flockChanged();
    expect(syncCloudFlock).toHaveBeenCalledTimes(2);
    account.state = { status: "signed-out", email: null, problem: null };
    runner.accountChanged();
    flock.pop();
    await runner.flockChanged();
    expect(syncCloudFlock).toHaveBeenCalledTimes(2);
    runner.destroy();
  });

  it("sends one flock at a time, and the newest last", async () => {
    const { runner, syncCloudFlock, flock } = make(true);
    let open = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    syncCloudFlock.mockImplementation(async () => {
      most = Math.max(most, ++open);
      await new Promise<void>((resolve) => releases.push(resolve));
      open--;
    });
    await settle();
    // The first send is still out when two edits come in.
    flock.push({ ...SCOUT, id: "m-2", name: "Penny" });
    void runner.flockChanged();
    flock.push({ ...SCOUT, id: "m-3", name: "Pip" });
    const last = runner.flockChanged();
    while (releases.length) {
      releases.shift()!();
      await settle();
    }
    await last;
    expect(most).toBe(1);
    expect(syncCloudFlock).toHaveBeenCalledTimes(2);
    expect((syncCloudFlock.mock.calls.at(-1) as unknown[])[1]).toHaveLength(3);
    runner.destroy();
  });

  it("isn't shared before a runner has accepted", async () => {
    const { runner, syncCloudFlock } = make(false);
    await settle();
    await runner.flockChanged();
    expect(syncCloudFlock).not.toHaveBeenCalled();
    runner.destroy();
  });
});

describe("routines kept in the cloud", () => {
  const row = (key: string, firstRunAt: string | null = "2026-11-03T07:00:00.000Z", paused = false): CloudRoutineRow => ({
    key,
    prompt: "Check the prices",
    mascot: mascotSnapshot(BERRY),
    actionApproval: "risky",
    contextId: null,
    schedule: { kind: "daily", time: "08:00" },
    timeZone: "Europe/Stockholm",
    paused,
    firstRunAt,
  });

  // A server holding the routines' keys, as `my_cloud_routine_keys` gives them. `failForgets` makes that many forgets fail.
  const make = (onServer: string[], rows: () => CloudRoutineRow[] | null, failForgets = 0) => {
    const keys = new Set(onServer);
    let failing = failForgets;
    const syncCloudRoutine = vi.fn(async (_token: string, sent: CloudRoutineRow) => void keys.add(sent.key));
    const forgetCloudRoutine = vi.fn(async (_token: string, key: string) => {
      if (failing-- > 0) throw new ServerError(500, "");
      keys.delete(key);
    });
    const server = {
      myCloudRunner: async () => ({ email: "runner@example.com", accepted: true, relayUrl: null }),
      syncCloudFlock: async () => {},
      syncCloudRoutine,
      forgetCloudRoutine,
      myCloudRoutineKeys: async () => [...keys],
      cloudConversationJobs: async () => [],
    } as unknown as GalleryServer;
    const runner = new RunnerJobs(
      server,
      { state: { status: "signed-in", email: ANA, problem: null } as AccountState, accessToken: async () => "token" },
      join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
      { changed: vi.fn(), finished: vi.fn(), contextId: () => null, routines: rows },
      5
    );
    return { runner, keys, syncCloudRoutine, forgetCloudRoutine };
  };

  it("sends each routine once, again when it changes or is paused but not as its first time moves on, and forgets one that went", async () => {
    let rows = [row("r1")];
    const { runner, keys, syncCloudRoutine, forgetCloudRoutine } = make([], () => rows);
    await settle();
    expect(syncCloudRoutine).toHaveBeenCalledTimes(1);
    expect(syncCloudRoutine).toHaveBeenLastCalledWith("token", rows[0]);
    rows = [row("r1", "2026-11-04T07:00:00.000Z")];
    await runner.routinesChanged();
    expect(syncCloudRoutine).toHaveBeenCalledTimes(1);
    rows = [row("r1", null, true)];
    await runner.routinesChanged();
    expect(syncCloudRoutine).toHaveBeenCalledTimes(2);
    rows = [];
    await runner.routinesChanged();
    expect(forgetCloudRoutine).toHaveBeenCalledWith("token", "r1");
    expect([...keys]).toEqual([]);
    await runner.routinesChanged();
    expect(forgetCloudRoutine).toHaveBeenCalledTimes(1);
    runner.destroy();
  });

  it("leaves the cloud's routines alone while the ones here couldn't be read", async () => {
    let rows: CloudRoutineRow[] | null = null;
    const { runner, keys, syncCloudRoutine, forgetCloudRoutine } = make(["r1", "r2"], () => rows);
    await settle();
    await runner.routinesChanged();
    expect(syncCloudRoutine).not.toHaveBeenCalled();
    expect(forgetCloudRoutine).not.toHaveBeenCalled();
    expect([...keys].sort()).toEqual(["r1", "r2"]);
    // Read again, as on the next launch, it goes back to keeping them in step.
    rows = [row("r1")];
    await runner.routinesChanged();
    expect(forgetCloudRoutine).toHaveBeenCalledWith("token", "r2");
    runner.destroy();
  });

  it("takes away what the server still has after a restart, tries a failed forget again, and holds it back here till then", async () => {
    // Deleted or moved back on the Mac before it quit, while the forget couldn't get through.
    const { runner, keys, forgetCloudRoutine } = make(["kept", "deleted-before-restart"], () => [row("kept")], 1);
    await settle();
    expect(forgetCloudRoutine).toHaveBeenCalledTimes(1);
    expect([...keys].sort()).toEqual(["deleted-before-restart", "kept"]);
    expect(runner.stillInCloud("deleted-before-restart")).toBe(true);
    await runner.routinesChanged();
    expect(forgetCloudRoutine).toHaveBeenCalledTimes(2);
    expect([...keys]).toEqual(["kept"]);
    expect(runner.stillInCloud("deleted-before-restart")).toBe(false);
    expect(runner.stillInCloud("kept")).toBe(true);
    runner.destroy();
  });

  it("says a routine couldn't be sent, and stops saying so once it is", async () => {
    let rows = [row("r1")];
    const { runner, syncCloudRoutine } = make([], () => rows);
    syncCloudRoutine.mockRejectedValueOnce(new ServerError(500, ""));
    await settle();
    expect(runner.cloudFailed("r1")).toBe(true);
    expect(runner.stillInCloud("r1")).toBe(false);
    rows = [row("r1", null, true)];
    await runner.routinesChanged();
    expect(runner.cloudFailed("r1")).toBe(false);
    expect(runner.stillInCloud("r1")).toBe(true);
    runner.destroy();
  });
});
