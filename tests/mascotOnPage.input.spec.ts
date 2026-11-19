import { expect, test } from "@playwright/test";
import { setup, stateIn, hostInPage } from "./mascotOnPageSetup";

test("the mascot clicks without changing what's clicked, and nothing it draws reaches the agent", async () => {
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

    // A real click, not a scripted one, which is what it would be if the mascot had got in the way.
    await expect(page).toHaveTitle("Pressed by true");
    await expect.poll(() => stateIn(app, "/plain")).toMatchObject({ attached: true });
    const state = (await stateIn(app, "/plain"))!;
    // The mascot says what the inset glow said, so there's only the ring around the card.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::after").boxShadow)).toBe("none");

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

test("the mascot isn't in a screenshot", async () => {
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
    // Nothing but the page's green, on which the mascot and its line would show.
    const strays = await app.evaluate(({ nativeImage }, url) => {
      const picture = nativeImage.createFromDataURL(url);
      const { width, height } = picture.getSize();
      const bitmap = picture.toBitmap();
      let dark = 0;
      for (let at = 0; at < width * height * 4; at += 4) {
        // BGRA. The mascot and the line are dark or white, and the page isn't either.
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

test("a page that moves things under the mascot still can't get the click", async () => {
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

test("the user stepping into a field stops the typing, and what's in it stays theirs", async () => {
  const { app, open, job, close, model } = await setup();
  try {
    const form = await open("/form");
    const text = "Ada Lovelace wrote the first program for a machine that was never built";
    const { allAsked, finished, toolResults } = await job([
      { name: "list_elements", args: {} },
      { name: "type_text", args: { ref: "e1", text, submit: true } },
      { name: "type_text", args: { ref: "e1", text: "Typed over it" } },
    ]);
    await expect.poll(() => form.locator("#field").inputValue(), { intervals: [20] }).toMatch(/^Ada/);
    const field = (await form.locator("#field").boundingBox())!;
    await form.mouse.click(field.x + 20, field.y + field.height / 2);
    await form.keyboard.type(" and me");
    await expect.poll(() => hostInPage(form)).toBe(false);
    await allAsked();

    const value = await form.locator("#field").inputValue();
    expect(value).toContain(" and me".trim());
    expect(value).not.toContain("Typed over it");
    expect(value).not.toBe(text);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(await form.locator("#field").inputValue()).toBe(value);
    // The job hears why, twice, and goes on: the second try at that field does nothing.
    expect(toolResults().match(/typing stopped/g)).toHaveLength(2);
    expect(model.requests.length).toBeGreaterThan(3);
    expect(await stateIn(app, "/form")).toBeNull();
    await finished();
  } finally {
    await close();
  }
});

test("the user stepping in just before Enter stops the submit too", async () => {
  const { app, open, job, close } = await setup();
  try {
    const page = await open("/submit");
    const { allAsked, toolResults, finished } = await job([
      { name: "list_elements", args: {} },
      { name: "type_text", args: { ref: "e1", text: "Ada", submit: true } },
    ]);
    await expect.poll(async () => (await stateIn(app, "/submit"))?.words, { intervals: [10] }).toBe("Submitting");
    await page.mouse.click(600, 600);
    await allAsked();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await expect(page).toHaveTitle("Submit");
    expect(toolResults()).toContain("nothing was submitted");
    await finished();
  } finally {
    await close();
  }
});

test("Stop ends the job while the mascot is on its way, so the click never happens", async () => {
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
    expect(
      await chrome.evaluate(() => window.chromeAPI.browser.getTabs().then((tabs) => tabs.some(({ berryWorking }) => berryWorking))),
    ).toBe(false);
  } finally {
    await close();
  }
});

test("turning off page access while the mascot is on its way means the click never happens", async () => {
  const { app, chrome, open, job, close } = await setup();
  try {
    const page = await open("/plain");
    await job([
      { name: "list_elements", args: {} },
      { name: "click", args: { ref: "e1" } },
    ]);
    await expect.poll(async () => (await stateIn(app, "/plain"))?.flying ?? false, { intervals: [10] }).toBe(true);
    await chrome.evaluate(() => window.chromeAPI.chat.setPageAccess(false));
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(page).toHaveTitle("Plain");
  } finally {
    await close();
  }
});

test("a page's change listener clearing the field gets the text typed again, not a false done", async () => {
  const { open, job, close } = await setup();
  try {
    const form = await open("/form");
    await form.evaluate(() =>
      document
        .querySelector("#field")!
        .addEventListener("change", (event) => ((event.target as HTMLInputElement).value = ""), { once: true }),
    );
    const current = await job([
      { name: "list_elements", args: {} },
      { name: "type_text", args: { ref: "e1", text: "Ada Lovelace" } },
    ]);
    await current.finished();
    await expect(form.locator("#field")).toHaveValue("Ada Lovelace");
  } finally {
    await close();
  }
});
