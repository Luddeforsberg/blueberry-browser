import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { tryAiKey } from "./aiKeyTry";

const encryption = vi.hoisted(() => ({ available: true }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    encryptString: (text: string) => Buffer.from(Buffer.from(text).toString("hex")),
    decryptString: (data: Buffer) => Buffer.from(data.toString(), "hex").toString(),
  },
}));

const { AiKey } = await import("./AiKey");

const KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789-4f2A";
const fileIn = () => join(mkdtempSync(join(tmpdir(), "blueberry-ai-key-")), "ai-key.json");
const start = (answer: "works" | "refused" | "unreachable" = "works", file = fileIn()) => {
  const changes = vi.fn();
  const tries = vi.fn(async () => answer);
  return { store: new AiKey(file, changes, tries), changes, tries, file };
};

// No run of five characters from the key: the last four are all that may go to a renderer.
const carriesKey = (value: unknown) => {
  const text = JSON.stringify(value);
  return Array.from({ length: KEY.length - 4 }, (_, at) => KEY.slice(at, at + 5)).some((part) => text.includes(part));
};

describe("AiKey", () => {
  it("keeps a key that works, encrypted, and gives renderers only its service and last four characters", async () => {
    const { store, changes, file } = start();
    const tried = await store.try("openai", `  ${KEY}\n`);

    expect(tried).toEqual({ outcome: "works", state: { service: "openai", last4: "4f2A" } });
    expect(carriesKey(tried)).toBe(false);
    expect(carriesKey(store.state)).toBe(false);
    expect(changes).toHaveBeenCalledOnce();
    expect(store.inUse).toEqual({ service: "openai", key: KEY });
    expect(readFileSync(file, "utf8")).not.toContain(KEY);
    expect(new AiKey(file, () => {}).inUse).toEqual({ service: "openai", key: KEY });
  });

  it.each(["refused", "unreachable"] as const)("says a key the service %s and keeps nothing", async (answer) => {
    const { store, changes, file } = start(answer);
    expect(await store.try("anthropic", KEY)).toEqual({ outcome: answer, state: { service: null, last4: null } });
    expect(store.inUse).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(existsSync(file)).toBe(false);
  });

  it.each([
    ["an unknown service", "gemini", KEY],
    ["no key", "openai", undefined],
    ["a key that's too short", "openai", "sk-123"],
    ["a key that's too long", "openai", `sk-${"a".repeat(400)}`],
    ["a key with a space in it", "openai", "sk-proj-abcdefghij klmnopqrstuvwxyz"],
  ])("refuses %s without trying it", async (_, service, key) => {
    const { store, tries } = start();
    expect((await store.try(service, key)).outcome).toBe("not-a-key");
    expect(tries).not.toHaveBeenCalled();
  });

  it("doesn't send or keep a key this computer can't encrypt", async () => {
    encryption.available = false;
    try {
      const { store, tries } = start();
      expect((await store.try("openai", KEY)).outcome).toBe("not-safe");
      expect(tries).not.toHaveBeenCalled();
      expect(store.inUse).toBeNull();
    } finally {
      encryption.available = true;
    }
  });

  it("forgets the key on Remove, and a try that Remove overtook keeps nothing", async () => {
    const { store, file } = start();
    await store.try("openai", KEY);
    expect(store.remove()).toEqual({ service: null, last4: null });
    expect(existsSync(file)).toBe(false);

    let answer: (outcome: "works") => void = () => {};
    const slow = new AiKey(fileIn(), () => {}, () => new Promise((resolve) => (answer = resolve)));
    const trying = slow.try("openai", KEY);
    slow.remove();
    answer("works");
    expect((await trying).state).toEqual({ service: null, last4: null });
    expect(slow.inUse).toBeNull();
  });
});

describe("tryAiKey", () => {
  const answering = (status: number) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status }));

  it("sends one short message to the service's cheap model with the key", async () => {
    const fetch = answering(200);
    expect(await tryAiKey("openai", KEY, { fetch, env: {} })).toBe("works");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-6-luna" });

    const anthropic = answering(200);
    await tryAiKey("anthropic", KEY, { fetch: anthropic, env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:9/" } });
    const [anthropicUrl, anthropicInit] = anthropic.mock.calls[0];
    expect(anthropicUrl).toBe("http://127.0.0.1:9/v1/messages");
    expect(anthropicInit?.headers).toMatchObject({ "x-api-key": KEY });
  });

  it("tells a key the service turned down from a service it couldn't reach", async () => {
    expect(await tryAiKey("openai", KEY, { fetch: answering(401), env: {} })).toBe("refused");
    expect(await tryAiKey("openai", KEY, { fetch: answering(429), env: {} })).toBe("refused");
    expect(await tryAiKey("openai", KEY, { fetch: answering(503), env: {} })).toBe("unreachable");
    expect(await tryAiKey("openai", KEY, { fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))), env: {} })).toBe("unreachable");
  });
});
