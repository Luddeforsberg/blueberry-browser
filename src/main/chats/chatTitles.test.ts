import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTitle } from "./agent";
import { replying, send, setup } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("titles", () => {
    const turn = async (context: ReturnType<typeof setup>, chatId: string | null, text: string) => {
      const ended = context.replyEnded();
      const thread = send(context.chats, chatId, text, false)!;
      await ended;
      // The title is asked for after the reply ends.
      await new Promise((resolve) => setTimeout(resolve));
      return thread.id;
    };

    it("keeps the first message until the model finds a topic, then asks no more", async () => {
      const generate = vi.fn<GenerateTitle>(async () => null);
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "hey");
      expect(context.chats.thread(id)?.title).toBe("hey");

      generate.mockResolvedValue("Trip to Porto");
      await turn(context, id, "plan a trip");
      expect(context.chats.thread(id)?.title).toBe("Trip to Porto");
      expect(context.threads.at(-1)?.title).toBe("Trip to Porto");

      await turn(context, id, "and food");
      expect(generate).toHaveBeenCalledTimes(2);
    });

    it("gives up after five messages with no topic", async () => {
      const generate = vi.fn<GenerateTitle>(async () => null);
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "1");
      for (const text of ["2", "3", "4", "5", "6"]) await turn(context, id, text);

      expect(generate).toHaveBeenCalledTimes(5);
    });

    it("doesn't ask when the reply failed or the user named the chat", async () => {
      const generate = vi.fn<GenerateTitle>(async () => "Generated");
      const failing = setup(
        () => {
          throw new Error("boom");
        },
        null,
        generate,
      );
      await turn(failing, null, "first");
      expect(generate).not.toHaveBeenCalled();

      const named = setup(replying("ok"), null, generate);
      const ended = named.replyEnded();
      const { id } = send(named.chats, null, "first", false)!;
      named.chats.rename(id, "Mine");
      await ended;
      await new Promise((resolve) => setTimeout(resolve));
      expect(generate).not.toHaveBeenCalled();
      expect(named.chats.thread(id)?.title).toBe("Mine");
    });

    it("keeps the user's name if they rename while a title is being generated", async () => {
      let finish: (title: string) => void = () => {};
      const generate: GenerateTitle = () => new Promise((resolve) => (finish = resolve));
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "first");
      context.chats.rename(id, "Mine");
      finish("Generated");
      await new Promise((resolve) => setTimeout(resolve));

      expect(context.chats.thread(id)?.title).toBe("Mine");
    });

    it("survives a failed title", async () => {
      const context = setup(replying("ok"), null, async () => {
        throw new Error("no such model");
      });

      const id = await turn(context, null, "first");

      expect(context.chats.thread(id)).toMatchObject({ title: "first", error: null });
    });
  });
});
