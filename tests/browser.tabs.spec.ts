import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setUpBrowserApp, origin, app, chrome, getTabs, activeTab, openFixture, tabOrder } from "./browserSetup";

setUpBrowserApp();

test("a new tab becomes the active tab", async () => {
  const before = await getTabs();

  const created = await chrome.evaluate((url) => window.chromeAPI.browser.createTab(url), `${origin}/`);

  expect(await getTabs()).toHaveLength(before.length + 1);
  expect((await activeTab()).id).toBe(created.id);
});

test("the sidebar lists tabs as they change, without being asked", async () => {
  await openFixture();

  const tab = chrome.getByRole("list", { name: "Tabs" }).getByRole("button", { name: "Fixture", exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-current", "page");
});

test("back and forward reflect the page's real history", async () => {
  const page = await openFixture("/first");
  const back = chrome.getByRole("button", { name: "Back", exact: true });
  const forward = chrome.getByRole("button", { name: "Forward", exact: true });

  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await page.evaluate((url) => {
    window.location.href = url;
  }, `${origin}/second`);
  await expect(back).toBeEnabled();

  await back.click();
  await expect(forward).toBeEnabled();
  await expect.poll(async () => (await activeTab()).url).toContain("/first");
});

test("links that open a new window become tabs, from every tab and from the chrome", async () => {
  const page = await openFixture();
  const windows = () => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);
  const count = (await getTabs()).length;

  await page.evaluate((url) => void window.open(url), `${origin}/from-page`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-page");

  await chrome.evaluate((url) => void window.open(url), `${origin}/from-chrome`);
  await expect.poll(async () => (await activeTab()).url).toContain("/from-chrome");

  expect(await getTabs()).toHaveLength(count + 2);
  expect(await windows()).toBe(1);
});

test("a page's popup is a real one, shown as a tab, and closing itself goes back to the page", async () => {
  // A sign-in popup on another site: it tells its opener how it went, and closes when told.
  const signIn = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Sign in</title><body><script>
      window.resizeTo(300, 200);
      window.opener.postMessage("signed in", "*");
      window.addEventListener("message", (event) => { if (event.data === "done") window.close(); });
    </script></body>`);
  });
  await new Promise<void>((resolve) => signIn.listen(0, "127.0.0.1", resolve));
  const signInOrigin = `http://127.0.0.1:${(signIn.address() as AddressInfo).port}`;
  try {
    const page = await openFixture();
    const opener = (await activeTab()).id;
    const count = (await getTabs()).length;
    const bounds = () => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getBounds());
    const before = await bounds();

    await page.evaluate(() =>
      window.addEventListener("message", (event) => {
        document.title = `Got ${event.data}`;
      }),
    );
    const opened = await page.evaluate((url) => {
      (window as Window & { popup?: Window | null }).popup = window.open(url, "signin", "width=300,height=200");
      return (window as Window & { popup?: Window | null }).popup !== null;
    }, `${signInOrigin}/`);
    expect(opened).toBe(true);
    await expect.poll(async () => (await activeTab()).url).toContain(signInOrigin);
    expect(await getTabs()).toHaveLength(count + 1);
    await expect.poll(() => page.title()).toBe("Got signed in");

    // It has a tab's preferences, not the opener's or anything it asked for, and the window kept its size.
    const preferences = await app.evaluate(({ webContents }, origin) => {
      const popup = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith(origin));
      // Electron's own record of what the page was made with, which its types leave out.
      const made = (
        popup as (typeof popup & { getLastWebPreferences?: () => Electron.WebPreferences | null }) | undefined
      )?.getLastWebPreferences?.();
      const { sandbox, contextIsolation, nodeIntegration, preload } = made ?? {};
      return { sandbox, contextIsolation, nodeIntegration, preload };
    }, signInOrigin);
    expect(preferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined });
    expect(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(1);
    expect(await bounds()).toEqual(before);

    await page.evaluate(() => (window as Window & { popup?: Window | null }).popup?.postMessage("done", "*"));
    await expect.poll(async () => (await getTabs()).length).toBe(count);
    expect((await activeTab()).id).toBe(opener);
  } finally {
    signIn.close();
  }
});

test("window.open ignores anything that isn't a web link", async () => {
  const page = await openFixture();
  const count = (await getTabs()).length;

  await page.evaluate(() => void window.open("file:///etc/hosts"));
  await page.evaluate((url) => window.fetch(url), `${origin}/settled`);

  expect(await getTabs()).toHaveLength(count);
});

test("activating the app with a window open doesn't start a second one", async () => {
  const windows = await app.evaluate(({ app, BaseWindow }) => {
    app.emit("activate");
    return BaseWindow.getAllWindows().length;
  });

  expect(windows).toBe(1);
});

test("the app reopens after its last window closes", async () => {
  test.skip(process.platform !== "darwin", "Only macOS keeps running with no windows");

  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].close());
  await expect.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(0);

  const windows = await app.evaluate(({ app, BaseWindow }) => {
    app.emit("activate");
    return BaseWindow.getAllWindows().length;
  });

  expect(windows).toBe(1);
});

