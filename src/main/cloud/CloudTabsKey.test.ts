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
          create: async () => Promise.reject(new Error("Not in this test.")),
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

describe("CloudTabs' key", () => {
  it("keeps the key, and the session's id, until the session it may still be running on has ended", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = savedIn(file);
    const { answer, calls, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/didn't confirm it ended/);
    expect((await tabs.forget()).problem).toMatch(/didn't confirm it ended/);
    expect(saved()).toMatchObject({ key: OLD, sessions: { contextId: "ctx-1", handles: [OLD_SESSION] } });

    answer.now = "ok";
    expect((await tabs.saveKey("bb_new", "proj")).problem).toBeNull();
    expect(saved()).toEqual({ key: { apiKey: sealed("bb_new"), projectId: sealed("proj") }, sessions: { contextId: null, handles: [] } });
    expect(calls).toEqual(["bb_old sess-1", "bb_old sess-1", "bb_old sess-1"]);
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
    expect(saved()).toMatchObject({
      key: { apiKey: sealed("bb_new"), projectId: sealed("proj") },
      sessions: { contextId: null, handles: [OLD_SESSION] },
    });
    // Ended once more, with the new key, which is for the same project.
    expect(calls).toEqual(["bb_old sess-1", "bb_new sess-1"]);
    expect((await tabs.forget()).problem).toMatch(/ends on its own within an hour/);
    expect(saved()).toMatchObject({ key: { apiKey: null, projectId: null }, sessions: { contextId: null, handles: [OLD_SESSION] } });
    encryption.available = false;
  });

  it("keeps every session it saved, however many, through a key that can't be opened, for the next key to end", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify({ apiKey: sealed("bb_old"), projectId: sealed("proj") }));
    const until = Date.now() + 60 * 60_000;
    const handles = Array.from({ length: 150 }, (_, i) => ({ tag: `t-${i}`, id: `sess-${i}`, by: "browserbase:proj", until }));
    writeFileSync(join(dirname(file), "cloud-sessions.json"), JSON.stringify({ contextId: "ctx-1", handles }));
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
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/Press End again first/);
    answer.now = "ok";
    const ended = await tabs.end();
    expect(ended.canEnd).toBe(false);
    expect(ended.problem).toBeNull();
    encryption.available = false;
  });
});
