import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "./cloudTabsTesting";

// Saving a key, when sealing it or keeping what it ends fails partway.

// `sealFails` is a system that says it can seal, then can't.
const encryption = vi.hoisted(() => ({ sealFails: false }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => {
      if (encryption.sealFails) throw new Error("It can't be sealed.");
      return Buffer.from(text);
    },
    decryptString: (sealed: Buffer) => sealed.toString(),
  },
  app: { isPackaged: true },
}));

const { makeTabs, tempFile } = await import("./cloudTabsTesting");

const sealed = (text: string) => Buffer.from(text).toString("base64");
const sessionsAt = (file: string) => join(dirname(file), "cloud-sessions.json");
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
// Browserbase for any key, whose releases fail, so a session stays to show the key it's kept with.
const provider: Provider = ({ apiKey, projectId }) =>
  apiKey
    ? {
        name: "browserbase",
        origin: `browserbase:${projectId}`,
        create: async () => Promise.reject(new Error("Not in this test.")),
        releaseTagged: async () => Promise.reject(new Error("Not in this test.")),
        release: async () => Promise.reject(new Error("Browserbase answered 500.")),
      }
    : null;
const A_KEY = { apiKey: sealed("bb_a"), projectId: sealed("proj-a") };

describe("saving a cloud key", () => {
  it("keeps the key it has when the new one can't be sealed after all", async () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify(A_KEY));
    const tabs = makeTabs(file, provider);
    encryption.sealFails = true;
    const state = await tabs.saveKey("bb_b", "proj-b");
    encryption.sealFails = false;
    expect(state.problem).toMatch(/can't keep the key encrypted/);
    expect(readJson(file)).toEqual(A_KEY);
  });

  it("writes a keyless session with the new key before writing over the key it has", async () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify(A_KEY));
    const handle = { tag: "t-1", id: "sess-1", by: "browserbase:proj-b", until: Date.now() + 60 * 60_000 };
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: {}, handles: [handle] }));
    const tabs = makeTabs(file, provider);
    // A folder where the sessions' file is written first, so writing it fails.
    mkdirSync(`${sessionsAt(file)}.tmp`);
    expect((await tabs.saveKey("bb_b", "proj-b")).problem).toBe("The key couldn't be saved.");
    expect(readJson(file)).toEqual(A_KEY);
    rmdirSync(`${sessionsAt(file)}.tmp`);
    expect((await tabs.saveKey("bb_b", "proj-b")).problem).toMatch(/may still be running/);
    expect(readJson(file)).toEqual({ apiKey: sealed("bb_b"), projectId: sealed("proj-b") });
    const kept = readJson(sessionsAt(file)) as { handles: { keyId: string }[]; keys: Record<string, unknown> };
    expect(kept.keys[kept.handles[0]?.keyId ?? ""]).toEqual({ apiKey: sealed("bb_b"), by: "browserbase:proj-b" });
  });
});
