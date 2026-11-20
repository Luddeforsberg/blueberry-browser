import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { McpConnector } from "./McpConnector";

// Encrypting can fail even when it's available, as when the keychain refuses.
const keychain = vi.hoisted(() => ({ refuses: false }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getVersion: () => "1.0.0" },
  clipboard: { writeText: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => {
      if (keychain.refuses) throw new Error("Error while encrypting the text provided to encryptString.");
      return Buffer.from(text);
    },
    decryptString: (data: Buffer) => data.toString(),
  },
}));

const connector = (file = join(mkdtempSync(join(tmpdir(), "mcp-")), "mcp.json")) =>
  new McpConnector(
    file,
    () => [],
    () => {},
    true,
  );

describe("McpConnector", () => {
  it("doesn't come up if it's switched off while it's still starting", async () => {
    const mcp = connector();
    const on = mcp.setOn(true);
    await mcp.setOn(false);
    await on;
    expect(mcp.state).toMatchObject({ on: false, url: null });
  });

  it("refuses every request once it's off", async () => {
    const mcp = connector();
    const { url } = await mcp.setOn(true);
    expect((await fetch(url!, { method: "POST", body: "{}" })).status).toBe(401);
    // Switched off with a request on its way, which the server then answers.
    (mcp as unknown as { saved: { on: boolean } }).saved.on = false;
    expect((await fetch(url!, { method: "POST", body: "{}" })).status).toBe(503);
    await mcp.setOn(false);
    await expect(fetch(url!, { method: "POST", body: "{}" })).rejects.toThrow();
  });

  it("goes off when a new token can't be saved, and says the old one comes back after a restart", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mcp-")), "mcp.json");
    const mcp = connector(file);
    const { url } = await mcp.setOn(true);
    // The write goes beside the file first, so a folder in that place makes it fail.
    mkdirSync(`${file}.tmp`);

    expect(mcp.revoke()).toMatchObject({ on: false, url: null, problem: expect.stringContaining("old token is still saved") });
    await expect(fetch(url!, { method: "POST", body: "{}" })).rejects.toThrow();
    // Turning it on again can't save the new one either, so it stays off and still says so.
    expect(await mcp.setOn(true)).toMatchObject({ on: false, url: null, problem: expect.stringContaining("old token is still saved") });
    // What the next launch does, as it said.
    const next = connector(file);
    next.start();
    expect(next.state.on).toBe(true);
    next.close();

    // Turning it off can't be saved either, so it says it will be on again.
    const again = connector(file);
    again.start();
    expect(await again.setOn(false)).toMatchObject({ on: false, problem: expect.stringContaining("on again after a restart") });

    rmSync(`${file}.tmp`, { recursive: true });
    expect(await again.setOn(false)).toMatchObject({ on: false, problem: null });
    const after = connector(file);
    after.start();
    expect(after.state.on).toBe(false);
  });

  it("still goes off, and says what a restart does, when the keychain refuses", async () => {
    const mcp = connector();
    const { url } = await mcp.setOn(true);
    keychain.refuses = true;
    try {
      expect(await mcp.setOn(false)).toMatchObject({ on: false, problem: expect.stringContaining("on again after a restart") });
      await expect(fetch(url!, { method: "POST", body: "{}" })).rejects.toThrow();
    } finally {
      keychain.refuses = false;
    }
  });
});
