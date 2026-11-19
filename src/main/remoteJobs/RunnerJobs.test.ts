import { describe, expect, it, vi } from "vitest";
import { ANA, BO, LIVE, settle, setUp } from "./runnerJobsTesting";

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
