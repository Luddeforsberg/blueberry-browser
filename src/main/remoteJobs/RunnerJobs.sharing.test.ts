import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccountState } from "../../shared/ipc";
import { BERRY } from "../../shared/mascots";
import { ServerError, type GalleryServer } from "../account/galleryServer";
import { RunnerJobs } from "./RunnerJobs";
import { mascotSnapshot, type CloudRoutineRow } from "./cloudJobs";
import { ANA, settle } from "./runnerJobsTesting";

describe("the mascots shared with the phone", () => {
  const SCOUT = { ...BERRY, id: "m-1", name: "Scout", instructions: "Find cables.", sites: ["webhallen.com"] };
  const make = (accepted: boolean) => {
    const account = { state: { status: "signed-in", email: ANA, problem: null } as AccountState };
    const syncCloudMascots = vi.fn(async () => {});
    const server = {
      myCloudRunner: async () => ({ email: "runner@example.com", accepted, relayUrl: null }),
      syncCloudMascots,
      cloudConversationJobs: async () => [],
    } as unknown as GalleryServer;
    const mascots = [BERRY, SCOUT];
    const runner = new RunnerJobs(
      server,
      {
        get state() {
          return account.state;
        },
        accessToken: async () => (account.state.status === "signed-in" ? "token" : null),
      },
      join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json"),
      { changed: vi.fn(), finished: vi.fn(), contextId: () => null, mascots: () => mascots },
      5,
    );
    return { runner, account, syncCloudMascots, mascots };
  };

  it("goes once a runner has accepted, again only when it changes, and never while signed out", async () => {
    const { runner, account, syncCloudMascots, mascots } = make(true);
    await settle();
    expect(syncCloudMascots).toHaveBeenCalledTimes(1);
    expect(syncCloudMascots).toHaveBeenLastCalledWith("token", [
      expect.objectContaining({ id: "m-1", name: "Scout", sites: ["webhallen.com"] }),
    ]);
    await runner.mascotsChanged();
    expect(syncCloudMascots).toHaveBeenCalledTimes(1);
    mascots.push({ ...SCOUT, id: "m-2", name: "Penny" });
    await runner.mascotsChanged();
    expect(syncCloudMascots).toHaveBeenCalledTimes(2);
    account.state = { status: "signed-out", email: null, problem: null, problemAbout: null };
    runner.accountChanged();
    mascots.pop();
    await runner.mascotsChanged();
    expect(syncCloudMascots).toHaveBeenCalledTimes(2);
    runner.destroy();
  });

  it("sends one list at a time, and the newest last", async () => {
    const { runner, syncCloudMascots, mascots } = make(true);
    let open = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    syncCloudMascots.mockImplementation(async () => {
      most = Math.max(most, ++open);
      await new Promise<void>((resolve) => releases.push(resolve));
      open--;
    });
    await settle();
    // The first send is still out when two edits come in.
    mascots.push({ ...SCOUT, id: "m-2", name: "Penny" });
    void runner.mascotsChanged();
    mascots.push({ ...SCOUT, id: "m-3", name: "Pip" });
    const last = runner.mascotsChanged();
    while (releases.length) {
      releases.shift()!();
      await settle();
    }
    await last;
    expect(most).toBe(1);
    expect(syncCloudMascots).toHaveBeenCalledTimes(2);
    expect((syncCloudMascots.mock.calls.at(-1) as unknown[])[1]).toHaveLength(3);
    runner.destroy();
  });

  it("isn't shared before a runner has accepted", async () => {
    const { runner, syncCloudMascots } = make(false);
    await settle();
    await runner.mascotsChanged();
    expect(syncCloudMascots).not.toHaveBeenCalled();
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
  // `here` is every routine on this computer, in the cloud or not, `sentBefore` what an earlier launch saved as sent, and
  // `oldList` what an earlier version saved.
  const make = (
    onServer: string[],
    rows: () => CloudRoutineRow[] | null,
    { failForgets = 0, here = () => (rows() ?? []).map(({ key }) => key), sentBefore = [] as string[], oldList = [] as string[] } = {},
  ) => {
    const keys = new Set(onServer);
    let failing = failForgets;
    const myCloudRoutineKeys = vi.fn(async () => [...keys]);
    const syncCloudRoutine = vi.fn(async (_token: string, sent: CloudRoutineRow) => void keys.add(sent.key));
    const forgetCloudRoutine = vi.fn(async (_token: string, key: string) => {
      if (failing-- > 0) throw new ServerError(500, "");
      keys.delete(key);
    });
    const server = {
      myCloudRunner: async () => ({ email: "runner@example.com", accepted: true, relayUrl: null }),
      syncCloudMascots: async () => {},
      syncCloudRoutine,
      forgetCloudRoutine,
      myCloudRoutineKeys,
      cloudConversationJobs: async () => [],
    } as unknown as GalleryServer;
    const file = join(mkdtempSync(join(tmpdir(), "runner-jobs-")), "runner-jobs.json");
    writeFileSync(file, JSON.stringify({ chats: {}, forgotten: [], routinesSentFromHere: sentBefore, routinesInCloud: oldList }));
    const runner = new RunnerJobs(
      server,
      { state: { status: "signed-in", email: ANA, problem: null } as AccountState, accessToken: async () => "token" },
      file,
      { changed: vi.fn(), finished: vi.fn(), contextId: () => null, routines: rows, routineIds: here },
      5,
    );
    return {
      runner,
      keys,
      syncCloudRoutine,
      forgetCloudRoutine,
      myCloudRoutineKeys,
      saved: () => JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>,
    };
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
    // r2 was moved back to this computer.
    const { runner, keys, syncCloudRoutine, forgetCloudRoutine } = make(["r1", "r2"], () => rows, { here: () => ["r1", "r2"] });
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
    // Deleted on the Mac before it quit, while the forget couldn't get through.
    const { runner, keys, forgetCloudRoutine } = make(["kept", "deleted-before-restart"], () => [row("kept")], {
      failForgets: 1,
      sentBefore: ["kept", "deleted-before-restart"],
    });
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

  it("leaves another computer's routines on the account alone, even with none here, and an old list of them unread", async () => {
    // An earlier version saved every key on the server as this computer's.
    const { runner, keys, forgetCloudRoutine } = make(["other-mac", "mine"], () => [row("mine")], { oldList: ["other-mac", "mine"] });
    await settle();
    await runner.routinesChanged();
    expect(forgetCloudRoutine).not.toHaveBeenCalled();
    expect(runner.stillInCloud("other-mac")).toBe(false);
    runner.destroy();

    const fresh = make(["other-mac"], () => [], { here: () => [] });
    await settle();
    expect(fresh.forgetCloudRoutine).not.toHaveBeenCalled();
    expect([...fresh.keys]).toEqual(["other-mac"]);
    expect([...keys].sort()).toEqual(["mine", "other-mac"]);
    fresh.runner.destroy();
  });

  it("takes away a routine whose send landed with its answer lost, once it's deleted, even after a restart", async () => {
    const first = make([], () => [row("r1")]);
    // The server stores it, the answer never comes back, and the connection is gone before its keys can be read.
    first.syncCloudRoutine.mockImplementationOnce(async (_token, sent) => {
      first.keys.add(sent.key);
      throw new Error("Couldn't reach Supabase.");
    });
    first.myCloudRoutineKeys.mockRejectedValue(new Error("Couldn't reach Supabase."));
    await settle();
    first.runner.destroy();
    // Deleted here before the next launch could hear about it.
    const { runner, forgetCloudRoutine } = make([...first.keys], () => [], {
      here: () => [],
      sentBefore: first.saved().routinesSentFromHere,
    });
    await settle();
    expect(forgetCloudRoutine).toHaveBeenCalledWith("token", "r1");
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
