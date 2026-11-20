import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPageTools, type PageTool } from "./browserTools";
import type { CdpTab } from "./CdpTab";
import { CloudSessions } from "../cloud/cloudBrowser";
import { findChrome, isLocalEndpoint, localChrome } from "../cloud/localChrome";
import { scrollPage } from "./pageScripts";
import { STOPPED } from "./toolMessages";

// Berry's own tools, unchanged, on a page in a real headless Chrome reached over CDP. Skipped where there's no Chrome.

const PAGE = `<!doctype html><title>Order form</title>
<form action="/sent"><label>Name <input name="name"></label><button type="button" id="add">Add to cart</button></form>
<p id="count">Cart: 0</p><a href="/elsewhere">Elsewhere</a>
<script>
  document.getElementById("add").addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const count = document.getElementById("count");
    count.textContent = "Cart: " + (Number(count.textContent.slice(6)) + 1);
  });
</script>`;

describe.skipIf(!findChrome())("a page in a browser over CDP", () => {
  let server: Server;
  let origin = "";
  let cloud: CloudSessions;
  let tab: CdpTab;
  let tools: PageTool[];
  // Requests that reached the site a mascot isn't allowed on.
  const forbidden: string[] = [];
  // Whether the job has been stopped.
  let stopped = false;
  const tool = (name: string) => tools.find((one) => one.name === name)!;
  const refOf = async (name: string) => {
    const listed = JSON.parse(await tool("list_elements").run({})) as { elements: { ref: string; name: string }[] };
    return listed.elements.find((element) => element.name === name)!.ref;
  };

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.headers.host?.startsWith("localhost")) forbidden.push(request.url ?? "");
      if (request.url === "/redirect") {
        response.writeHead(302, { location: `${origin.replace("127.0.0.1", "localhost")}/forbidden` });
        response.end();
        return;
      }
      response.setHeader("content-type", "text/html");
      if (request.url === "/links") {
        const away = origin.replace("127.0.0.1", "localhost");
        response.end(
          `<title>Links</title><a href="${away}/popup-link" target="_blank">Link away</a> <button onclick="window.open('${away}/popup-script')">Open away</button> <a href="${origin}/next" target="_blank">Next</a>`,
        );
        return;
      }
      if (request.url === "/long") {
        response.end(`<!doctype html><title>Long</title>${"<p>line</p>".repeat(400)}`);
        return;
      }
      response.end(request.url === "/" ? PAGE : `<title>${request.url}</title><p>${request.url}</p>`);
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
      stopped: () => stopped,
      limits: { name: "Scout", sites: ["127.0.0.1"], tools: ["click", "type", "visit"] },
    });
  }, 30_000);

  afterAll(async () => {
    await cloud?.end();
    server?.close();
  });

  it("reads the page and its title", async () => {
    expect(tab.title).toBe("Order form");
    expect(await tool("read_page").run({})).toContain("Cart: 0");
  });

  it("clicks the element a ref names with real input", async () => {
    const ref = await refOf("Add to cart");
    expect(ref).toMatch(/^e\d+$/);
    const result = await tool("click").run({ ref });
    expect(result).toMatch(/^Done\./);
    expect(result).not.toMatch(/scripted/);
    expect(await tab.runInPage("document.getElementById('count').textContent")).toBe("Cart: 1");
  });

  describe("when real input is slow, as on a slow machine or over the network", () => {
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
      counted.addEventListener("mousedown", () => globalThis.clicks.cover++, true);
    })()`;
    // Holds back the input of one type by `ms`, first running `meanwhile` in the page.
    const holdBack = (type: string, ms: number, meanwhile = "") => {
      const send = tab.sendAgentInput.bind(tab);
      let held = false;
      return vi.spyOn(tab, "sendAgentInput").mockImplementation(async (event) => {
        if (event.type === type && !held) {
          held = true;
          if (meanwhile) await tab.runInPage(meanwhile);
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

    // A frame put over it just as the press goes takes the press where the page can't see, which is the gap left: the
    // check just before the press only sees what's there then.
    it("never clicks again after a press it couldn't see arrive", async () => {
      const ref = await addButton("Framed");
      const result = await clickWhileHeld(holdBack("mouseDown", 0, cover("Framed", "iframe")), ref);
      expect(await clicksOn("cover")).toBe(1);
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
      try {
        expect(await tool("click").run({ ref })).toBe(STOPPED);
      } finally {
        stopping.mockRestore();
        stopped = false;
      }
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

  it("types into a field", async () => {
    const ref = await refOf("Name");
    expect(await tool("type_text").run({ ref, text: "Ada" })).toMatch(/^Done\./);
    expect(await tab.runInPage("document.querySelector('input').value")).toBe("Ada");
  });

  it("keeps refs in one world for the document, which the page can't see", async () => {
    const ref = await refOf("Add to cart");
    expect(await tab.runInPage("typeof globalThis.__berry")).toBe("object");
    expect(await tab.page.evaluate("typeof globalThis.__berry")).toBe("undefined");
    expect(await tool("click").run({ ref })).toMatch(/^Done\./);
  });

  it("presses real keys", async () => {
    await tab.runInPage("document.querySelector('input').focus()");
    expect(await tool("press_key").run({ key: "x" })).toMatch(/^Done\./);
    expect(await tab.runInPage("document.querySelector('input').value")).toBe("Adax");
  });

  it("takes a picture for the model", async () => {
    expect(await tool("screenshot").run({})).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("stops a page from taking a limited mascot off its sites, and stays where it was", async () => {
    const { refused } = await tab.withNavigationLimit(
      () => false,
      async () => {
        await tab.runInPage("location.href = '/elsewhere'");
        await tab.settled();
        return "";
      },
    );
    expect(refused).toEqual([`${origin}/elsewhere`]);
    expect(tab.url).toBe(`${origin}/`);
  });

  it("goes to an address, and back", async () => {
    expect(await tool("go_to").run({ url: `${origin}/next` })).toContain(`now at ${origin}/next`);
    expect(tab.canGoBack).toBe(true);
    expect(await tool("go_back").run({})).toContain(`now at ${origin}/`);
  });

  it("refuses a site the mascot isn't allowed on before anything happens", async () => {
    expect(await tool("go_to").refuses!({ url: "https://example.com/" })).toMatchObject({ label: "Stayed off example.com" });
  });

  it("holds a limited mascot to its sites from a new page's first load, so a redirect sends nothing elsewhere", async () => {
    const allowed = (url: string) => new URL(url).hostname === "127.0.0.1";
    const redirected = await cloud.open("job", "cloud-2", `${origin}/redirect`, { onChange: () => {} }, allowed);
    await redirected.settled();
    expect(forbidden).toEqual([]);
    expect(redirected.url).not.toContain("localhost");
    await cloud.close("cloud-2");
  });

  it("lets no popup reach a site a limited mascot isn't allowed on, and opens none of its own", async () => {
    const allowed = (url: string) => new URL(url).hostname === "127.0.0.1";
    const links = await cloud.open("job", "cloud-3", `${origin}/links`, { onChange: () => {} }, allowed);
    const pagesBefore = links.page.context().pages().length;
    const main = tab;
    tab = links;
    try {
      expect(await tool("click").run({ ref: await refOf("Link away") })).toContain(
        "The page tried to go to localhost, which Scout isn't allowed on",
      );
      expect(await tool("click").run({ ref: await refOf("Open away") })).toMatch(/^Done\./);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      tab = main;
    }
    expect(forbidden).toEqual([]);
    expect(links.url).toBe(`${origin}/links`);
    await vi.waitFor(() => expect(links.page.context().pages().length).toBe(pagesBefore), { timeout: 5000 });
    // An allowed one is followed in the tab it came from instead.
    tab = links;
    try {
      await tool("click").run({ ref: await refOf("Next") });
    } finally {
      tab = main;
    }
    await vi.waitFor(() => expect(links.url).toBe(`${origin}/next`), { timeout: 5000 });
    expect(links.page.context().pages().length).toBe(pagesBefore);
    await cloud.close("cloud-3");
  }, 20_000);

  it("loads a popup from an earlier chat's page only into that page, never into the job working now", async () => {
    const earlier = await cloud.open("job", "cloud-6", `${origin}/links`, { onChange: () => {} });
    cloud.release("job");
    cloud.claim("now");
    try {
      const current = await cloud.open("now", "cloud-7", `${origin}/`, { onChange: () => {} });
      // From a timer, so the script answers at once: `window.open` holds the page until the browser has set the popup
      // up, which a busy CI runner can take longer than a page gets to answer.
      await earlier.runInPage(`setTimeout(() => window.open("${origin}/next"))`);
      await vi.waitFor(() => expect(earlier.url).toBe(`${origin}/next`), { timeout: 15_000 });
      expect(current.url).toBe(`${origin}/`);
    } finally {
      // Whatever happened, so the tests after this one still have the session as they expect.
      await Promise.all([cloud.close("cloud-6"), cloud.close("cloud-7")]);
      cloud.release("now");
      cloud.claim("job");
    }
  });

  it("fits the page's viewport to the size the cloud tab shows it at", async () => {
    await tab.fitTo(900, 500);
    expect(await tab.page.evaluate(() => [innerWidth, innerHeight])).toEqual([900, 500]);
    await tab.fitTo(1280, 720);
    expect(await tab.page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 720]);
  });

  it("answers a smooth scroll where it ends, even one that starts late, and at once where the page can't go", async () => {
    const long = await cloud.open("job", "cloud-8", `${origin}/long`, { onChange: () => {} });
    try {
      await long.settled();
      // Where it answered, where it came to rest, and whether it answered at once, timed in the page. Where the system
      // turns smooth scrolling off, as on some CI runners, a scroll that moves is instant too, so only one that can't go is
      // held to answering at once.
      const scroll = async (direction: "up" | "down", page = long, first = "") => {
        const { top, ms } = await page.runInPage<{ top: number; ms: number }>(
          `${first}(async (started) => ({ ...(await ${scrollPage(direction, true)}), ms: performance.now() - started }))(performance.now())`,
        );
        return { top, settled: await page.runInPage<number>("Math.round(scrollY)"), quick: ms < 100 };
      };
      // Busy for 200ms just after the call, as a page still loading can be, so the scroll hasn't started 120ms in.
      const late = await scroll(
        "down",
        long,
        "setTimeout(() => { const end = performance.now() + 200; while (performance.now() < end); });",
      );
      expect(late.top).toBeGreaterThan(0);
      expect(late.top).toBe(late.settled);
      const normal = await scroll("down");
      expect(normal.top).toBeGreaterThan(late.top);
      expect(normal.top).toBe(normal.settled);
      // Already at the bottom, already at the top, and a page too short to scroll.
      await long.runInPage("scrollTo(0, document.documentElement.scrollHeight)");
      const bottom = await scroll("down");
      expect(bottom.top).toBeGreaterThan(normal.top);
      expect(bottom).toEqual({ top: bottom.settled, settled: bottom.settled, quick: true });
      await long.runInPage("scrollTo(0, 0)");
      expect(await scroll("up")).toEqual({ top: 0, settled: 0, quick: true });
      expect(await scroll("down", tab)).toEqual({ top: 0, settled: 0, quick: true });
    } finally {
      await cloud.close("cloud-8");
    }
  });

  it("lets one job at a time use the session", () => {
    expect(cloud.claim("another")).toBe(false);
    expect(cloud.usedBy("cloud-1")).toBe("job");
    cloud.release("job");
    expect(cloud.claim("another")).toBe(true);
    // Its page is the old job's, which has let go of it.
    expect(cloud.usedBy("cloud-1")).toBeNull();
    cloud.release("another");
    cloud.claim("job");
  });
});

describe("a local browser", () => {
  it("is only ever on this computer", () => {
    expect(isLocalEndpoint("http://127.0.0.1:9222")).toBe(true);
    expect(isLocalEndpoint("ws://127.0.0.1:9222/devtools/browser/x")).toBe(true);
    expect(isLocalEndpoint("http://localhost.evil.com:9222")).toBe(false);
    expect(isLocalEndpoint("https://10.0.0.2:9222")).toBe(false);
    expect(isLocalEndpoint("nonsense")).toBe(false);
  });
});
