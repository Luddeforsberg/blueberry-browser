import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { McpConnector } from "./McpConnector";

vi.mock("electron", () => ({
  app: { isPackaged: false, getVersion: () => "1.0.0" },
  clipboard: { writeText: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (data: Buffer) => data.toString(),
  },
}));

const connector = () => new McpConnector(join(mkdtempSync(join(tmpdir(), "mcp-")), "mcp.json"), () => [], () => {}, true);

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
});
