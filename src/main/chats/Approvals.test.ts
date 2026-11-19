import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamReply } from "./agent";
import { send, setup } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("approvals", () => {
    const asking = (answers: boolean[]): StreamReply =>
      async function* (_, __, { approve }) {
        answers.push(await approve("Click “Buy” on a.com"));
        yield "done";
      };

    it("shows the request until it's answered, and takes one answer", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval?.text).toBe("Click “Buy” on a.com"));
      const approval = threads.at(-1)!.approval!;

      expect(chats.decide(id, "wrong", true)).toBe(false);
      expect(answers).toEqual([]);
      expect(chats.decide(id, approval.id, true)).toBe(true);
      expect(chats.decide(id, approval.id, false)).toBe(false);
      await ended;

      expect(answers).toEqual([true]);
      expect(chats.thread(id)?.approval).toBeNull();
    });

    it("treats anything but true as no", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval).not.toBeNull());

      chats.decide(id, threads.at(-1)!.approval!.id, "yes" as unknown as boolean);
      await ended;

      expect(answers).toEqual([false]);
    });

    it("ends the reply with no action when stopped while waiting", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval).not.toBeNull());
      const approvalId = threads.at(-1)!.approval!.id;

      chats.stop(id);
      await ended;

      expect(answers).toEqual([]);
      expect(chats.thread(id)).toMatchObject({ partial: null, approval: null, error: null });
      expect(chats.decide(id, approvalId, true)).toBe(false);
    });
  });
});
