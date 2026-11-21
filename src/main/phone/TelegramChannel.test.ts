import { getEventListeners } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sleep, TelegramChannel, telegramApiBase } from "./TelegramChannel";

// Removing the bot's file can fail, as when something else has it open.
const removal = vi.hoisted(() => ({ fails: false }));
vi.mock("../library/savedFile", async (original) => {
  const real = await original<typeof import("../library/savedFile")>();
  return {
    ...real,
    removeFile: (...args: Parameters<typeof real.removeFile>) => (removal.fails ? (false as never) : real.removeFile(...args)),
  };
});

vi.mock("electron", () => ({
  app: { isPackaged: true },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (bytes: Buffer) => bytes.toString(),
  },
}));

const LIVE = "https://api.telegram.org";

describe("telegramApiBase", () => {
  it("only lets an unpackaged app point at this computer", () => {
    expect(telegramApiBase("http://127.0.0.1:1234/", false)).toBe("http://127.0.0.1:1234");
    expect(telegramApiBase("http://127.0.0.1:1234", true)).toBe(LIVE);
    expect(telegramApiBase("https://evil.example", false)).toBe(LIVE);
    expect(telegramApiBase("http://127.0.0.1.evil.example", false)).toBe(LIVE);
    expect(telegramApiBase("not an address", false)).toBe(LIVE);
    expect(telegramApiBase(undefined, false)).toBe(LIVE);
  });
});

describe("sleep", () => {
  it("leaves no listener on the signal, whether it wakes on time or on abort", async () => {
    const polling = new AbortController();
    for (let round = 0; round < 3; round++) await sleep(1, polling.signal);
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(0);

    const waiting = sleep(60_000, polling.signal);
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(1);
    polling.abort();
    await waiting;
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(0);
  });
});

