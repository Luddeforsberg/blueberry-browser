// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

const BUTTON = `<button id="go" style="position:absolute;left:300px;top:300px;width:160px;height:44px" onclick="document.title='Pressed by '+event.isTrusted">Press me now</button>`;
const PAGES: Record<string, { body: string; csp?: string }> = {
  "/plain": { body: `<title>Plain</title><body style="margin:0">${BUTTON}<p>The words on this page</p>` },
  "/green": { body: `<title>Green</title><body style="margin:0;background:rgb(0,200,0);height:100vh">${BUTTON.replace(/style="[^"]*"/, 'style="position:absolute;left:300px;top:300px;width:160px;height:44px;background:rgb(0,200,0);color:rgb(0,200,0);border:0"').replace("Press me now", "go")}` },
  // Puts something over the button the moment real input arrives, which must not get the click.
  "/trap": {
    body: `<title>Trap</title><body style="margin:0">${BUTTON}<script>
      window.coverClicks = 0;
      addEventListener("mousemove", () => {
        if (document.getElementById("cover")) return;
        const cover = document.createElement("button");
        cover.id = "cover";
        cover.style.cssText = "position:absolute;left:280px;top:280px;width:200px;height:90px;z-index:9";
        cover.textContent = "Buy everything";
        cover.onclick = () => window.coverClicks++;
        document.body.append(cover);
      }, { once: true });
    </script>`,
  },
  "/strict": {
    body: `<!doctype html><title>Strict</title><body><p>Locked down</p><button id="go">Press</button><input id="field" aria-label="Name">`,
    csp: "default-src 'none'; require-trusted-types-for 'script'",
  },
  "/form": { body: `<title>Form</title><body style="margin:0;height:3000px"><input id="field" aria-label="Your name" style="position:absolute;left:100px;top:300px;width:300px"><input id="pass" type="password" aria-label="Password" style="position:absolute;left:100px;top:400px;width:300px">` },
  "/inner": { body: `<title>Inner</title><body><button onclick="parent.postMessage('pressed','*');document.title='Pressed'">In the frame</button>` },
  "/next": { body: `<title>Next</title><body>The next page` },
};

interface ActorState {
  pose: string | null;
  spot: { x: number; y: number } | null;
  covered: boolean;
  words: string;
  attached: boolean;
  hidden: boolean;
  flying: boolean;
}

const stateIn = (app: ElectronApplication, urlPart: string) =>
  app.evaluate(async ({ webContents }, part) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL().includes(part));
    return ((await contents?.executeJavaScriptInIsolatedWorld(1000, [{ code: "globalThis.__berryActor?.state() ?? null" }], true)) ?? null) as ActorState | null;
  }, urlPart);

const hostInPage = (page: Page) => page.evaluate(() => !!document.querySelector("blueberry-actor"));

