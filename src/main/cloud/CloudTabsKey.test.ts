import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { KeyRefused } from "./cloudProvider";
import type { Provider } from "./cloudTabsTesting";

// The key and the sessions it may still have to end, on disk.

// `broken` is a system that can no longer open what it sealed.
const encryption = vi.hoisted(() => ({ available: false, broken: false }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (sealed: Buffer) => {
      if (encryption.broken) throw new Error("It can't be opened.");
      return sealed.toString();
    },
  },
  app: { isPackaged: true },
}));

const { makeTabs, tempFile } = await import("./cloudTabsTesting");

// Sealed as the mocked safeStorage seals, which is no more than base64.
const sealed = (text: string) => Buffer.from(text).toString("base64");
// As the app before handles saved it, with only the session's id.
const OLD = { apiKey: sealed("bb_old"), projectId: sealed("proj"), contextId: "ctx-1", sessionId: "sess-1" };
// That session, as it's kept now, with the key it was kept with.
const OLD_SESSION = { tag: "before-sess-1", id: "sess-1", by: "browserbase:proj", keyId: "before-sess-1" };
const OLD_KEYS = { "before-sess-1": { apiKey: sealed("bb_old"), by: "browserbase:proj" } };
// What's saved: the key's file, and the sessions' beside it.
const savedIn = (file: string) => () => ({
  key: JSON.parse(readFileSync(file, "utf8")) as unknown,
  sessions: JSON.parse(readFileSync(join(dirname(file), "cloud-sessions.json"), "utf8")) as unknown,
});

// Browserbase as far as releasing goes, answering as `answer.now` says, refusing the keys in `answer.refused`, and
// noting the key each release used.
const releasing = () => {
  const answer: { now: "ok" | "fails" | "refused"; refused: Set<string> } = { now: "fails", refused: new Set() };
  const calls: string[] = [];
  const provider: Provider = ({ apiKey, projectId }) =>
    apiKey
      ? {
          name: "browserbase",
          origin: `browserbase:${projectId}`,
          // Asks for its tag, as Browserbase does before anything is sent, and goes no further.
          create: async (_ids, hooks) => {
            hooks.tag(Date.now() + 60_000);
            throw new Error("Not in this test.");
          },
          releaseTagged: async () => Promise.reject(new Error("Not in this test.")),
          release: async (id) => {
            calls.push(`${apiKey} ${id}`);
            if (answer.now === "refused" || answer.refused.has(apiKey)) throw new KeyRefused("Browserbase refused the API key.");
            if (answer.now === "fails") throw new Error("Browserbase answered 500.");
          },
        }
      : null;
  return { answer, calls, provider };
};

// The old key as it's kept now, once what came with it is in the sessions' file.
const OLD_KEY = { apiKey: OLD.apiKey, projectId: OLD.projectId };
const NO_KEY = { apiKey: null, projectId: null };
const sessionsAt = (file: string) => join(dirname(file), "cloud-sessions.json");

