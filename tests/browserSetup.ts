import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";
import { defined } from "../src/shared/testing";

// What the browser.*.spec.ts files share: a server of test pages and a fake model for each file, a fresh app for each
// test, and the ways in that their tests use.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwAEAgH/1oN2SgAAAABJRU5ErkJggg==", "base64");

let server: Server;
export let origin: string;
export let model: FakeModel;
export let app: ElectronApplication;
export let chrome: Page;

// Each spec file calls this once at its top.
export function setUpBrowserApp(): void {
  test.beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/icon.png") {
        response.setHeader("content-type", "image/png");
        response.end(PNG);
        return;
      }
      response.setHeader("content-type", "text/html");
      if (request.url === "/risks") {
        response.end(`<!doctype html><meta charset="utf-8"><title>Risks</title><body>
        <a href="/next" onclick="event.preventDefault(); window.clicked = 'Next page'">Next page</a>
        <button onclick="window.clicked = 'Load more'">Load more</button>
        <form onsubmit="event.preventDefault(); window.clicked = 'Find'"><input type="search" aria-label="Search"><button>Find</button></form>
        <button onclick="window.clicked = 'Delete'">Delete account</button>
        <button onclick="window.clicked = 'Ta bort'">Ta bort inlägg</button>
        <button onclick="window.clicked = 'Icon'" aria-label=""><svg width="16" height="16"></svg></button>
        <form method="post" onsubmit="event.preventDefault(); window.clicked = 'Go'"><input aria-label="Title"><button>Go</button></form>
      </body>`);
        return;
      }
      if (request.url === "/form") {
        response.end(`<!doctype html><title>Form</title><body>
        <button onclick="document.title = 'Saved'">Save</button>
        <form onsubmit="event.preventDefault(); document.title = 'Sent ' + this.elements.note.value">
          <label>Note <input name="note" value="old"></label>
          <input type="password" name="secret" aria-label="Secret" value="hunter2">
          <button formaction="/draft">Draft</button>
        </form>
        <a href="/one">Continue</a></body>`);
        return;
      }
      if (request.url === "/real-input") {
        const port = (server.address() as AddressInfo).port;
        response.end(`<!doctype html><meta charset="utf-8"><title>Waiting</title><body>
        <button onclick="document.title = 'Real ' + event.isTrusted">Press</button>
        <iframe src="http://localhost:${port}/inner" width="300" height="100"></iframe>
      </body>`);
        return;
      }
      if (request.url === "/slides-under") {
        response.end(`<!doctype html><meta charset="utf-8"><title>Waiting</title><body>
        <div style="position: relative; width: 200px; height: 60px">
          <button id="named" style="width: 200px; height: 60px" onclick="document.title = 'Named ' + (window.decoyPressed ? 'and decoy' : 'only')"
            onmouseover="document.querySelector('#decoy').hidden = false">Open</button>
          <button id="decoy" hidden style="position: absolute; inset: 0" onclick="window.decoyPressed = true">Decoy</button>
        </div>
      </body>`);
        return;
      }
      if (request.url === "/keys") {
        response.end(`<!doctype html><title>Keys</title><body>
        <input aria-label="Box" onkeydown="sessionStorage.keys = (sessionStorage.keys ?? '') + '|' + event.key + (event.isTrusted ? '' : ' (fake)')" onkeyup="sessionStorage.box = this.value">
        <input aria-label="Sign-in step" autocomplete="one-time-code" value="123456">
        <a href="/one">Onward</a>
      </body>`);
        return;
      }
      if (request.url === "/inner") {
        response.end(`<!doctype html><meta charset="utf-8"><body><button onclick="this.textContent = 'Was pressed'">Inside</button>`);
        return;
      }
      if (request.url === "/frame") {
        response.end(`<!doctype html><title>Frame</title><body>A frame<script>
        location.hash = "moved";
        history.pushState({}, "", "/frame/moved");
      </script></body>`);
        return;
      }
      if (request.url === "/abilities") {
        response.end(`<!doctype html><meta charset="utf-8"><title>Abilities</title><body>
        <a href="/one">Plain link</a>
        <label>Size <select id="size">
          <option value="">Pick one</option><option value="s">Small</option><option value="m">Medium</option>
          <option value="x" disabled>Gone</option>
          <option value="blank"></option>
          <optgroup disabled label="Old"><option value="o">Older</option></optgroup>
        </select></label>
        <select id="sticky" aria-label="Sticky" onchange="this.value = 'a'"><option value="a">Keep</option><option value="b">Other</option></select>
        <input id="number" type="number" aria-label="Amount">
        <shadow-box></shadow-box>
        <div id="footer"><p id="close" style="cursor: pointer">Close</p></div>
        <input id="toggle" type="checkbox" aria-label="Finished" style="opacity: 0; width: 40px; height: 40px">
        <button style="opacity: 0">Ghost</button>
        <input type="password" aria-label="Secret" value="hunter2">
        <iframe src="http://localhost:${(server.address() as AddressInfo).port}/frame"></iframe>
        <script>
          customElements.define("shadow-box", class extends HTMLElement {
            connectedCallback() { this.attachShadow({ mode: "open" }).innerHTML = '<input type="search" placeholder="Deep search">'; }
          });
          document.getElementById("footer").addEventListener("click", () => { document.title = "Closed"; });
        </script></body>`);
        return;
      }
      response.end('<!doctype html><title>Fixture</title><link rel="icon" href="/icon.png"><body>hello from the page</body>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    model = await startFakeModel();
  });

  test.afterAll(() => {
    server.close();
    model.close();
  });

  test.beforeEach(async () => {
    model.reset();
    app = await launchApp(undefined, { modelEnv: model.env });
    chrome = await findView(app, "view=chrome");
  });

  test.afterEach(async () => {
    // No app if the launch failed, and this error would hide that one.
    await app?.close();
  });
}

