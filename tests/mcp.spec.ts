// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";

const connect = async (url: string, token: string) => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}`, "X-Blueberry-Client": "Claude Code" } } }));
  return client;
};

// fetch won't send another Host, which is what a page reaching this computer through its own name would do.
const statusWithHost = (url: string, host: string, token: string) =>
  new Promise<number>((resolve, reject) => {
    const sent = request(url, { method: "POST", headers: { host, authorization: `Bearer ${token}`, "content-type": "application/json" } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    sent.on("error", reject);
    sent.end("{}");
  });

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as Array<{ text: string }>)[0].text;
const jsonOf = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse(textOf(result).replace(/^[^[{]*/, ""));

// The real token, as Copy puts it on the clipboard. The clipboard is swapped first, so a test never touches the real one.
const copiedToken = async (app: ElectronApplication) => {
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = async (text: string) => {
      (globalThis as unknown as { copied: string }).copied = text;
    };
  });
  const chrome = await findView(app, "view=chrome");
  expect(await chrome.evaluate(() => window.chromeAPI.mcp.copy("Claude Code"))).toBe(true);
  const copied = await app.evaluate(() => (globalThis as unknown as { copied: string }).copied);
  return /Bearer ([\w-]+)/.exec(copied)![1];
};

test("Claude gives Berry a job over MCP, can't allow its action, and the user does in Blueberry", async () => {
  const site = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<title>Cable shop</title><h1>Cheap cables</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
  const model = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: { ...model.env, BLUEBERRY_MCP_PORT: "0" } });
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ actionApproval: "always" }));
    expect(await chrome.evaluate(() => window.chromeAPI.mcp.state())).toMatchObject({ on: false, url: null });

    const { url, snippets } = await chrome.evaluate(() => window.chromeAPI.mcp.setOn(true));
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    // The renderer never gets the token.
    expect(snippets[0].text).toContain("Bearer ••••••••");
    const token = await copiedToken(app);

    // Without the token, or through another name for this computer, it's refused.
    expect((await fetch(url!, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    const port = new URL(url!).port;
    expect(await statusWithHost(url!, `evil.example:${port}`, token)).toBe(403);

    const client = await connect(url!, token);
    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name)).toEqual(expect.arrayContaining(["list_agents", "run_browser_task", "get_task", "respond_to_task", "read_page"]));
    expect(jsonOf(await client.callTool({ name: "list_agents", arguments: {} }))[0].name).toBe("Berry");

    model.callTools({ name: "open_tab", args: { url: address } });
    model.callTools({ name: "read_page", args: {} });
    // Naming the site keeps its tab open once the job is done.
    model.replyWith("Cables on 127.0.0.1 from ", "€4.");
    const { taskId } = jsonOf(await client.callTool({ name: "run_browser_task", arguments: { goal: "Find the cheapest cable" } }));

    // Opening a tab asks, with "always". Claude is told it's waiting, and can't say yes.
    await expect.poll(async () => jsonOf(await client.callTool({ name: "get_task", arguments: { taskId } })).status).toBe("waiting_for_approval");
    const refused = await client.callTool({ name: "respond_to_task", arguments: { taskId, answer: "Allow" } });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/Only the user can allow this/);

    // The chat says where it came from, and the user allows it on Needs you.
    const library = await chrome.evaluate(() => window.chromeAPI.library.getLibrary());
    expect(library.chats.find(({ id }) => id === taskId)).toMatchObject({ from: "Claude Code" });
    const [waiting] = library.needsYou;
    expect(waiting).toMatchObject({ id: taskId, from: "Claude Code" });
    await chrome.evaluate(({ id, approvalId }) => window.chromeAPI.chat.decide(id, approvalId, true), { id: waiting.id, approvalId: waiting.approval.id });

    await expect.poll(async () => jsonOf(await client.callTool({ name: "get_task", arguments: { taskId } })).status, { timeout: 15_000 }).toBe("done");
    const done = await client.callTool({ name: "get_task", arguments: { taskId } });
    expect(textOf(done)).toMatch(/^Titles, addresses, page text/);
    expect(jsonOf(done)).toMatchObject({ reply: "Cables on 127.0.0.1 from €4.", from: "Claude Code" });
    expect(jsonOf(done).steps.length).toBeGreaterThan(0);

    // Context: tabs, and a page read through Berry's own tool, labelled as untrusted.
    const tabs = jsonOf(await client.callTool({ name: "get_open_tabs", arguments: {} }));
    const shop = tabs.find(({ url: tabUrl }: { url: string }) => tabUrl === address);
    expect(shop).toBeTruthy();
    const page = textOf(await client.callTool({ name: "read_page", arguments: { tabId: shop.id } }));
    expect(page).toContain("<untrusted-page-content");
    expect(page).toContain("Cheap cables");

    // Settings lists the calls.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Claude" }));
    await expect(chrome.getByText("Recent calls")).toBeVisible();
    await expect(chrome.getByText("run browser task", { exact: true })).toBeVisible();
    await expect(chrome.getByText("Claude Code").first()).toBeVisible();
    await client.close();

    // Revoking means the old token no longer works.
    await chrome.evaluate(() => window.chromeAPI.mcp.revoke());
    await expect(connect(url!, token)).rejects.toThrow();
    expect(await copiedToken(app)).not.toBe(token);

    await chrome.evaluate(() => window.chromeAPI.mcp.setOn(false));
    await expect(fetch(url!, { method: "POST", body: "{}" })).rejects.toThrow();
  } finally {
    await app.close();
    model.close();
    site.close();
  }
});
