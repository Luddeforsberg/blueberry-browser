import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "./cloudTabsTesting";

// A key at launch, on Forget and when it's saved, when sealing it, opening it or keeping what it ends fails partway.

// `sealFails` is a system that says it can seal, then can't, and `openFails` one that can't open what it sealed.
const encryption = vi.hoisted(() => ({ sealFails: false, openFails: false }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => {
      if (encryption.sealFails) throw new Error("It can't be sealed.");
      return Buffer.from(text);
    },
    decryptString: (sealed: Buffer) => {
      if (encryption.openFails) throw new Error("It can't be opened.");
      return sealed.toString();
    },
  },
  app: { isPackaged: true },
}));

const { attachTabs, fakeLocal, makeTabs, tempFile } = await import("./cloudTabsTesting");

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

// A launch that can't open the key from before, which came with A's Context, while B has one too, and the one list of
// sign-ins from before there was one per project. It decides nothing.
const unreadableLaunch = () => {
  const file = tempFile();
  writeFileSync(file, JSON.stringify({ ...A_KEY, contextId: "ctx-a" }));
  writeFileSync(sessionsAt(file), JSON.stringify({ contexts: { "browserbase:proj-b": "ctx-b" }, handles: [] }));
  const loginsFile = join(dirname(file), "cloud-logins.json");
  writeFileSync(loginsFile, JSON.stringify([{ site: "example.com", addedAt: 5, checkedAt: null, status: "checked" }]));
  encryption.openFails = true;
  const tabs = makeTabs(file, provider);
  encryption.openFails = false;
  expect(readJson(loginsFile)).toHaveLength(1);
  return { file, loginsFile, tabs };
};
const listedUnder = (origin: string) => ({ projects: { [origin]: [expect.objectContaining({ site: "example.com" })] } });

describe("a cloud key", () => {
  it("starts nothing at launch with a key it can't seal, so no session is kept with nothing to end it", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify(A_KEY));
    encryption.sealFails = true;
    const tabs = makeTabs(file, provider);
    encryption.sealFails = false;
    expect(tabs.state.provider).toBeNull();
    expect(tabs.state.problem).toMatch(/couldn't keep the key encrypted/);
    expect(tabs.claim("job-1")).toBe(false);
  });

  it("decides the sign-ins from before on Forget as a launch does, under the project whose Context came with them", async () => {
    const { file, loginsFile, tabs } = unreadableLaunch();
    await tabs.forget();
    expect(readJson(loginsFile)).toEqual(listedUnder("browserbase:proj-a"));
    makeTabs(file, provider);
    expect(readJson(loginsFile)).toEqual(listedUnder("browserbase:proj-a"));
  });

  it("lists the sign-ins from before under every project with a Context when Forget still can't tell whose they are", async () => {
    const { loginsFile, tabs } = unreadableLaunch();
    encryption.openFails = true;
    const state = await tabs.forget();
    encryption.openFails = false;
    expect(state.unreadable).toBe(false);
    expect(readJson(loginsFile)).toEqual(listedUnder("browserbase:proj-b"));
  });

  it("changes nothing on Forget while the sign-ins it decided can't be kept, and says so", async () => {
    const { file, loginsFile, tabs } = unreadableLaunch();
    // A folder where the list is written first, so writing it fails.
    mkdirSync(`${loginsFile}.tmp`);
    const state = await tabs.forget();
    expect(state).toMatchObject({ unreadable: true, problem: "The key couldn't be saved." });
    expect(readJson(file)).toMatchObject({ contextId: "ctx-a" });
    expect(readJson(loginsFile)).toHaveLength(1);
    rmdirSync(`${loginsFile}.tmp`);
    await tabs.forget();
    expect(readJson(loginsFile)).toEqual(listedUnder("browserbase:proj-a"));
  });

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

  it("leaves the session and its tabs going when a new key can't be sealed", async () => {
    attachTabs();
    const file = tempFile();
    writeFileSync(file, JSON.stringify(A_KEY));
    const closeTab = vi.fn();
    // Browserbase as far as the key goes, opening pages as the local stand-in does.
    const opens: Provider = ({ apiKey, projectId }) =>
      apiKey ? { ...fakeLocal().browser, name: "browserbase", origin: `browserbase:${projectId}` } : null;
    const tabs = makeTabs(file, opens, { closeTab });
    expect(await tabs.signedIn.check("example.com")).toBeNull();
    encryption.sealFails = true;
    expect((await tabs.saveKey("bb_b", "proj-b")).problem).toMatch(/can't keep the key encrypted/);
    encryption.sealFails = false;
    expect(closeTab).not.toHaveBeenCalled();
    expect(tabs.state.status).toBe("running");
    vi.restoreAllMocks();
  });

  it("keeps a key it gave a session at launch, whose write failed, on disk before a key for another project replaces it", async () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify(A_KEY));
    const handle = { tag: "t-1", id: "sess-1", by: "browserbase:proj-a", until: Date.now() + 60 * 60_000 };
    writeFileSync(sessionsAt(file), JSON.stringify({ contexts: {}, handles: [handle] }));
    // A folder where the sessions' file is written first, so the launch's write of the key it gives the session fails.
    mkdirSync(`${sessionsAt(file)}.tmp`);
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_b", "proj-b")).problem).toBe("The key couldn't be saved.");
    expect(readJson(file)).toEqual(A_KEY);
    rmdirSync(`${sessionsAt(file)}.tmp`);
    await tabs.saveKey("bb_b", "proj-b");
    expect(readJson(file)).toEqual({ apiKey: sealed("bb_b"), projectId: sealed("proj-b") });
    const kept = readJson(sessionsAt(file)) as { handles: { keyId: string }[]; keys: Record<string, unknown> };
    expect(kept.keys[kept.handles[0]?.keyId ?? ""]).toEqual({ apiKey: sealed("bb_a"), by: "browserbase:proj-a" });
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
