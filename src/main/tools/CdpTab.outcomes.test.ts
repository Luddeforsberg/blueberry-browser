import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPageTools, type PageTool } from "./browserTools";
import type { CdpTab } from "./CdpTab";
import { CdpNavigationLimits } from "./cdpNavigationLimits";
import { CdpScreencast } from "./cdpScreencast";
import { CloudSessions } from "../cloud/cloudBrowser";
import { findChrome, localChrome } from "../cloud/localChrome";

// What Berry says it did, on a page in a real headless Chrome reached over CDP, when the browser or the page doesn't
// go along with it. Skipped where there's no Chrome.

const PAGES: Record<string, string> = {
  "/": `<!doctype html><title>Start</title><p>Start</p>`,
  "/next": `<!doctype html><title>Next</title><p>Next</p>`,
  // Saves in place, and keeps every key to itself before anything else on the page hears it.
  "/form": `<!doctype html><title>Search</title>
<form id="search"><input aria-label="Query"><button>Go</button></form>
<script>
  globalThis.sent = 0;
  addEventListener("keydown", (event) => event.stopImmediatePropagation(), true);
  document.getElementById("search").addEventListener("submit", (event) => { event.preventDefault(); globalThis.sent++; });
</script>`,
  // An editor that always keeps what it started with, whatever is typed over it.
  "/editor": `<!doctype html><title>Notes</title>
<div id="notes" contenteditable="true" role="textbox" aria-label="Notes">Old note</div>
<script>
  globalThis.enters = 0;
  const notes = document.getElementById("notes");
  notes.addEventListener("keydown", (event) => { if (event.key === "Enter") globalThis.enters++; });
  notes.addEventListener("input", () => { if (!notes.innerText.startsWith("Old note")) notes.innerText = "Old note " + notes.innerText; });
</script>`,
  "/rows": `<!doctype html><title>Feed</title><button>Keep</button><div id="feed"></div>
<script>
  globalThis.fill = (from) => {
    document.getElementById("feed").replaceChildren(...Array.from({ length: 5 }, (_, i) => {
      const row = document.createElement("button");
      row.textContent = "Row " + (from + i);
      return row;
    }));
  };
  fill(1);
</script>`,
};

describe.skipIf(!findChrome())("what Berry knows of what it did, over CDP", () => {
  let server: Server;
  let origin = "";
  let cloud: CloudSessions;
  let tab: CdpTab;
  let tools: PageTool[];
  const tool = (name: string) => tools.find((one) => one.name === name)!;
  const listed = async () => (JSON.parse(await tool("list_elements").run({})) as { elements: { ref: string; name: string }[] }).elements;
  const refOf = async (name: string) => (await listed()).find((element) => element.name === name)!.ref;
  const goTo = async (path: string) => expect(await tool("go_to").run({ url: `${origin}${path}` })).toMatch(/^Done\./);
  // A CDP session of the test's own on the same page.
  const ownSession = () => tab.page.context().newCDPSession(tab.page);

  beforeAll(async () => {
    server = createServer((request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(PAGES[request.url ?? ""] ?? PAGES["/"]);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cloud = new CloudSessions(localChrome());
    expect(cloud.claim("job")).toBe(true);
    tab = await cloud.open("job", "cloud-1", `${origin}/`, { onChange: () => {} });
    await tab.settled();
    tools = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => false,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
    });
  }, 90_000);

  afterAll(async () => {
    await cloud?.end();
    server?.close();
  });

  it("doesn't act behind a navigation limit the browser didn't take, and takes the next one", async () => {
    const session = await ownSession();
    const limits = new CdpNavigationLimits(session);
    const send = vi.spyOn(session, "send").mockRejectedValueOnce(new Error("Fetch isn't available"));
    const act = vi.fn(async () => "acted");
    await expect(limits.withNavigationLimit(() => false, act)).rejects.toThrow("Fetch isn't available");
    expect(act).not.toHaveBeenCalled();
    expect((await limits.withNavigationLimit(() => true, act)).result).toBe("acted");
    expect(send.mock.calls.map(([method]) => method)).toEqual(["Fetch.enable", "Fetch.disable", "Fetch.enable", "Fetch.disable"]);
    await session.detach();
  });

  it("presses Enter once in a form that saves in place, when nothing shows the real one arrived", async () => {
    await goTo("/form");
    const result = await tool("type_text").run({ ref: await refOf("Query"), text: "berries", submit: true });
    expect(await tab.page.evaluate("globalThis.sent")).toBe(1);
    expect(result).toMatch(/may or may not have been submitted/);
    expect(await tab.runInPage("document.querySelector('input').value")).toBe("berries");
  }, 10_000);

  it("says a field didn't take it when the editor keeps what it had, and submits nothing", async () => {
    await goTo("/editor");
    const ref = await refOf("Notes");
    expect(await tool("type_text").run({ ref, text: "New note", submit: true })).toMatch(/holds something other than that text/);
    expect(await tool("type_text").run({ ref, text: "" })).toMatch(/holds something other than that text/);
    expect(await tab.page.evaluate("globalThis.enters")).toBe(0);
  });

  it("lets go of rows the page threw away, and keeps a ref for one that's still there", async () => {
    await goTo("/rows");
    const keep = await refOf("Keep");
    const before = await listed();
    await tab.page.evaluate("fill(6)");
    const after = await listed();
    expect(await refOf("Keep")).toBe(keep);
    const held = await tab.runInPage<string[]>("[...globalThis.__berry.byRef.keys()]");
    expect(held.sort()).toEqual(after.map(({ ref }) => ref).sort());
    expect(held).not.toContain(before.find(({ name }) => name === "Row 1")!.ref);
  });

  it("says it didn't go back when the browser turned it down", async () => {
    await goTo("/next");
    const session = await ownSession();
    await session.send("Page.resetNavigationHistory");
    await session.detach();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(tab.canGoBack).toBe(true);
    expect(await tool("go_back").run({})).toMatch(/didn't go back/);
    expect(tab.url).toBe(`${origin}/next`);
  });

  it("starts pictures again after a start the browser turned down", async () => {
    const session = await ownSession();
    const screencast = new CdpScreencast(session);
    vi.spyOn(session, "send").mockRejectedValueOnce(new Error("Not now"));
    const frames: string[] = [];
    const first = await screencast.watch((jpeg) => frames.push(jpeg)).catch((error: Error) => error.message);
    await screencast.watch((jpeg) => frames.push(jpeg));
    await tab.page.evaluate("document.body.append('changed')");
    await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(first).toBe("Not now");
    await screencast.watch(null);
    await session.detach();
  });
});
