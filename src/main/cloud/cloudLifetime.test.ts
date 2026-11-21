import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CdpTab } from "../tools/CdpTab";
import { browserbase } from "./browserbase";
import type { Setup } from "./cloudCheckApp";
import { actionsFor } from "./cloudCheckPlan";
import { ruleOf, run, shrink } from "./cloudCheckTesting";
import type { CloudBrowser, CloudSession } from "./cloudProvider";
import { CloudTabs } from "./CloudTabs";

// A model checker for the cloud session's life, driven by cloudCheckTesting.ts against a fake Browserbase, for thousands
// of seeded runs. A failure says its seed and the shortest run it could cut it down to. CLOUD_RUNS sets how many runs,
// and CLOUD_CHECK_ALL=1 goes on past the first failure to find one seed for each rule that breaks.

const net = vi.hoisted((): Setup["net"] => ({
  connect: () => Promise.reject(new Error("No world.")),
  attach: () => Promise.reject(new Error("No world.")),
}));
const disk = vi.hoisted((): Setup["disk"] => ({
  saved: { apiKey: null, projectId: null, contextId: null, sessionId: null, tags: [], madeBy: null },
  onWrite: () => {},
}));

vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => true }, app: { isPackaged: true } }));
vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: (url: string) => net.connect(url) } }));
vi.mock("./cloudFile", () => ({
  EMPTY: { apiKey: null, projectId: null, contextId: null, sessionId: null, tags: [], madeBy: null },
  MAX_FIELD_LENGTH: 200,
  readCloudFile: () => ({ ...disk.saved }),
  writeCloudFile: (_file: string, saved: Setup["disk"]["saved"]) => {
    disk.onWrite(saved);
    disk.saved = { ...saved };
    return true;
  },
}));

const RUNS = Number(process.env.CLOUD_RUNS) || 5_000;
const FIRST_SEED = 1;
// Where the list of sign-ins goes, beside the cloud's own file, which never reaches the disk here.
const folder = mkdtempSync(join(tmpdir(), "cloud-lifetime-"));

// The one place that knows how this version of the cloud is made and attached.
const setup: Setup = {
  net,
  disk,
  makeCloud: ({ local, launchLocal, readCookies }) => {
    // As localChrome.ts: closing the session is what ends it, so there's nothing to release.
    const standIn: CloudBrowser = {
      name: "local",
      release: async () => {},
      releaseTagged: async () => {},
      create: async () => ({ id: null, connect: () => launchLocal() as Promise<CloudSession> }),
    };
    const tabs = new CloudTabs(
      join(folder, "cloud.json"),
      ({ apiKey, projectId }) => (local ? standIn : apiKey && projectId ? browserbase({ apiKey, projectId }) : null),
      readCookies,
    );
    return { tabs, windowOpened: (hooks) => tabs.attach(hooks), windowClosed: () => tabs.detach(), quit: () => tabs.quit() };
  },
  // Each run starts with no sign-ins brought along.
  reset: () => rmSync(join(folder, "cloud-logins.json"), { force: true }),
};

describe("the cloud session's life", () => {
  beforeAll(() => {
    // Every failed release says so, and the checker makes thousands.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(CdpTab, "attach").mockImplementation((id) => net.attach(id) as Promise<CdpTab>);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loses no session, winds down one nobody uses, and lets nothing claim it while it ends, whatever the order", async () => {
    const found = new Map<string, number>();
    for (let seed = FIRST_SEED; seed < FIRST_SEED + RUNS; seed++) {
      const { broken } = await run(actionsFor(seed), setup);
      if (!broken || found.has(ruleOf(broken))) continue;
      found.set(ruleOf(broken), seed);
      if (process.env.CLOUD_CHECK_ALL !== "1") break;
    }
    const reports: string[] = [];
    for (const [rule, seed] of found) {
      const shortest = await shrink(actionsFor(seed), rule, setup);
      const { broken, trace } = await run(shortest, setup);
      reports.push(`Seed ${seed} breaks ${broken}\n${trace.map((line, i) => `  ${i + 1}. ${line}`).join("\n")}`);
    }
    expect(reports.join("\n\n")).toBe("");
  }, 120_000);
});
