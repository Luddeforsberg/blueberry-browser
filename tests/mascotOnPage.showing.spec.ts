import { expect, test } from "@playwright/test";
import { findView } from "./app";
import { setup, stateIn, hostInPage, type ActorState } from "./mascotOnPageSetup";

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

test("while a card waits it stands on what the card is about, and stays put if it can't find that", async () => {
  const { app, chrome, open, job, close } = await setup({ actionApproval: "always" });
  try {
    const page = await open("/two");
    const { chatId, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "hover", args: { ref: "e1" } },
      { name: "click", args: { ref: "e2" } },
      { name: "click", args: { ref: "e99" } },
    ]);
    const approval = () => chrome.evaluate((id) => window.chromeAPI.library.getChat(id).then((chat) => chat?.approval?.id), chatId);
    const answer = (asked: string | undefined, allow: boolean) =>
      chrome.evaluate(([id, one, yes]) => window.chromeAPI.chat.decide(id as string, one as string, yes as boolean), [
        chatId,
        asked,
        allow,
      ] as const);
    await expect.poll(approval).toBeTruthy();
    await expect.poll(() => stateIn(app, "/two")).toMatchObject({ pose: "asking", words: "Waiting for you", flying: false });
    const { x, y } = (await stateIn(app, "/two"))!.spot!;
    expect(x).toBeGreaterThan(500);
    expect(x).toBeLessThan(660);
    expect(y).toBeGreaterThanOrEqual(420);
    expect(y).toBeLessThan(464);
    await expect(page).toHaveTitle("Two");
    const first = await approval();
    await answer(first, true);
    await expect(page).toHaveTitle("Placed");

    // Nothing there to stand on: asked about all the same, from where it was.
    await expect
      .poll(async () => {
        const next = await approval();
        return next && next !== first;
      })
      .toBeTruthy();
    await expect.poll(async () => (await stateIn(app, "/two"))?.pose).toBe("asking");
    const stayed = (await stateIn(app, "/two"))!.spot!;
    expect(stayed.x).toBe(x);
    expect(stayed.y).toBe(y);
    await answer(await approval(), false);
    await finished();
  } finally {
    await close();
  }
});

test("coming back to the tab while a card waits, it stands on what the card is about again", async () => {
  const { app, chrome, open, job, close, origin } = await setup({ actionApproval: "always" });
  try {
    await open("/two");
    const { chatId, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e2" } },
    ]);
    const approval = () => chrome.evaluate((id) => window.chromeAPI.library.getChat(id).then((chat) => chat?.approval?.id), chatId);
    await expect.poll(approval).toBeTruthy();
    await expect.poll(() => stateIn(app, "/two")).toMatchObject({ pose: "asking", flying: false });

    const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
    const two = tabs.find((tab) => tab.url === `${origin}/two`)!;
    await open("/next");
    await expect.poll(async () => (await stateIn(app, "/two"))?.attached ?? false).toBe(false);
    await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), two.id);

    await expect
      .poll(() => stateIn(app, "/two"))
      .toMatchObject({ pose: "asking", words: "Waiting for you", attached: true, flying: false });
    const { x, y } = (await stateIn(app, "/two"))!.spot!;
    expect(x).toBeGreaterThan(500);
    expect(x).toBeLessThan(660);
    expect(y).toBeGreaterThanOrEqual(420);
    expect(y).toBeLessThan(464);
    await chrome.evaluate(([id, asked]) => window.chromeAPI.chat.decide(id!, asked!, false), [chatId, await approval()]);
    await finished();
  } finally {
    await close();
  }
});

test("its words stay off the target and the text beside it, and on screen", async () => {
  const { app, open, job, close } = await setup();
  try {
    const page = await open("/crowded");
    const { finished } = await job([
      { name: "list_elements", args: {} },
      { name: "hover", args: { ref: "e1" } },
    ]);
    // Once landed, and before it goes back to thinking.
    let line: ActorState["line"] | undefined;
    await expect
      .poll(
        async () => {
          const state = await stateIn(app, "/crowded");
          if (state?.words.includes("Pointing at") && !state.flying) line = state.line;
          return !!line;
        },
        { intervals: [15] },
      )
      .toBe(true);
    line = line!;
    const boxes = await page.evaluate(() => ["words", "go"].map((id) => document.getElementById(id)!.getBoundingClientRect().toJSON()));
    for (const box of boxes) {
      expect(line.left < box.right && line.right > box.left && line.top < box.bottom && line.bottom > box.top).toBe(false);
    }
    expect(line.left).toBeGreaterThanOrEqual(0);
    expect(line.top).toBeGreaterThanOrEqual(0);
    await finished();
  } finally {
    await close();
  }
});

test("for a frame from another origin it stands at the frame in the top page", async () => {
  const { app, open, job, close, model } = await setup();
  try {
    const page = await open("/framed");
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
    // Focus in there could be on a password, which it can't see, so it hides until focus comes out.
    await page.locator("iframe").focus();
    await expect.poll(async () => (await stateIn(app, "/framed"))?.covered).toBe(true);
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
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().includes("/plain"))!
        .setZoomFactor(1.5);
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

test("a key press as the very first thing still shows the mascot, not only its words", async () => {
  const { app, open, job, close } = await setup();
  try {
    await open("/plain");
    await job([{ name: "press_key", args: { key: "Escape" } }]);
    await expect.poll(async () => (await stateIn(app, "/plain"))?.words, { intervals: [10] }).toBe("Pressing a key");
    expect((await stateIn(app, "/plain"))?.pose).not.toBeNull();
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

test("a background tab pays nothing, and the mascot appears when the user goes there", async () => {
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

    const id = await chrome.evaluate(
      (url) => window.chromeAPI.browser.getTabs().then((tabs) => tabs.find((tab) => tab.url === url)!.id),
      `${origin}/form`,
    );
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

    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ showBerry: true, mascotOnPages: false }));
    await expect.poll(() => hostInPage(page)).toBe(false);
    model.reset();
    current = await job([{ name: "click", args: { ref: "e1" } }]);
    await current.allAsked();
    await expect(page).toHaveTitle("Pressed by true");
    expect(await hostInPage(page)).toBe(false);
    await current.finished();

    // The system's Reduce Motion, as a page's media query reports it, does what Keep Berry still does.
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ mascotOnPages: true }));
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
    await expect
      .poll(() => chrome.evaluate(() => window.chromeAPI.library.getLibrary().then((library) => library.needsYou.length)))
      .toBeGreaterThan(0);
    expect(await hostInPage(page)).toBe(false);
  } finally {
    await close();
  }
});