test("favicons come from the page, not from Google", async () => {
  await openFixture();

  await expect.poll(async () => (await activeTab()).favicon).toBe(`${origin}/icon.png`);
  await expect(chrome.locator(`img[src="${origin}/icon.png"]`).first()).toBeAttached();
  await expect(chrome.locator('img[src*="google.com/s2/favicons"]')).toHaveCount(0);
});

test("dragging a tab reorders it in both layouts, and a short press only selects it", async () => {
  const pointerEvents = await chrome.evaluateHandle(() => {
    const events: Array<{ type: string; pointerId: number; buttons: number; x: number; y: number; trusted: boolean }> = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const) {
      window.addEventListener(
        type,
        (event) =>
          events.push({
            type: event.type,
            pointerId: event.pointerId,
            buttons: event.buttons,
            x: event.clientX,
            y: event.clientY,
            trusted: event.isTrusted,
          }),
        true,
      );
    }
    return events;
  });
  await openFixture("/a");
  await openFixture("/b");
  expect(await tabOrder()).toEqual(["new-tab", "/a", "/b"]);

  const tabs = chrome.getByRole("region", { name: "Tabs" }).getByRole("listitem");
  const drag = async (fromIndex: number, toIndex: number, axis: "x" | "y") => {
    const from = (await tabs.nth(fromIndex).boundingBox())!;
    const to = (await tabs.nth(toIndex).boundingBox())!;
    await chrome.mouse.move(from.x + 20, from.y + from.height / 2);
    await chrome.mouse.down();
    const x = axis === "x" ? to.x + 20 : from.x + 20;
    const y = axis === "y" ? to.y + to.height / 2 : from.y + from.height / 2;
    await chrome.mouse.move(x, y, { steps: 8 });
    await chrome.mouse.up();
  };

  // A press with no movement selects and keeps the order.
  await tabs.nth(0).getByRole("button", { name: "New tab", exact: true }).click();
  await expect.poll(async () => (await activeTab()).page).toBe("new-tab");
  expect(await tabOrder(), `Stationary-click pointer events: ${JSON.stringify(await pointerEvents.jsonValue())}`).toEqual([
    "new-tab",
    "/a",
    "/b",
  ]);

  // Windows can report the real cursor mid-press, far away and with no button down. That isn't a drag.
  const pressed = (await tabs.nth(0).boundingBox())!;
  await chrome.mouse.move(pressed.x + 20, pressed.y + pressed.height / 2);
  await chrome.mouse.down();
  await chrome.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 512, clientY: 384, buttons: 0 })));
  await chrome.mouse.up();
  // Long enough for a drop to settle, if this had been taken for one.
  await chrome.waitForTimeout(500);
  expect(await tabOrder()).toEqual(["new-tab", "/a", "/b"]);

  await drag(0, 2, "y");
  await expect.poll(tabOrder).toEqual(["/a", "/b", "new-tab"]);
  expect((await activeTab()).page).toBe("new-tab");

  await drag(2, 0, "y");
  await expect.poll(tabOrder).toEqual(["new-tab", "/a", "/b"]);

  // Past the end of the list, the tab stops at the last slot.
  const first = (await tabs.nth(0).boundingBox())!;
  const last = (await tabs.nth(2).boundingBox())!;
  await chrome.mouse.move(first.x + 20, first.y + first.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(first.x + 20, last.y + 400, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/a", "/b", "new-tab"]);

  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ layoutMode: "horizontal" }));
  await expect(chrome.getByRole("navigation", { name: "Sidebar" })).toHaveCount(0);
  const strip = chrome.getByRole("list", { name: "Tabs" }).getByRole("listitem");
  // This press lands on the favicon, which must not start the browser's own image drag.
  const a = (await strip.nth(0).boundingBox())!;
  const c = (await strip.nth(2).boundingBox())!;
  await chrome.mouse.move(a.x + 20, a.y + a.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(c.x + 20, a.y + a.height / 2, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/b", "new-tab", "/a"]);

  // Back to the start, and then just past half of the third tab. With room, the tabs are all as wide as they get.
  const back = (await strip.nth(2).boundingBox())!;
  await chrome.mouse.move(back.x + 20, back.y + back.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(back.x - 800, back.y + back.height / 2, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/a", "/b", "new-tab"]);
  const wide = (await strip.nth(0).boundingBox())!;
  const third = (await strip.nth(2).boundingBox())!;
  const along = third.x + third.width / 2 - (wide.x + wide.width) + 10;
  await chrome.mouse.move(wide.x + 20, wide.y + wide.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(wide.x + 20 + along, wide.y + wide.height / 2, { steps: 8 });
  await chrome.mouse.up();
  await expect.poll(tabOrder).toEqual(["/b", "new-tab", "/a"]);
});

test("Alt and an arrow move the focused tab, and stop at the ends", async () => {
  await openFixture("/a");
  const tab = chrome.getByRole("button", { name: "Fixture", exact: true });

  await tab.focus();
  await chrome.keyboard.press("Alt+ArrowUp");
  await expect.poll(tabOrder).toEqual(["/a", "new-tab"]);
  await expect(tab).toBeFocused();

  await chrome.keyboard.press("Alt+ArrowUp");
  await expect.poll(tabOrder).toEqual(["/a", "new-tab"]);

  await chrome.keyboard.press("Alt+ArrowDown");
  await expect.poll(tabOrder).toEqual(["new-tab", "/a"]);
  await expect(tab).toBeFocused();
});