// For a test that restarts the app, after closing the one it had. The next afterEach closes this one.
export const relaunch = async (...args: Parameters<typeof launchApp>) => {
  app = await launchApp(...args);
  chrome = await findView(app, "view=chrome");
};

export const getTabs = () => chrome.evaluate(() => window.chromeAPI.browser.getTabs());

export const activeTab = async () => {
  const active = (await getTabs()).filter((tab) => tab.isActive);
  expect(active).toHaveLength(1);
  return defined(active[0]);
};

export const openFixture = async (path = "/") => {
  await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}${path}`);
  const page = await findView(app, `${origin}${path}`);
  await page.waitForLoadState();
  return page;
};

export const tabOrder = async () => (await getTabs()).map((tab) => tab.page ?? tab.url.replace(origin, ""));

export const openChat = async () => {
  await chrome.getByRole("button", { name: "Show Berry" }).click();
  await expect(chrome.getByRole("complementary", { name: "Berry" })).toBeVisible();
};

export const askBeforeActing = (actionApproval: "risky" | "always" | "never") =>
  chrome.evaluate((value) => window.chromeAPI.settings.updateSettings({ actionApproval: value }), actionApproval);

export const askInPanel = async (text: string) => {
  const message = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await message.fill(text);
  await message.press("Enter");
};

// Chats are on the sidebar's Chats face. A row's name starts with the chat's title.
export const chatInSidebar = (title: string) =>
  chrome.getByRole("tabpanel", { name: "Chats" }).getByRole("button", { name: new RegExp(`^${title}`) });
export const showChats = () => chrome.getByRole("tab", { name: /^Chats/ }).click();

// What the main window's getContentSize gives, as the width and height it always is.
export const widthAndHeight = (size: number[]) => [defined(size[0]), defined(size[1])] satisfies [number, number];

export const setContentSize = async (width: number, height: number) =>
  widthAndHeight(
    await app.evaluate(
      ({ BaseWindow }, [width, height]) => {
        const [baseWindow] = BaseWindow.getAllWindows();
        if (!baseWindow) throw new Error("No window");
        baseWindow.setContentSize(width, height);
        return baseWindow.getContentSize();
      },
      [width, height] satisfies [number, number],
    ),
  );
