import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPageTools, type PageTool } from "./browserTools";
import type { CdpTab } from "./CdpTab";
import { CloudSessions } from "./cloudBrowser";
import { findChrome, isLocalEndpoint, localChrome } from "./localChrome";

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
        response.end(`<title>Links</title><a href="${away}/popup-link" target="_blank">Link away</a> <button onclick="window.open('${away}/popup-script')">Open away</button> <a href="${origin}/next" target="_blank">Next</a>`);
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
      }
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
      expect(await tool("click").run({ ref: await refOf("Link away") })).toContain("The page tried to go to localhost, which Scout isn't allowed on");
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
    const current = await cloud.open("now", "cloud-7", `${origin}/`, { onChange: () => {} });
    await earlier.runInPage(`void window.open("${origin}/next")`);
    await vi.waitFor(() => expect(earlier.url).toBe(`${origin}/next`), { timeout: 5000 });
    expect(current.url).toBe(`${origin}/`);
    await Promise.all([cloud.close("cloud-6"), cloud.close("cloud-7")]);
    cloud.release("now");
    cloud.claim("job");
  });

  it("fits the page's viewport to the size the cloud tab shows it at", async () => {
    await tab.fitTo(900, 500);
    expect(await tab.page.evaluate(() => [innerWidth, innerHeight])).toEqual([900, 500]);
    await tab.fitTo(1280, 720);
    expect(await tab.page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 720]);
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
