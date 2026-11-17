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
    expect(await store.try("openai", KEY)).toEqual({ outcome: answer, state: { service: null, last4: null } });
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
    ["something that isn't a key, such as a password", "openai", "this-is-my-bank-password-123"],
    ["the other service's key", "openai", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"],
    ["a key without its service's prefix", "anthropic", KEY],
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
  const ANSWERS = { openai: { choices: [{ message: { content: "Hello." } }] }, anthropic: { content: [{ type: "text", text: "Hello." }] } };
  const answering = (status: number, body: unknown = {}) => vi.fn<typeof fetch>(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));

  it("sends one short message to the service's cheap model with the key", async () => {
    const fetch = answering(200, ANSWERS.openai);
    expect(await tryAiKey("openai", KEY, { fetch, env: {} })).toBe("works");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-6-luna" });

    const anthropic = answering(200, ANSWERS.anthropic);
    expect(await tryAiKey("anthropic", KEY, { fetch: anthropic, env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:9/" } })).toBe("works");
    const [anthropicUrl, anthropicInit] = anthropic.mock.calls[0];
    expect(anthropicUrl).toBe("http://127.0.0.1:9/v1/messages");
    expect(anthropicInit?.headers).toMatchObject({ "x-api-key": KEY });
  });

  it("only goes to the service's own address when told to, whatever the environment says", async () => {
    const env = { OPENAI_BASE_URL: "https://elsewhere.example/v1", ANTHROPIC_BASE_URL: "https://elsewhere.example" };
    const openai = answering(200, ANSWERS.openai);
    await tryAiKey("openai", KEY, { fetch: openai, env, ownAddressOnly: true });
    expect(openai.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const anthropic = answering(200, ANSWERS.anthropic);
    await tryAiKey("anthropic", KEY, { fetch: anthropic, env, ownAddressOnly: true });
    expect(anthropic.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it.each([
    ["an empty reply", 204, undefined],
    ["a reply with nothing in it", 200, {}],
    ["a reply with no answer in it", 200, { choices: [] }],
    ["the other service's kind of answer", 200, ANSWERS.anthropic],
  ])("doesn't take %s for a key that works", async (_, status, body) => {
    expect(await tryAiKey("openai", KEY, { fetch: answering(status, body), env: {} })).toBe("unreachable");
  });

  it("tells a key the service turned down from a service it couldn't reach", async () => {
    expect(await tryAiKey("openai", KEY, { fetch: answering(401), env: {} })).toBe("refused");
    expect(await tryAiKey("openai", KEY, { fetch: answering(429), env: {} })).toBe("refused");
    expect(await tryAiKey("openai", KEY, { fetch: answering(503), env: {} })).toBe("unreachable");
    expect(await tryAiKey("openai", KEY, { fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))), env: {} })).toBe("unreachable");
  });
});
