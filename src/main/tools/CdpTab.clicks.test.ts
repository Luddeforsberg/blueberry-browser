import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPageTools, type PageTool } from "./browserTools";
import type { CdpTab } from "./CdpTab";
import { CloudSessions } from "../cloud/cloudBrowser";
import { findChrome, localChrome } from "../cloud/localChrome";
import { pressLanded } from "./pageScripts";
import { STOPPED } from "./toolMessages";

// Clicks with real input that's slow to arrive, as on a slow machine or over the network to a cloud browser, on a page
// in a real headless Chrome reached over CDP. Skipped where there's no Chrome.

describe.skipIf(!findChrome())("clicking when real input is slow", () => {
  let server: Server;
  let cloud: CloudSessions;
  let tab: CdpTab;
  let tools: PageTool[];
  // Whether the job has been stopped.
  let stopped = false;
  const tool = (name: string) => tools.find((one) => one.name === name)!;
  const refOf = async (name: string) => {
    const listed = JSON.parse(await tool("list_elements").run({})) as { elements: { ref: string; name: string }[] };
    return listed.elements.find((element) => element.name === name)!.ref;
  };

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><title>Shop</title><p id="count">Somewhere else to press</p>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cloud = new CloudSessions(localChrome());
    expect(cloud.claim("job")).toBe(true);
    tab = await cloud.open("job", "cloud-1", `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { onChange: () => {} });
    await tab.settled();
    tools = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => false,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
      stopped: () => stopped,
      limits: { name: "Scout", sites: ["127.0.0.1"], tools: ["click"] },
    });
  }, 90_000);

  afterAll(async () => {
    await cloud?.end();
    server?.close();
  });

  // Each test clicks a button of its own, with every click on it counted in the tools' own world, real or scripted.
  const addButton = async (name: string, onClick = "") => {
    await tab.runInPage(`(() => {
      const button = document.createElement("button");
      button.id = ${JSON.stringify(name)};
      button.textContent = ${JSON.stringify(name)};
      document.body.prepend(button);
      globalThis.clicks = { ...globalThis.clicks, [button.id]: 0 };
      button.addEventListener("click", () => { globalThis.clicks[button.id]++; ${onClick} });
    })()`);
    return refOf(name);
  };
  const clicksOn = (name: string) => tab.runInPage<number>(`globalThis.clicks[${JSON.stringify(name)}] ?? 0`);
  // Something the page puts exactly over the button, which counts what reaches it too.
  const cover = (name: string, tag = "button") => `(() => {
    const box = document.getElementById(${JSON.stringify(name)}).getBoundingClientRect();
    const cover = document.createElement("${tag}");
    cover.className = "cover";
    cover.style.cssText = "position: fixed; z-index: 10; margin: 0; padding: 0; border: 0; left: " + box.left + "px; top: " + box.top + "px; width: " + box.width + "px; height: " + box.height + "px";
    document.body.append(cover);
    const counted = cover.contentDocument ?? cover;
    globalThis.clicks = { ...globalThis.clicks, cover: 0 };
    for (const type of ["pointerdown", "mousedown", "click"]) counted.addEventListener(type, () => globalThis.clicks.cover++, true);
  })()`;
  // Whether `code` is the script reading what became of a press, for any watch.
  const landedCode = pressLanded("");
  const readsLanded = (code: string) => code.startsWith(landedCode.slice(0, landedCode.lastIndexOf('({"id"')));
  // The types of input Berry sent, since the last `holdBack`.
  let sent: string[] = [];
  const pressesSent = () => sent.filter((type) => type === "mouseDown").length;
  // Holds back the input of one type by `ms`, first running `meanwhile` in the page, or calling it with the real
  // way to send input, for what the user does meanwhile.
  const holdBack = (type: string, ms: number, meanwhile: string | ((send: CdpTab["sendAgentInput"]) => Promise<void>) = "") => {
    const send = tab.sendAgentInput.bind(tab);
    let held = false;
    sent = [];
    return vi.spyOn(tab, "sendAgentInput").mockImplementation(async (event) => {
      sent.push(event.type);
      if (event.type === type && !held) {
        held = true;
        if (typeof meanwhile === "function") await meanwhile(send);
        else if (meanwhile) await tab.runInPage(meanwhile);
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      return send(event);
    });
  };
  const clickWhileHeld = async (hold: ReturnType<typeof holdBack>, ref: string, toolName = "click") => {
    try {
      return await tool(toolName).run({ ref });
    } finally {
      hold.mockRestore();
      await tab.runInPage("document.querySelectorAll('.cover').forEach((cover) => cover.remove())");
    }
  };

  it("clicks once when the pointer is slow to get there", async () => {
    const ref = await addButton("Slow move");
    const result = await clickWhileHeld(holdBack("mouseMove", 2000), ref);
    expect(await clicksOn("Slow move")).toBe(1);
    expect(result).toMatch(/^Done\./);
    expect(result).not.toMatch(/scripted/);
  }, 10_000);

  it("clicks once when the press is slow to arrive after the watch is set", async () => {
    const ref = await addButton("Slow press");
    const result = await clickWhileHeld(holdBack("mouseDown", 2000), ref);
    expect(await clicksOn("Slow press")).toBe(1);
    expect(result).toMatch(/^Done\./);
    expect(result).not.toMatch(/scripted/);
  }, 10_000);

  it("stops a slow press from reaching what the page put under the pointer meanwhile", async () => {
    const ref = await addButton("Covered later");
    const result = await clickWhileHeld(holdBack("mouseDown", 2000, cover("Covered later")), ref);
    expect(await clicksOn("cover")).toBe(0);
    // Nothing real reached the page, so the click it was asked for goes to the element as a scripted one.
    expect(await clicksOn("Covered later")).toBe(1);
    expect(result).toMatch(/scripted/);
  }, 10_000);

  it("counts a press that reaches it after the user pressed somewhere else meanwhile, and clicks once", async () => {
    const ref = await addButton("Pressed elsewhere");
    const userPresses = async (send: CdpTab["sendAgentInput"]) => {
      const at = await tab.runInPage<{ x: number; y: number }>(
        "(() => { const box = document.getElementById('count').getBoundingClientRect(); return { x: Math.round(box.left + 5), y: Math.round(box.top + box.height / 2) }; })()",
      );
      await send({ type: "mouseDown", button: "left", clickCount: 1, ...at });
      await send({ type: "mouseUp", button: "left", clickCount: 1, ...at });
    };
    const result = await clickWhileHeld(holdBack("mouseDown", 0, userPresses), ref);
    expect(await clicksOn("Pressed elsewhere")).toBe(1);
    expect(pressesSent()).toBe(1);
    expect(result).toMatch(/^Done\./);
  }, 10_000);

  // This documents the gap that's left, not a guarantee: the check just before the press only sees what's there then.
  it("a frame that moves over the point after the check gets the press, and nothing is replayed", async () => {
    const ref = await addButton("Framed");
    const result = await clickWhileHeld(holdBack("mouseDown", 0, cover("Framed", "iframe")), ref);
    expect(await clicksOn("cover")).toBe(3);
    expect(await clicksOn("Framed")).toBe(0);
    expect(result).toMatch(/may not have/);
    expect(result).not.toMatch(/scripted/);
  }, 10_000);

  it("sends no press when the job is stopped while the watch is being set", async () => {
    const ref = await addButton("Stopped");
    const run = tab.runInPage.bind(tab);
    const stopping = vi.spyOn(tab, "runInPage").mockImplementation(async <R>(code: string): Promise<R> => {
      const result = await run<R>(code);
      // Only the watch is given a point to check.
      if (code.includes('"x":')) stopped = true;
      return result;
    });
    const hold = holdBack("none", 0);
    try {
      expect(await tool("click").run({ ref })).toBe(STOPPED);
    } finally {
      stopping.mockRestore();
      hold.mockRestore();
      stopped = false;
    }
    expect(pressesSent()).toBe(0);
    expect(await clicksOn("Stopped")).toBe(0);
  }, 10_000);

  it("double-clicks with real input, reading each press before the next", async () => {
    const ref = await addButton("Twice");
    await tab.runInPage(
      "globalThis.doubles = 0; document.getElementById('Twice').addEventListener('dblclick', (event) => { if (event.isTrusted) globalThis.doubles++; })",
    );
    const result = await tool("double_click").run({ ref });
    expect(result).toMatch(/^Done\./);
    expect(result).not.toMatch(/scripted/);
    expect(await clicksOn("Twice")).toBe(2);
    expect(await tab.runInPage("globalThis.doubles")).toBe(1);
  });

  it("sends no second press when what happened to the first can't be read", async () => {
    const ref = await addButton("Unread");
    const run = tab.runInPage.bind(tab);
    const unreadable = vi.spyOn(tab, "runInPage").mockImplementation(async <R>(code: string): Promise<R> => {
      if (readsLanded(code)) throw new Error("No answer");
      return run<R>(code);
    });
    const hold = holdBack("none", 0);
    try {
      const result = await tool("double_click").run({ ref });
      expect(result).toMatch(/may or may not have happened/);
      expect(result).not.toMatch(/scripted/);
    } finally {
      unreadable.mockRestore();
      hold.mockRestore();
    }
    expect(pressesSent()).toBe(1);
    expect(await clicksOn("Unread")).toBe(1);
  }, 10_000);

  it("lets the user's own click through as soon as Berry knows its click landed", async () => {
    const ref = await addButton("Berry's");
    await addButton("User's");
    const at = await tab.runInPage<{ x: number; y: number }>(
      '(() => { const box = document.getElementById("User\'s").getBoundingClientRect(); return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }; })()',
    );
    const run = tab.runInPage.bind(tab);
    const send = tab.sendAgentInput.bind(tab);
    let answered = false;
    // The user clicks just after the first answer that Berry's press landed, before anything else reaches the page.
    const spy = vi.spyOn(tab, "runInPage").mockImplementation(async <R>(code: string): Promise<R> => {
      if (answered) {
        answered = false;
        await send({ type: "mouseMove", ...at });
        await send({ type: "mouseDown", button: "left", clickCount: 1, ...at });
        await send({ type: "mouseUp", button: "left", clickCount: 1, ...at });
      }
      const result = await run<R>(code);
      if (readsLanded(code) && result === true) answered = true;
      return result;
    });
    try {
      expect(await tool("click").run({ ref })).toMatch(/^Done\./);
    } finally {
      spy.mockRestore();
    }
    expect(await clicksOn("Berry's")).toBe(1);
    expect(await clicksOn("User's")).toBe(1);
  }, 10_000);

  it("sends no second press after a first whose release was stopped, even with the element back in place", async () => {
    const ref = await addButton("Cut short");
    // Pressing it puts something over it, which goes again just after the release lands there.
    await tab.runInPage(`(() => {
      const button = document.getElementById("Cut short");
      button.addEventListener("mousedown", () => { ${cover("Cut short")} }, { once: true });
      addEventListener("pointerup", () => setTimeout(() => document.querySelectorAll(".cover").forEach((cover) => cover.remove())), { capture: true, once: true });
    })()`);
    const result = await clickWhileHeld(holdBack("none", 0), ref, "double_click");
    expect(result).toMatch(/The press reached it/);
    expect(pressesSent()).toBe(1);
    expect(await clicksOn("Cut short")).toBe(0);
  }, 10_000);

  it("stops a double-click after a first click that covered the element, and says so", async () => {
    const ref = await addButton("Covers itself", cover("Covers itself"));
    const result = await tool("double_click").run({ ref });
    await tab.runInPage("document.querySelectorAll('.cover').forEach((cover) => cover.remove())");
    expect(await clicksOn("Covers itself")).toBe(1);
    expect(await clicksOn("cover")).toBe(0);
    expect(result).toMatch(/first/);
    expect(result).not.toMatch(/scripted/);
  }, 10_000);
});
