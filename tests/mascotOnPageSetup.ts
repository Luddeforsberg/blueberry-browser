import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

// The pages and the app that the mascotOnPage.*.spec.ts files share.
const BUTTON = `<button id="go" style="position:absolute;left:300px;top:300px;width:160px;height:44px" onclick="document.title='Pressed by '+event.isTrusted">Press me now</button>`;
const PAGES: Record<string, { body: string; csp?: string }> = {
  "/plain": { body: `<title>Plain</title><body style="margin:0">${BUTTON}<p>The words on this page</p>` },
  "/green": {
    body: `<title>Green</title><body style="margin:0;background:rgb(0,200,0);height:100vh">${BUTTON.replace(/style="[^"]*"/, 'style="position:absolute;left:300px;top:300px;width:160px;height:44px;background:rgb(0,200,0);color:rgb(0,200,0);border:0"').replace("Press me now", "go")}`,
  },
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
  "/form": {
    body: `<title>Form</title><body style="margin:0;height:3000px"><input id="field" aria-label="Your name" style="position:absolute;left:100px;top:300px;width:300px"><input id="pass" type="password" aria-label="Password" style="position:absolute;left:100px;top:400px;width:300px">`,
  },
  "/inner": {
    body: `<title>Inner</title><body><button onclick="parent.postMessage('pressed','*');document.title='Pressed'">In the frame</button>`,
  },
  // A button with words right up against it, and clear space below.
  "/crowded": {
    body: `<title>Crowded</title><body style="margin:0;font:16px/22px sans-serif"><p id="words" style="position:absolute;left:150px;top:190px;width:460px;margin:0">Words someone might be reading, a good few of them, set out over several lines so they fill all of the space directly above the button and around where the mascot will stand. They carry on for a while yet, so that nothing above it is clear.</p><button id="go" style="position:absolute;left:300px;top:300px;width:160px;height:44px" onclick="document.title='Pressed'">Press me now</button>`,
  },
  "/two": {
    body: `<title>Two</title><body style="margin:0"><button id="a" style="position:absolute;left:60px;top:80px;width:120px;height:40px">First</button><button id="b" style="position:absolute;left:500px;top:420px;width:160px;height:44px" onclick="document.title='Placed'">Place order</button>`,
  },
  "/submit": {
    body: `<title>Submit</title><body style="margin:0"><form onsubmit="event.preventDefault();document.title='Submitted'"><input id="field" aria-label="Name" style="position:absolute;left:100px;top:300px;width:300px"></form>`,
  },
  "/next": { body: `<title>Next</title><body>The next page` },
};

export interface ActorState {
  pose: string | null;
  spot: { x: number; y: number } | null;
  covered: boolean;
  words: string;
  line: { left: number; top: number; right: number; bottom: number };
  attached: boolean;
  hidden: boolean;
  flying: boolean;
}

export const stateIn = (app: ElectronApplication, urlPart: string) =>
  app.evaluate(async ({ webContents }, part) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL().includes(part));
    return ((await contents?.executeJavaScriptInIsolatedWorld(1000, [{ code: "globalThis.__berryActor?.state() ?? null" }], true)) ??
      null) as ActorState | null;
  }, urlPart);

export const hostInPage = (page: Page) => page.evaluate(() => !!document.querySelector("blueberry-actor"));

export const setup = async (settings: object = {}) => {
  const server = createServer((request, response) => {
    const port = (server.address() as AddressInfo).port;
    // Another origin, by name, on the same server.
    if (request.url === "/framed")
      PAGES["/framed"] = {
        body: `<title>Framed</title><body style="margin:0"><iframe src="http://localhost:${port}/inner" style="position:absolute;left:200px;top:250px;width:400px;height:200px;border:0"></iframe>`,
      };
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
      await expect
        .poll(() =>
          chrome.evaluate(
            (id) => window.chromeAPI.library.getChat(id).then((chat) => chat?.messages.some(({ role }) => role === "assistant")),
            chatId,
          ),
        )
        .toBe(true);
    };
    // The first message may wait for LangChain to finish loading, and sends the page, about 3s before the model is first asked, and then the mascot
    // flies to each step, so these jobs take 4 to 6s alone: past the default 5s, and more under load.
    return {
      chatId,
      toolResults,
      finished,
      allAsked: () => expect.poll(() => model.requests.length, { timeout: 15_000 }).toBeGreaterThan(calls.length),
    };
  };
  const close = async () => {
    await app.close();
    model.close();
    server.close();
  };
  return { app, chrome, model, origin, open, job, close };
};
