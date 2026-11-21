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
// That session, as it's kept now.
const OLD_SESSION = { tag: "before-sess-1", id: "sess-1", by: "browserbase:proj" };
// What's saved: the key's file, and the sessions' beside it.
const savedIn = (file: string) => () => ({
  key: JSON.parse(readFileSync(file, "utf8")) as unknown,
  sessions: JSON.parse(readFileSync(join(dirname(file), "cloud-sessions.json"), "utf8")) as unknown,
});

// Browserbase as far as releasing goes, answering as `answer.now` says, and noting the key each release used.
const releasing = () => {
  const answer: { now: "ok" | "fails" | "refused" } = { now: "fails" };
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
            if (answer.now === "fails") throw new Error("Browserbase answered 500.");
            if (answer.now === "refused") throw new KeyRefused("Browserbase refused the API key.");
          },
        }
      : null;
  return { answer, calls, provider };
};

// The old key as it's kept now, once what came with it is in the sessions' file.
const OLD_KEY = { apiKey: OLD.apiKey, projectId: OLD.projectId };
const sessionsAt = (file: string) => join(dirname(file), "cloud-sessions.json");

describe("CloudTabs' key", () => {
  it("keeps the key until a session only it can end has ended", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj-2")).problem).toMatch(/didn't confirm it ended/);
    expect((await tabs.forget()).problem).toMatch(/didn't confirm it ended/);
    expect(saved()).toEqual({
      key: OLD_KEY,
      sessions: { contexts: { "browserbase:proj": "ctx-1" }, handles: [expect.objectContaining(OLD_SESSION)] },
    });

    answer.now = "ok";
    expect((await tabs.saveKey("bb_new", "proj-2")).problem).toBeNull();
    // The old project's Context stays, for a key from there.
    expect(saved()).toEqual({
      key: { apiKey: sealed("bb_new"), projectId: sealed("proj-2") },
      sessions: { contexts: { "browserbase:proj": "ctx-1" }, handles: [] },
    });
    expect(calls).toEqual(["bb_old sess-1", "bb_old sess-1", "bb_old sess-1"]);
    encryption.available = false;
  });

  it("keeps the key through a new one for the same project too, which might not work", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { calls, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/didn't confirm it ended/);
    expect(calls).toEqual(["bb_old sess-1"]);
    expect(savedIn(file)()).toMatchObject({ key: OLD_KEY, sessions: { handles: [expect.objectContaining(OLD_SESSION)] } });
    encryption.available = false;
  });

  it("takes a new key, or forgets one, when Browserbase no longer takes the old one, keeping its session until it's ended", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    answer.now = "refused";
    const tabs = makeTabs(file, provider);
    await tabs.saveKey("bb_new", "proj");
    expect(saved()).toMatchObject({ key: { apiKey: sealed("bb_new"), projectId: sealed("proj") }, sessions: { handles: [OLD_SESSION] } });
    // Ended once more, with the new key, which is for the same project.
    expect(calls).toEqual(["bb_old sess-1", "bb_new sess-1"]);
    expect((await tabs.forget()).problem).toMatch(/ends on its own within an hour/);
    expect(saved()).toMatchObject({ key: { apiKey: null, projectId: null }, sessions: { handles: [OLD_SESSION] } });
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

  it("never ends, or forgets, a session through a key for another project", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    answer.now = "refused";
    const tabs = makeTabs(file, provider);
    await tabs.saveKey("bb_other", "proj-2");
    answer.now = "ok";
    await tabs.end();
    expect(calls).toEqual(["bb_old sess-1"]);
    expect(saved()).toMatchObject({ key: { projectId: sealed("proj-2") }, sessions: { handles: [OLD_SESSION] } });
    // A key for its own project ends it.
    await tabs.saveKey("bb_again", "proj");
    expect(calls).toEqual(["bb_old sess-1", "bb_again sess-1"]);
    expect(saved()).toMatchObject({ sessions: { handles: [] } });
    encryption.available = false;
  });

  it("says to press End again only while there's still something to end", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { answer, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj-2")).problem).toMatch(/Press End again first/);
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
    writeFileSync(
      sessionsAt(file),
      JSON.stringify({ contexts: { "browserbase:proj": "ctx-1" }, handles: [{ ...OLD_SESSION, until: 1e15 }] }),
    );
    const { provider } = releasing();
    makeTabs(file, provider);
    expect(savedIn(file)()).toEqual({
      key: OLD_KEY,
      sessions: { contexts: { "browserbase:proj": "ctx-1" }, handles: [expect.objectContaining(OLD_SESSION)] },
    });

    // An app before this one opened again, with a key for another project, its own Context and a session.
    writeFileSync(file, JSON.stringify({ apiKey: sealed("bb_b"), projectId: sealed("proj-b"), contextId: "ctx-b", sessionId: "sess-b" }));
    const tabs = makeTabs(file, provider);
    expect(tabs.contextId).toBe("ctx-b");
    expect(savedIn(file)()).toEqual({
      key: { apiKey: sealed("bb_b"), projectId: sealed("proj-b") },
      sessions: {
        contexts: { "browserbase:proj": "ctx-1", "browserbase:proj-b": "ctx-b" },
        handles: [expect.objectContaining(OLD_SESSION), expect.objectContaining({ id: "sess-b", by: "browserbase:proj-b" })],
      },
    });
    encryption.available = false;
  });

  it("writes nothing, and starts nothing, while a file it has can't be read, and says so", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD_KEY));
    writeFileSync(sessionsAt(file), "{ damaged");
    const { answer, calls, provider } = releasing();
    answer.now = "ok";
    const tabs = makeTabs(file, provider);
    expect(tabs.state.problem).toMatch(/couldn't read its cloud settings/);
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/couldn't read its cloud settings/);
    expect((await tabs.forget()).problem).toMatch(/couldn't read its cloud settings/);
    expect(tabs.claim("job-1")).toBe(true);
    await expect(tabs.open("job-1", "https://example.com/")).rejects.toThrow(/couldn't be saved, so no cloud session was started/);
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(OLD_KEY));
    expect(readFileSync(sessionsAt(file), "utf8")).toBe("{ damaged");
    expect(calls).toEqual([]);
    encryption.available = false;
  });

  it("leaves both files as they are while a session from before can't be said to be whose", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const { provider } = releasing();
    encryption.broken = true;
    const tabs = makeTabs(file, provider);
    encryption.broken = false;
    expect(tabs.state.problem).toMatch(/couldn't read its cloud settings/);
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(OLD));
    // Once it can be opened again, the session comes over.
    makeTabs(file, provider);
    expect(savedIn(file)()).toMatchObject({ key: OLD_KEY, sessions: { handles: [OLD_SESSION] } });
    encryption.available = false;
  });
});