describe("TelegramChannel", () => {
  const A = "111111:AAAAAAAAAAAAAAAAAAAAAAAAAA";
  const B = "222222:BBBBBBBBBBBBBBBBBBBBBBBBBB";
  // Telegram, with each bot's own name, and A's check held until `answerA`.
  const fakeTelegram = () => {
    let answerA = () => {};
    const heldA = new Promise<void>((resolve) => (answerA = resolve));
    const fetch = vi.fn(async (url: string, { signal }: RequestInit) => {
      if (url.endsWith("/getMe")) {
        if (url.includes(A)) await heldA;
        return Response.json({ ok: true, result: { username: url.includes(A) ? "bot_a" : "bot_b" } });
      }
      // Polling waits until it's stopped.
      return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped"))));
    });
    vi.stubGlobal("fetch", fetch);
    return { answerA, polls: () => fetch.mock.calls.filter(([url]) => url.endsWith("/getUpdates")).length };
  };
  const folder = () => mkdtempSync(join(tmpdir(), "phone-"));

  it("keeps nothing from a token check that answers after the window closed, even once the next one has a bot", async () => {
    const telegram = fakeTelegram();
    const channel = new TelegramChannel(join(folder(), "phone.json"), () => {}, "http://127.0.0.1:1");
    const first = channel.connect(A);
    channel.close();
    channel.start();
    expect((await channel.connect(B)).botName).toBe("bot_b");
    telegram.answerA();
    await first;
    expect(channel.state.botName).toBe("bot_b");
    channel.close();
    vi.unstubAllGlobals();
  });

  it("keeps nothing from a token check that answers after Disconnect, and says how things are now", async () => {
    const telegram = fakeTelegram();
    const channel = new TelegramChannel(join(folder(), "phone.json"), () => {}, "http://127.0.0.1:1");
    const checking = channel.connect(A);
    channel.disconnect();
    telegram.answerA();
    expect(await checking).toMatchObject({ status: "off", botName: null, problem: null });
    expect(channel.state.botName).toBeNull();
    expect(telegram.polls()).toBe(0);
    vi.unstubAllGlobals();
  });

  it("gives a check that failed after a newer one connected the newer one's state, not its failure", async () => {
    let failA = () => {};
    const heldA = new Promise<void>((resolve) => (failA = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, { signal }: RequestInit) => {
        if (url.endsWith("/getMe")) {
          if (url.includes(A)) {
            await heldA;
            return Response.json({ ok: false }, { status: 401 });
          }
          return Response.json({ ok: true, result: { username: "bot_b" } });
        }
        return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped"))));
      }),
    );
    const channel = new TelegramChannel(join(folder(), "phone.json"), () => {}, "http://127.0.0.1:1");
    const first = channel.connect(A);
    expect((await channel.connect(B)).botName).toBe("bot_b");
    failA();
    expect(await first).toMatchObject({ status: "pairing", botName: "bot_b", problem: null });
    channel.close();
    vi.unstubAllGlobals();
  });

  it("listens again in the next window for a bot whose file couldn't be written", async () => {
    const telegram = fakeTelegram();
    // A file where its folder should be, so nothing can be saved there.
    const blocked = join(folder(), "blocked");
    writeFileSync(blocked, "");
    const channel = new TelegramChannel(join(blocked, "phone.json"), () => {}, "http://127.0.0.1:1");
    expect((await channel.connect(B)).status).toBe("pairing");
    channel.close();
    const before = telegram.polls();
    channel.start();
    await vi.waitFor(() => expect(telegram.polls()).toBeGreaterThan(before));
    channel.close();
    vi.unstubAllGlobals();
  });

  it("says nothing about a connection that has closed when a message sent on it fails", async () => {
    const file = join(folder(), "phone.json");
    // Sealed as the mocked safeStorage seals, which is no more than base64.
    writeFileSync(file, JSON.stringify({ token: Buffer.from(B).toString("base64"), botName: "bot_b", chatId: 7 }));
    const held: { fail: (() => void) | null } = { fail: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, { signal }: RequestInit) => {
        if (url.endsWith("/sendMessage")) {
          await new Promise<void>((resolve) => (held.fail = resolve));
          throw new Error("offline");
        }
        return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped"))));
      }),
    );
    const channel = new TelegramChannel(file, () => {}, "http://127.0.0.1:1");
    channel.start();
    const sending = channel.send("Berry needs you");
    await vi.waitFor(() => expect(held.fail).not.toBeNull());
    // The window closes, and the next one connects again before the old message fails.
    channel.close();
    channel.start();
    held.fail?.();
    expect(await sending).toBeNull();
    expect(channel.state.problem).toBeNull();
    channel.close();
    vi.unstubAllGlobals();
  });

  it("keeps a message's handle when the window reconnects to the same chat before the send answers", async () => {
    const file = join(folder(), "phone.json");
    writeFileSync(file, JSON.stringify({ token: Buffer.from(B).toString("base64"), botName: "bot_b", chatId: 7 }));
    const held: { finish: (() => void) | null } = { finish: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, { signal }: RequestInit) => {
        if (url.endsWith("/sendMessage")) {
          await new Promise<void>((resolve) => (held.finish = resolve));
          return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
        }
        return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped"))));
      }),
    );
    const channel = new TelegramChannel(file, () => {}, "http://127.0.0.1:1");
    channel.start();
    const sending = channel.send("Berry needs you");
    await vi.waitFor(() => expect(held.finish).not.toBeNull());
    channel.close();
    channel.start();
    held.finish?.();
    // Still this chat's message, so settling it edits it rather than sending it again.
    expect(await sending).toBe("7:42");
    channel.close();
    vi.unstubAllGlobals();
  });

  it("edits a message only in the chat it was sent to", async () => {
    const file = join(folder(), "phone.json");
    writeFileSync(file, JSON.stringify({ token: Buffer.from(B).toString("base64"), botName: "bot_b", chatId: 7 }));
    const fetch = vi.fn(async (url: string, { signal }: RequestInit) => {
      if (url.endsWith("/sendMessage")) return Response.json({ ok: true, result: { message_id: 42 } });
      if (url.endsWith("/editMessageText")) return Response.json({ ok: true, result: true });
      return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped"))));
    });
    vi.stubGlobal("fetch", fetch);
    const channel = new TelegramChannel(file, () => {}, "http://127.0.0.1:1");
    channel.start();
    const handle = await channel.send("Berry needs you");
    expect(handle).toBe("7:42");
    const edits = () => fetch.mock.calls.filter(([url]) => url.endsWith("/editMessageText"));
    // A handle from a chat that isn't paired now, with a message number this chat also has.
    await channel.edit("8:42", "Allowed.");
    await channel.edit("42", "Allowed.");
    expect(edits()).toHaveLength(0);
    await channel.edit(handle ?? "", "Allowed.");
    expect(edits()).toHaveLength(1);
    const body = edits()[0]?.[1]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : null).toMatchObject({ chat_id: 7, message_id: 42 });
    channel.close();
    vi.unstubAllGlobals();
  });

  it("stays disconnected in the next window when the bot's file couldn't be removed", async () => {
    const telegram = fakeTelegram();
    const file = join(folder(), "phone.json");
    writeFileSync(file, JSON.stringify({ token: Buffer.from(B).toString("base64"), botName: "bot_b", chatId: 7 }));
    const channel = new TelegramChannel(file, () => {}, "http://127.0.0.1:1");
    channel.start();
    await vi.waitFor(() => expect(telegram.polls()).toBe(1));
    removal.fails = true;
    try {
      expect(channel.disconnect().status).toBe("off");
    } finally {
      removal.fails = false;
    }
    channel.close();
    channel.start();
    expect(channel.state).toMatchObject({ status: "off", botName: null });
    expect(telegram.polls()).toBe(1);
    channel.close();
    vi.unstubAllGlobals();
  });
});