describe("CloudTabs' key", () => {
  it("takes a new key at once, and ends a session from before with the key it was made with", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj-2")).problem).toMatch(/may still be running/);
    expect(saved()).toEqual({
      key: { apiKey: sealed("bb_new"), projectId: sealed("proj-2") },
      sessions: { contexts: { "browserbase:proj": "ctx-1" }, handles: [expect.objectContaining(OLD_SESSION)], keys: OLD_KEYS },
    });

    answer.now = "ok";
    expect((await tabs.end()).problem).toBeNull();
    // The key goes with its last session, and the old project's Context stays, for a key from there.
    expect(saved()).toEqual({
      key: { apiKey: sealed("bb_new"), projectId: sealed("proj-2") },
      sessions: { contexts: { "browserbase:proj": "ctx-1" }, handles: [], keys: {} },
    });
    expect(new Set(calls)).toEqual(new Set(["bb_old sess-1"]));
    encryption.available = false;
  });

  it("ends a session with the new key for its project once Browserbase no longer takes the key it was made with", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { answer, calls, provider } = releasing();
    answer.now = "ok";
    answer.refused.add("bb_old");
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj")).problem).toBeNull();
    expect(calls.slice(-2)).toEqual(["bb_old sess-1", "bb_new sess-1"]);
    expect(savedIn(file)()).toMatchObject({ key: { apiKey: sealed("bb_new") }, sessions: { handles: [], keys: {} } });
    encryption.available = false;
  });

  it("forgets a key at once, keeping each session with the key it was made with until it has ended", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    const confirmForget = vi.fn(async () => true);
    const tabs = makeTabs(file, provider, { confirmForget });
    const state = await tabs.forget();
    expect(state.configured).toBe(false);
    expect(state.unreleased).toBe(true);
    expect(saved()).toMatchObject({ key: NO_KEY, sessions: { handles: [OLD_SESSION], keys: OLD_KEYS } });
    answer.now = "ok";
    expect((await tabs.end()).canEnd).toBe(false);
    expect(saved()).toMatchObject({ sessions: { handles: [], keys: {} } });
    expect(new Set(calls)).toEqual(new Set(["bb_old sess-1"]));
    expect(confirmForget).not.toHaveBeenCalled();
    encryption.available = false;
  });

  it("says Browserbase ends a session itself once nothing here can", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { answer, provider } = releasing();
    answer.now = "refused";
    const tabs = makeTabs(file, provider);
    expect((await tabs.forget()).problem).toMatch(/ends on its own within an hour/);
    expect(savedIn(file)()).toMatchObject({ key: NO_KEY, sessions: { handles: [OLD_SESSION] } });
    encryption.available = false;
  });

  it("keeps every session it saved, however many, through a key that can't be opened, for the next key to end", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    const until = Date.now() + 60 * 60_000;
    const handles = Array.from({ length: 150 }, (_, i) => ({ tag: `t-${i}`, id: `sess-${i}`, by: "browserbase:proj", until }));
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: { "browserbase:proj": "ctx-1" }, handles }));
    const { answer, calls, provider } = releasing();
    answer.now = "ok";
    encryption.broken = true;
    const tabs = makeTabs(file, provider);
    encryption.broken = false;
    expect(tabs.state.configured).toBe(false);
    await tabs.saveKey("bb_new", "proj");
    expect(new Set(calls)).toEqual(new Set(handles.map(({ id }) => `bb_new ${id}`)));
    expect(savedIn(file)()).toMatchObject({ sessions: { handles: [] } });
    encryption.available = false;
  });

  it("never ends a session through a key for another project", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { answer, calls, provider } = releasing();
    answer.now = "ok";
    answer.refused.add("bb_old");
    const tabs = makeTabs(file, provider);
    await tabs.saveKey("bb_other", "proj-2");
    await tabs.end();
    expect(new Set(calls)).toEqual(new Set(["bb_old sess-1"]));
    expect(savedIn(file)()).toMatchObject({ key: { projectId: sealed("proj-2") }, sessions: { handles: [OLD_SESSION] } });
    // A key for its own project ends it.
    await tabs.saveKey("bb_again", "proj");
    expect(calls.at(-1)).toBe("bb_again sess-1");
    expect(savedIn(file)()).toMatchObject({ sessions: { handles: [] } });
    encryption.available = false;
  });

  it("says to try again only while there's still something to end", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { answer, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj-2")).unreleased).toBe(true);
    answer.now = "ok";
    const ended = await tabs.end();
    expect(ended.canEnd).toBe(false);
    expect(ended.problem).toBeNull();
    encryption.available = false;
  });

  it("keeps each project's Context through a key for another, so its sign-ins are there when it comes back", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: { "browserbase:proj": "ctx-1" }, handles: [] }));
    const { answer, provider } = releasing();
    answer.now = "ok";
    const tabs = makeTabs(file, provider);
    expect(tabs.contextId).toBe("ctx-1");
    await tabs.saveKey("bb_other", "proj-2");
    expect(tabs.contextId).toBeNull();
    // As a launch after a crash at any point would find it, since a key's save is one write.
    expect(makeTabs(file, provider).contextId).toBeNull();
    await tabs.saveKey("bb_back", "proj");
    expect(tabs.contextId).toBe("ctx-1");
    encryption.available = false;
  });

  it("brings over a session and Context from an app before this one on every launch, and takes them out of its file only once kept", async () => {
    encryption.available = true;
    const file = tempFile();
    // As a crash leaves it after the sessions' file was written and before the key's was: the session is in both.
    writeFileSync(file, JSON.stringify(OLD));
    const kept = { contexts: { "browserbase:proj": "ctx-1" }, handles: [{ ...OLD_SESSION, until: 1e15 }], keys: OLD_KEYS };
    writeFileSync(sessionsAt(file), JSON.stringify(kept));
    const { provider } = releasing();
    makeTabs(file, provider);
    expect(savedIn(file)()).toEqual({ key: OLD_KEY, sessions: { ...kept, handles: [expect.objectContaining(OLD_SESSION)] } });

    // An app before this one opened again, with a key for another project, its own Context and a session.
    writeFileSync(file, JSON.stringify({ apiKey: sealed("bb_b"), projectId: sealed("proj-b"), contextId: "ctx-b", sessionId: "sess-b" }));
    const tabs = makeTabs(file, provider);
    expect(tabs.contextId).toBe("ctx-b");
    expect(savedIn(file)()).toEqual({
      key: { apiKey: sealed("bb_b"), projectId: sealed("proj-b") },
      sessions: {
        contexts: { "browserbase:proj": "ctx-1", "browserbase:proj-b": "ctx-b" },
        handles: [
          expect.objectContaining(OLD_SESSION),
          expect.objectContaining({ id: "sess-b", by: "browserbase:proj-b", keyId: "before-sess-b" }),
        ],
        keys: { ...OLD_KEYS, "before-sess-b": { apiKey: sealed("bb_b"), by: "browserbase:proj-b" } },
      },
    });
    encryption.available = false;
  });

  it("writes nothing, and starts nothing, while a file it has can't be read, unless the user forgets the key", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    writeFileSync(sessionsAt(file), "{ damaged");
    const { answer, calls, provider } = releasing();
    answer.now = "ok";
    const tabs = makeTabs(file, provider, { confirmForget: async () => false });
    expect(tabs.state).toMatchObject({ unreadable: true, problem: expect.stringMatching(/couldn't read its cloud settings/) });
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/couldn't read its cloud settings/);
    expect((await tabs.forget()).unreadable).toBe(true);
    expect(tabs.claim("job-1")).toBe(true);
    await expect(tabs.open("job-1", "https://example.com/")).rejects.toThrow(/couldn't be saved, so no cloud session was started/);
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(OLD_KEY));
    expect(readFileSync(sessionsAt(file), "utf8")).toBe("{ damaged");
    expect(calls).toEqual([]);
    encryption.available = false;
  });

  it("starts over after a keychain reset once the user forgets the key, dropping only what it can't read", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const until = Date.now() + 60 * 60_000;
    const readable = { tag: "t-1", id: "sess-2", by: "browserbase:proj", until };
    const sealedAway = { tag: "t-2", id: "sess-3", by: "browserbase:proj-2", keyId: "k", until };
    const keys = { k: { apiKey: sealed("bb_2"), by: "browserbase:proj-2" } };
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: {}, handles: [readable, sealedAway], keys }));
    const { answer, provider } = releasing();
    answer.now = "ok";
    const confirmForget = vi.fn(async () => false);
    encryption.broken = true;
    const tabs = makeTabs(file, provider, { confirmForget });
    expect(tabs.state.unreadable).toBe(true);
    await tabs.forget();
    expect(confirmForget).toHaveBeenCalledOnce();
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(OLD));

    confirmForget.mockResolvedValue(true);
    const state = await tabs.forget();
    encryption.broken = false;
    expect(state).toMatchObject({ unreadable: false, configured: false, problem: null });
    expect(savedIn(file)()).toEqual({ key: NO_KEY, sessions: { contexts: {}, handles: [{ ...readable, keyId: null }], keys: {} } });
    expect((await tabs.saveKey("bb_new", "proj")).problem).toBeNull();
    encryption.available = false;
  });

  it("reads both files again when the user agrees to forget, and keeps whatever reads by then", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    writeFileSync(sessionsAt(file), "{ damaged");
    const handle = { tag: "t-1", id: "sess-2", by: "browserbase:proj", keyId: "k", until: Date.now() + 60 * 60_000 };
    const kept = {
      contexts: { "browserbase:proj": "ctx-2" },
      handles: [handle],
      keys: { k: { apiKey: sealed("bb_2"), by: "browserbase:proj" } },
    };
    const { provider } = releasing();
    // The file reads again by the time the user answers, as after a passing fault.
    const confirmForget = vi.fn(async () => {
      writeFileSync(sessionsAt(file), JSON.stringify(kept));
      return true;
    });
    const tabs = makeTabs(file, provider, { confirmForget });
    expect(tabs.state.unreadable).toBe(true);
    expect((await tabs.forget()).unreadable).toBe(false);
    expect(confirmForget).toHaveBeenCalledOnce();
    expect(savedIn(file)()).toEqual({ key: NO_KEY, sessions: kept });
    encryption.available = false;
  });

  it("takes a session long gone, and a key no session names, out of the file as it launches", () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    const live = { tag: "t-1", id: "sess-2", by: "browserbase:proj", keyId: "k", until: Date.now() + 60 * 60_000 };
    const gone = { tag: "t-2", id: "sess-3", by: "browserbase:proj", keyId: "k2", until: Date.now() - 7 * 60 * 60_000 };
    const key = (text: string) => ({ apiKey: sealed(text), by: "browserbase:proj" });
    const keys = { k: key("bb_2"), k2: key("bb_3"), k3: key("bb_4") };
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: {}, handles: [live, gone], keys }));
    makeTabs(file, releasing().provider);
    expect(savedIn(file)().sessions).toEqual({ contexts: {}, handles: [live], keys: { k: keys.k } });
    encryption.available = false;
  });

  it("asks first before forgetting a session whose key it doesn't have, and keeps it if the user says no", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    const handle = { tag: "t-1", id: "sess-2", by: "browserbase:proj-2", keyId: "k", until: Date.now() + 60_000 };
    // Its key isn't kept, as a file someone edited would have it.
    const kept = { contexts: {}, handles: [handle], keys: {} };
    writeFileSync(sessionsAt(file), JSON.stringify(kept));
    const { provider } = releasing();
    const tabs = makeTabs(file, provider, { confirmForget: async () => false });
    expect(tabs.state).toMatchObject({ unreadable: false, configured: true });
    expect((await tabs.forget()).configured).toBe(true);
    expect(savedIn(file)()).toEqual({ key: OLD_KEY, sessions: kept });
    encryption.available = false;
  });

  it("keeps a key sealed on disk and out of what Settings and the log are told", async () => {
    encryption.available = true;
    const file = tempFile();
    const { provider } = releasing();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const tabs = makeTabs(file, provider);
    await tabs.saveKey("bb_secret", "proj");
    expect(tabs.claim("job-1")).toBe(true);
    await expect(tabs.open("job-1", "https://example.com/")).rejects.toThrow();
    const { sessions } = savedIn(file)() as { sessions: { handles: unknown[] } };
    expect(sessions.handles).toHaveLength(1);
    const seen = [
      readFileSync(file, "utf8"),
      readFileSync(sessionsAt(file), "utf8"),
      JSON.stringify(tabs.state),
      JSON.stringify(logged.mock.calls),
    ];
    for (const text of seen) expect(text).not.toContain("bb_secret");
    logged.mockRestore();
    encryption.available = false;
  });
});
