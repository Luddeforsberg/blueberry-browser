import { describe, expect, it } from "vitest";
import { ANA, BO, settle, setUp } from "./runnerJobsTesting";

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
    const calls = (
      server.startCloudJob as unknown as { mock: { calls: [string, { prompt: string; history: unknown[]; afterJobId: string | null }][] } }
    ).mock.calls;
    // Refused once as built on job-1, then sent after job-2 with its exchange.
    expect(calls.slice(-2).map(([, job]) => [job.prompt, job.afterJobId])).toEqual([
      ["Thanks", "job-1"],
      ["Thanks", "job-2"],
    ]);
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