const setup = async (settings: object = {}) => {
  const server = createServer((request, response) => {
    const port = (server.address() as AddressInfo).port;
    // Another origin, by name, on the same server.
    if (request.url === "/framed") PAGES["/framed"] = { body: `<title>Framed</title><body style="margin:0"><iframe src="http://localhost:${port}/inner" style="position:absolute;left:200px;top:250px;width:400px;height:200px;border:0"></iframe>` };
    const found = PAGES[request.url ?? ""] ?? { body: "Nothing" };
    response.setHeader("content-type", "text/html");
    if (found.csp) response.setHeader("content-security-policy", found.csp);
    response.end(found.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const model: FakeModel = await startFakeModel();
  const app = await launchApp(undefined, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");
  await chrome.evaluate((patch) => window.chromeAPI.settings.updateSettings({ actionApproval: "never", ...patch }), settings);
  const open = async (path: string) => {
    await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}${path}`);
    const page = await findView(app, `${origin}${path}`);
    await expect.poll(() => page.title()).not.toBe("");
    return page;
  };
  // Starts a job on the page in front, and it stays running until `release` lets its reply finish.
  const job = async (calls: Array<{ name: string; args: object }>) => {
    calls.forEach((call) => model.callTools(call));
    const release = model.holdBeforeFirstToken();
    const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Do it", { seePage: true }));
    const chatId = sent!.id;
    const toolResults = () => JSON.stringify(model.requests.at(-1)?.messages.filter(({ role }) => role === "tool") ?? []);
    const finished = async () => {
      release();
      await expect.poll(() => chrome.evaluate((id) => window.chromeAPI.library.getChat(id).then((chat) => chat?.messages.some(({ role }) => role === "assistant")), chatId)).toBe(true);
    };
    return { chatId, toolResults, finished, allAsked: () => expect.poll(() => model.requests.length).toBeGreaterThan(calls.length) };
  };
  const close = async () => {
    await app.close();
    model.close();
    server.close();
  };
  return { app, chrome, model, origin, open, job, close };
};

test("the bird clicks without changing what's clicked, and nothing it draws reaches the agent", async () => {
  const { app, open, job, close } = await setup();
  try {
    const page = await open("/plain");
    const { allAsked, toolResults, finished } = await job([
      { name: "list_elements", args: { everything: true } },
      { name: "click", args: { ref: "e1" } },
      { name: "read_page", args: {} },
      { name: "list_elements", args: { everything: true } },
      { name: "find_in_page", args: { query: "Clicking" } },
    ]);
    await allAsked();

    // A real click, not a scripted one, which is what it would be if the bird had got in the way.
    await expect(page).toHaveTitle("Pressed by true");
    await expect.poll(() => stateIn(app, "/plain")).toMatchObject({ attached: true });
    const state = (await stateIn(app, "/plain"))!;

    // It's there, and the page can't see inside it or hit it.
    expect(await page.evaluate(() => document.querySelector("blueberry-actor")?.shadowRoot ?? null)).toBeNull();
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y - 20)?.tagName, state.spot!);
    expect(under).not.toBe("BLUEBERRY-ACTOR");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("blueberry-actor")!).pointerEvents)).toBe("none");

    const results = toolResults();
    expect(results).toContain("The words on this page");
    expect(results).toContain("Press me now");
    expect(results).toContain("No matches");
    expect(results).not.toContain("Clicking");
    expect(results).not.toContain("blueberry");
    expect(await page.evaluate(() => document.documentElement.innerText)).not.toContain("Clicking");
    await finished();

    // It flies off, and nothing of it is left.
    await expect.poll(() => hostInPage(page)).toBe(false);
    expect(await stateIn(app, "/plain")).toBeNull();
  } finally {
    await close();
  }
});

test("the bird isn't in a screenshot", async () => {
  const { app, open, job, close, model } = await setup();
  try {
    await open("/green");
    const { allAsked, finished } = await job([
      { name: "hover", args: { ref: "e1" } },
      { name: "screenshot", args: {} },
    ]);
    await allAsked();
    await expect.poll(async () => (await stateIn(app, "/green"))?.attached).toBe(true);
    // After a capture it's back.
    await expect.poll(async () => (await stateIn(app, "/green"))?.hidden).toBe(false);
    const image = JSON.stringify(model.requests.at(-1)?.messages).match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/)?.[0];
    expect(image).toBeTruthy();
    // Nothing but the page's green, on which the bird and its line would show.
    const strays = await app.evaluate(({ nativeImage }, url) => {
      const picture = nativeImage.createFromDataURL(url);
      const { width, height } = picture.getSize();
      const bitmap = picture.toBitmap();
      let dark = 0;
      for (let at = 0; at < width * height * 4; at += 4) {
        // BGRA. The bird and the line are dark or white, and the page isn't either.
        if (bitmap[at + 1] < 100 || (bitmap[at] > 150 && bitmap[at + 2] > 150)) dark++;
      }
      return dark;
    }, image!);
    expect(strays).toBe(0);
    await finished();
  } finally {
    await close();
  }
});

test("a page that moves things under the bird still can't get the click", async () => {
  const { open, job, close } = await setup();
  try {
    const page = await open("/trap");
    const { allAsked, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e1" } },
    ]);
    await allAsked();
    expect(await page.evaluate(() => (window as unknown as { coverClicks: number }).coverClicks)).toBe(0);
    await finished();
  } finally {
    await close();
  }
});

test("it faces the user while a job waits for an answer, and the click waits for it", async () => {
  const { app, chrome, open, job, close } = await setup({ actionApproval: "always" });
  try {
    const page = await open("/plain");
    const { chatId, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "hover", args: { ref: "e1" } },
      { name: "click", args: { ref: "e1" } },
    ]);
    await expect.poll(() => stateIn(app, "/plain")).toMatchObject({ pose: "asking", words: "Waiting for you" });
    await expect(page).toHaveTitle("Plain");
    const approval = await chrome.evaluate((id) => window.chromeAPI.library.getChat(id).then((chat) => chat?.approval?.id), chatId);
    await chrome.evaluate(([id, asked]) => window.chromeAPI.chat.decide(id!, asked!, true), [chatId, approval]);
    await expect(page).toHaveTitle("Pressed by true");
    await finished();
  } finally {
    await close();
  }
});

test("for a frame from another origin it stands at the frame in the top page", async () => {
  const { app, open, job, close, model } = await setup();
  try {
    await open("/framed");
    const { allAsked, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "f1.e1" } },
    ]);
    await allAsked();
    expect(JSON.stringify(model.requests.at(-1)?.messages)).toContain("scripted click");
    await expect.poll(async () => (await stateIn(app, "/framed"))?.spot?.x).toBeGreaterThan(200);
    const state = (await stateIn(app, "/framed"))!;
    expect(state.spot!.x).toBeLessThan(600);
    expect(state.spot!.y).toBeGreaterThan(200);
    expect(state.spot!.y).toBeLessThan(330);
    await finished();
  } finally {
    await close();
  }
});

test("on a zoomed page it stands in the right place and the click lands, and between steps it's thinking", async () => {
  const { app, open, job, close, model } = await setup();
  try {
    const page = await open("/plain");
    await app.evaluate(({ webContents }) => {
      webContents.getAllWebContents().find((contents) => contents.getURL().includes("/plain"))!.setZoomFactor(1.5);
    });
    model.thinkFor(1200);
    const { finished } = await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e1" } },
      { name: "hover", args: { ref: "e1" } },
    ]);
    await expect(page).toHaveTitle("Pressed by true", { timeout: 8000 });
    await expect.poll(async () => (await stateIn(app, "/plain"))?.pose).toBe("thinking");
    const { x, y } = (await stateIn(app, "/plain"))!.spot!;
    // In the page's own pixels, by the button at 300 to 460 across and 300 down.
    expect(x).toBeGreaterThan(300);
    expect(x).toBeLessThan(460);
    expect(y).toBeGreaterThanOrEqual(300);
    expect(y).toBeLessThan(344);
    await finished();
  } finally {
    await close();
  }
});

test("Stop ends the job while the bird is on its way, so the click never happens", async () => {
  const { app, chrome, open, job, close } = await setup();
  try {
    const page = await open("/plain");
    await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e1" } },
    ]);
    await expect.poll(async () => (await stateIn(app, "/plain"))?.flying ?? false, { intervals: [10] }).toBe(true);
    const tabId = await chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.find(({ isActive }) => isActive)!.id));
    expect(await chrome.evaluate((id) => window.chromeAPI.browser.stopWork(id), tabId)).toBe(true);
    await expect.poll(() => hostInPage(page)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(page).toHaveTitle("Plain");
    expect(await chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.some(({ berryWorking }) => berryWorking)))).toBe(false);
  } finally {
    await close();
  }
});

test("it works on a page with the strictest CSP, follows a scroll and types at a pace", async () => {
  const { app, open, job, close } = await setup();
  try {
    await open("/strict");
    let current = await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e1" } },
    ]);
    await current.allAsked();
    await expect.poll(async () => (await stateIn(app, "/strict"))?.attached).toBe(true);
    await current.finished();

    const form = await open("/form");
    current = await job([
      { name: "list_elements", args: {} },
      { name: "type_text", args: { ref: "e1", text: "Ada Lovelace" } },
    ]);
    // Letters arrive one at a time: partway through, the field has some of it.
    await expect.poll(() => form.locator("#field").inputValue(), { intervals: [20] }).toMatch(/^Ada/);
    const partway = await form.locator("#field").inputValue();
    expect((await stateIn(app, "/form"))?.words).toBe("Typing in Your name");
    await current.allAsked();
    await expect(form.locator("#field")).toHaveValue("Ada Lovelace");
    expect(partway.length).toBeLessThan("Ada Lovelace".length);

    // The page scrolls under it, and it stays on the field.
    const before = (await stateIn(app, "/form"))!.spot!;
    await form.evaluate(() => scrollTo(0, 100));
    await expect.poll(async () => (await stateIn(app, "/form"))?.spot?.y).toBeCloseTo(before.y - 100, 0);
    await current.finished();

    // The user's click sends it away at once, though a job with the page open carries on.
    current = await job([{ name: "list_elements", args: {} }]);
    await current.allAsked();
    await form.mouse.click(600, 600);
    await expect.poll(() => hostInPage(form)).toBe(false);
    await current.finished();
    // And it stays away for a while, whatever the job does next.
    current = await job([{ name: "hover", args: { ref: "e1" } }]);
    await current.allAsked();
    expect(await hostInPage(form)).toBe(false);
    await current.finished();

    // Nothing is drawn while the keyboard is in a password field, and the typing there isn't paced or named.
    await new Promise((resolve) => setTimeout(resolve, 5100));
    await form.locator("#pass").focus();
    current = await job([{ name: "list_elements", args: {} }]);
    await current.allAsked();
    await expect.poll(async () => (await stateIn(app, "/form"))?.covered).toBe(true);
    await current.finished();
  } finally {
    await close();
  }
});

test("a background tab pays nothing, and the bird appears when the user goes there", async () => {
  const { app, chrome, open, job, close, origin, model } = await setup();
  try {
    await open("/plain");
    const { allAsked, finished } = await job([
      { name: "open_tab", args: { url: `${origin}/form` } },
      { name: "list_elements", args: {} },
      { name: "type_text", args: { ref: "e1", text: "Ada Lovelace" } },
    ]);
    await allAsked();
    const behind = await findView(app, `${origin}/form`);
    // All at once and with nothing drawn, behind the user.
    await expect(behind.locator("#field")).toHaveValue("Ada Lovelace");
    expect(await hostInPage(behind)).toBe(false);
    expect(model.requests.length).toBeGreaterThan(3);

    const id = await chrome.evaluate((url) => window.chromeAPI.browser.getTabs().then((tabs) => tabs.find((tab) => tab.url === url)!.id), `${origin}/form`);
    await chrome.evaluate((tab) => window.chromeAPI.browser.switchTab(tab), id);
    await expect.poll(() => hostInPage(behind)).toBe(true);
    await finished();
  } finally {
    await close();
  }
});

test("settings reach the page: a marker when still, a pointer with Hide Berry, nothing when off", async () => {
  const { app, chrome, open, job, close, model } = await setup({ keepBerryStill: true });
  try {
    const page = await open("/plain");
    let current = await job([
      { name: "list_elements", args: {} },
      { name: "hover", args: { ref: "e1" } },
    ]);
    await current.allAsked();
    await expect.poll(async () => (await stateIn(app, "/plain"))?.pose).toBe("marker");
    expect((await stateIn(app, "/plain"))?.flying).toBe(false);
    await current.finished();

    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ keepBerryStill: false, showBerry: false }));
    current = await job([{ name: "hover", args: { ref: "e1" } }]);
    await current.allAsked();
    await expect.poll(async () => (await stateIn(app, "/plain"))?.pose).toBe("pointer");
    await current.finished();

    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: true, birdOnPages: false }));
    await expect.poll(() => hostInPage(page)).toBe(false);
    model.reset();
    current = await job([{ name: "click", args: { ref: "e1" } }]);
    await current.allAsked();
    await expect(page).toHaveTitle("Pressed by true");
    expect(await hostInPage(page)).toBe(false);
    await current.finished();

    // The system's Reduce Motion, as a page's media query reports it, does what Keep Berry still does.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ birdOnPages: true }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    current = await job([{ name: "hover", args: { ref: "e1" } }]);
    await current.allAsked();
    await expect.poll(async () => (await stateIn(app, "/plain"))?.pose).toBe("marker");
    await current.finished();
  } finally {
    await close();
  }
});

test("mid-job navigation brings it back on the new page, and a handed-over tab has none", async () => {
  const { app, chrome, open, job, close, origin } = await setup();
  try {
    const page = await open("/plain");
    let current = await job([
      { name: "hover", args: { ref: "e1" } },
      { name: "list_elements", args: {} },
      { name: "hover", args: { ref: "e1" } },
      { name: "go_to", args: { url: `${origin}/next` } },
    ]);
    await current.allAsked();
    await expect(page).toHaveTitle("Next");
    await expect.poll(() => stateIn(app, "/next")).toMatchObject({ attached: true });
    await current.finished();
    await expect.poll(() => hostInPage(page)).toBe(false);

    current = await job([{ name: "hand_to_user", args: { need: "sign-in" } }]);
    await expect.poll(() => chrome.evaluate(() => window.chromeAPI.library.getLibrary().then((library) => library.needsYou.length))).toBeGreaterThan(0);
    expect(await hostInPage(page)).toBe(false);
  } finally {
    await close();
  }
});
