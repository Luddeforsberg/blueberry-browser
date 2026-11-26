import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Founder } from "./founderApp";

// A job handed over from Claude Code, as Settings' snippet connects it: the connector on, its token from Copy, and
// Claude Code's own header. The clipboard is swapped first, so the real one is never touched.
export async function jobFromClaudeCode(founder: Founder, goal: string): Promise<string> {
  const { url } = await founder.chrome.evaluate(() => window.chromeAPI.mcp.setOn(true));
  if (!url) throw new Error("The connector didn't start");
  await founder.app.evaluate(({ clipboard }) => {
    clipboard.writeText = async (text: string) => {
      (globalThis as unknown as { copied: string }).copied = text;
    };
  });
  if (!(await founder.chrome.evaluate(() => window.chromeAPI.mcp.copy("Claude Code")))) throw new Error("Nothing was copied");
  const copied = await founder.app.evaluate(() => (globalThis as unknown as { copied: string }).copied);
  const token = /Bearer ([\w-]+)/.exec(copied)?.[1];
  if (!token) throw new Error("No token in what was copied");
  const client = new Client({ name: "claude-code", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}`, "X-Blueberry-Client": "Claude Code" } },
    }),
  );
  try {
    const result = await client.callTool({ name: "run_browser_task", arguments: { goal } });
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    const { taskId } = JSON.parse(text.replace(/^[^[{]*/, "")) as { taskId: string };
    return taskId;
  } finally {
    await client.close();
  }
}
