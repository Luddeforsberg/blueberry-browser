import { expect, test } from "@playwright/test";
import { findView } from "./app";
import { ARM_MS } from "../src/renderer/common/components/cardKeys";
import {
  setUpBrowserApp,
  origin,
  model,
  app,
  chrome,
  getTabs,
  activeTab,
  openFixture,
  openChat,
  askBeforeActing,
  askInPanel,
} from "./browserSetup";
import { defined } from "../src/shared/testing";

setUpBrowserApp();

test("Berry reads a page with a tool and shows the step, and only where it can see a page", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const site = new URL(origin).hostname;

  model.callTools({ name: "find_in_page", args: { query: "HELLO" } });
  await askInPanel("Does it say hello?");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  // The working line folds when it's done, and opens to show the step.
  await panel.getByRole("button", { name: `1 step on ${site}` }).click();
  await expect(panel.getByRole("list", { name: "Steps" }).getByText(`Searched ${site}`)).toBeVisible();

  const offered = defined(model.requests[0]);
  const answered = defined(model.requests[1]);
  expect(offered.tools?.map((tool) => tool.function.name)).toContain("find_in_page");
  const toolMessage = answered.messages.at(-1);
  expect(toolMessage?.role).toBe("tool");
  expect(toolMessage?.content).toContain("1 matches");
  expect(toolMessage?.content).toContain("hello from the page");
  await expect(panel.getByText("matches on")).toHaveCount(0);

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  await message.fill("Something else");
  await message.press("Enter");
  await expect.poll(() => model.requests.length).toBe(3);
});

test("a chat with no page opens tabs behind itself, and reaches only those", async () => {
  await askBeforeActing("always");
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  const card = chrome.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_tabs", args: {} });
  model.callTools({ name: "open_tab", args: { url: `${origin}/form` } });
  model.callTools({ name: "read_page", args: {} });
  await message.fill("Look at the form");
  await message.press("Enter");

  await expect(card.locator("p").getByText(`Open ${origin}/form in a new tab`)).toBeVisible();
  const reachable = JSON.stringify(model.requests.at(-1)?.messages.at(-1));
  expect(reachable).not.toContain(origin);
  await card.getByRole("button", { name: "Allow", exact: true }).click();

  await expect(chrome.getByText("A reply from the model")).toBeVisible();
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Save");
  expect((await activeTab()).page).toBe("chat");
  // It closed once the job was done, and the reply keeps it.
  expect((await getTabs()).map((tab) => tab.url)).not.toContain(`${origin}/form`);
  await expect(chrome.getByRole("list", { name: "Pages it used" }).getByRole("button")).toHaveCount(1);
});

test("real input in a tab behind the chat, a card naming another site's frame, and a question", async () => {
  await askBeforeActing("risky");
  await openFixture();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  const card = chrome.getByRole("region", { name: "Approval needed" });
  const url = `${origin}/real-input`;
  const framed = `http://localhost:${new URL(origin).port}`;

  model.callTools({ name: "open_tab", args: { url } });
  model.callTools({ name: "list_elements", args: {} });
  model.callTools({ name: "click", args: { ref: "e1" } });
  model.callTools({ name: "click", args: { ref: "f1.e1" } });
  model.callTools({ name: "ask_user", args: { question: "What is your password?" } });
  model.callTools({ name: "ask_user", args: { question: "Which colour?", answers: ["Blue", "Green", "123456"] } });
  // Held, since its tab closes once it's done.
  const finish = model.holdBeforeFirstToken();
  await message.fill("Press them");
  await message.press("Enter");

  // A site the user didn't name asks before it's opened.
  await expect(card.locator("p").getByText(`Open ${url} in a new tab`)).toBeVisible();
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  // Even a harmless-looking button in another site's frame asks, and says whose it is.
  await expect(card.locator("p").getByText(`Click the button “Inside” in a frame from ${framed}, inside ${url}`)).toBeVisible();
  const why = await chrome.evaluate(() => window.chromeAPI.library.getLibrary().then(({ needsYou }) => needsYou[0]?.approval.why));
  expect(why).toEqual({ reason: "other-origin-frame", mark: framed });
  await card.getByRole("button", { name: "Allow", exact: true }).click();

  const question = chrome.getByRole("region", { name: "Berry is asking" });
  await expect(question.getByText("Which colour?")).toBeVisible();
  // The prompt box ignores Enter for ARM_MS after a question arrives, so a send already on its way can't answer it.
  // The question is on screen, so the box has been answering since before this.
  const askedAt = await chrome.evaluate(() => performance.now());
  // The answers to press arrive with it, without the one shaped like a code.
  const asked = await chrome.evaluate(() => window.chromeAPI.library.getLibrary().then(({ needsYou }) => needsYou[0]?.approval));
  expect(asked).toMatchObject({ text: "Which colour?", question: true, answers: ["Blue", "Green"] });
  await expect(question.getByRole("button", { name: "Green" })).toBeVisible();
  // There's no field in the card: the prompt box is where it's answered, and says so.
  await expect(question.getByRole("textbox")).toHaveCount(0);
  // The chat's prompt box, now that the new tab has become the chat.
  const answer = chrome.getByRole("textbox", { name: "Message" });
  await expect(answer).toHaveAttribute("placeholder", "Answer Berry, or pick one above");
  await answer.fill("Blue");
  await chrome.waitForFunction(([since, arm]) => performance.now() - since >= arm, [askedAt, ARM_MS] satisfies [number, number]);
  await answer.press("Enter");

  await expect.poll(() => JSON.stringify(model.requests.at(-1)?.messages)).toContain("The user answered: Blue");
  expect(JSON.stringify(model.requests.at(-1)?.messages)).toContain("never go through this chat");

  const page = app.windows().find((view) => view.url() === url)!;
  // The click arrived as a person's, in a tab the user isn't on.
  await expect(page).toHaveTitle("Real true");
  await expect(page.frames().at(-1)!.getByRole("button", { name: "Was pressed" })).toBeVisible();
  expect((await activeTab()).page).toBe("chat");
  finish();
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
});

test("a real click that would land on something else is stopped, and only the named element gets clicked", async () => {
  await askBeforeActing("never");
  const page = await openFixture("/slides-under");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  model.callTools({ name: "list_elements", args: { query: "Open" } });
  model.callTools({ name: "click", args: { ref: "e1" } });
  const message = panel.getByRole("textbox", { name: "Message" });
  await message.fill("Open it");
  await message.press("Enter");

  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(page).toHaveTitle("Named only");
  expect(await page.evaluate(() => (window as unknown as { decoyPressed?: boolean }).decoyPressed)).toBeUndefined();
  expect(JSON.stringify(model.requests.at(-1)?.messages)).toContain("scripted click");
});

test("real keys, going back, and closing only a tab Berry opened", async () => {
  await askBeforeActing("never");
  await openFixture("/");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const userTab = (await activeTab()).id;
  const url = `${origin}/keys`;
  model.callTools({ name: "close_tab", args: { tabId: userTab } });
  model.callTools({ name: "open_tab", args: { url } });
  model.callTools({ name: "list_elements", args: {} });
  model.callTools({ name: "click", args: { ref: "e1" } });
  model.callTools({ name: "press_key", args: { key: "x" } });
  model.callTools({ name: "press_key", args: { key: "Space" } });
  model.callTools({ name: "press_key", args: { key: "Backspace" } });
  model.callTools({ name: "press_key", args: { key: "Escape" } });
  model.callTools({ name: "press_key", args: { key: "Control+Q" } });
  model.callTools({ name: "wait", args: { seconds: 0 } });
  model.callTools({ name: "click", args: { ref: "e3" } });
  model.callTools({ name: "go_back", args: {} });
  // Held, since its tab closes once it's done.
  const finish = model.holdBeforeFirstToken();
  await panel.getByRole("textbox", { name: "Message" }).fill("Go");
  await panel.getByRole("textbox", { name: "Message" }).press("Enter");
  // Each click and key in this job waits Tab.settled's 300ms for a load to start, and the first message loads LangChain,
  // so the job takes about 4.5s alone: too close to the default 5s, and past it under load.
  await expect.poll(() => JSON.stringify(model.requests.at(-1)?.messages), { timeout: 15_000 }).toContain('"name":"go_back"');

  const said = JSON.stringify(model.requests.at(-1)?.messages);
  expect(said).toContain("You didn't open that tab");
  expect(said).toContain("isn't a key this can press");
  expect(said).toContain("Sign-in step");
  expect(said).not.toContain("123456");
  const page = app.windows().find((view) => view.url() === url)!;
  expect(await page.evaluate(() => [sessionStorage.keys, sessionStorage.box])).toEqual(["|x| |Backspace|Escape", "x"]);
  expect((await getTabs()).map((tab) => tab.id)).toContain(userTab);

  const other = `${origin}/one`;
  // Tab ids count up, and the model is told which it opened.
  const nextId = `tab-${Math.max(...(await getTabs()).map((tab) => Number(tab.id.replace("tab-", "")))) + 1}`;
  finish();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  model.reset();
  model.callTools({ name: "open_tab", args: { url: other } });
  model.callTools({ name: "close_tab", args: { tabId: nextId } });
  await panel.getByRole("textbox", { name: "Message" }).fill("Open one");
  await panel.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect.poll(() => JSON.stringify(model.requests.at(-1)?.messages)).toContain("Closed tab");
  expect((await getTabs()).map((tab) => tab.url)).not.toContain(other);
});

const placedView = (url: string) =>
  app.evaluate(({ BaseWindow }, address) => {
    const [window] = BaseWindow.getAllWindows();
    if (!window) throw new Error("No window");
    const view = window.contentView.children.find(
      (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL() === address,
    );
    return {
      bounds: view?.getBounds(),
      visible: view?.getVisible(),
      windowWidth: window.getContentBounds().width,
      // The chrome is the first view that loads the app's own page.
      underChrome:
        window.contentView.children.indexOf(view!) <
        window.contentView.children.findIndex(
          (child) => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL().includes("view=chrome"),
        ),
    };
  }, url);

test("a tab behind the chat has a real size and can be seen, without showing over the page", async () => {
  await askBeforeActing("never");
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  const url = `${origin}/form`;

  model.callTools({ name: "open_tab", args: { url } });
  model.callTools({ name: "screenshot", args: {} });
  const release = model.holdBeforeFirstToken();
  await message.fill("Look at the form");
  await message.press("Enter");
  await expect.poll(() => JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("The page as it looks now");

  const page = await findView(app, url);
  expect(await page.evaluate(() => [window.innerWidth > 0, document.visibilityState])).toEqual([true, "visible"]);
  const parked = await placedView(url);
  expect(parked.visible).toBe(true);
  expect(parked.bounds!.x).toBe(parked.windowWidth - 1);
  expect(parked.underChrome).toBe(true);
  expect(await page.evaluate(() => window.innerWidth)).toBe(parked.bounds!.width);

  // Going to the tab brings it back over the chrome.
  const chatTab = await activeTab();
  const opened = (await getTabs()).find((tab) => tab.url === url)!;
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), opened.id);
  const shown = await placedView(url);
  expect(shown).toMatchObject({ visible: true, underChrome: false });
  expect(shown.bounds!.x).toBeLessThan(shown.windowWidth - 1);
  await chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), chatTab.id);
  expect(await placedView(url)).toMatchObject({ visible: true, underChrome: true });

  release();
  await expect(chrome.getByText("A reply from the model")).toBeVisible();
  // Once the job is done, its tab closes rather than staying parked.
  await expect.poll(async () => (await getTabs()).some((tab) => tab.url === url)).toBe(false);
});

test("Berry finds more on a page, chooses dropdown options, and says what really happened", async () => {
  await askBeforeActing("never");
  const page = await openFixture("/abilities");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });
  const url = `${origin}/abilities`;
  const replies = panel.getByText("A reply from the model");
  let done = 0;
  const resultOf = async (name: string, args: object) => {
    model.callTools({ name, args });
    await askInPanel(`Do ${name}`);
    await expect(replies).toHaveCount(++done);
    return String(model.requests.at(-1)?.messages.at(-1)?.content);
  };
  const value = (selector: string) => page.locator(selector).inputValue();

  const listed = await resultOf("list_elements", {});
  expect(listed).not.toContain("hunter2");
  expect(listed).not.toContain("Ghost");
  const { elements } = JSON.parse(listed.trim()) as {
    elements: Array<{ ref: string; name: string; address?: string; selected?: string[]; options?: string[]; transparent?: boolean }>;
  };
  const named = (name: string) => elements.find((element) => element.name === name)!;
  expect(named("Plain link").address).toBe(`${origin}/one`);
  expect(named("Size").selected).toEqual(["Pick one"]);
  expect(named("Size").options).toContain("Medium");
  expect(named("Finished").transparent).toBe(true);
  expect(named("Deep search")).toBeDefined();
  expect(named("Close")).toBeDefined();

  // A false success on a dropdown, and on a field that won't hold the text.
  expect(await resultOf("type_text", { ref: named("Size").ref, text: "Medium" })).toContain("Use choose_option");
  expect(await value("#size")).toBe("");
  expect(await resultOf("type_text", { ref: named("Amount").ref, text: "not a number", submit: true })).toContain("Nothing was submitted");

  // Reports what's really selected, including when the page undoes it.
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "Small" })).toContain('now shows ["Small"]');
  expect(await value("#size")).toBe("s");
  expect(await resultOf("choose_option", { ref: named("Sticky").ref, option: "Other" })).toContain(
    'didn\'t hold: the dropdown shows ["Keep"]',
  );
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "s" })).toContain('now shows ["Small"]');
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "Huge" })).toContain("no single option matches");
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "Gone" })).toContain("disabled");
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "Older" })).toContain("disabled");
  expect(await resultOf("choose_option", { ref: named("Plain link").ref, option: "Small" })).toContain("isn't a dropdown");
  expect(await value("#size")).toBe("s");

  // A click on a plain element a script made clickable, found by its pointer cursor.
  await resultOf("click", { ref: named("Close").ref });
  await expect.poll(() => page.title()).toBe("Closed");

  // The card names the option by what it shows, and this page rather than the frame that moved. It always asks.
  await askBeforeActing("risky");
  model.callTools({ name: "choose_option", args: { ref: named("Size").ref, option: "Medium" } });
  await askInPanel("Choose medium");
  await expect(card.locator("p").getByText(`Choose “Medium” (sent as “m”) in the dropdown “Size” on ${url}`)).toBeVisible();

  // The page changes what that option sends while the user decides, so nothing happens.
  await page.evaluate(() => {
    document.querySelector<HTMLOptionElement>("option[value=m]")!.value = "delete-everything";
  });
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(replies).toHaveCount(++done);
  expect(String(model.requests.at(-1)?.messages.at(-1)?.content)).toContain("the page changed");
  expect(await value("#size")).toBe("s");

  // A click on an input nobody can see always asks.
  model.callTools({ name: "click", args: { ref: named("Finished").ref } });
  await askInPanel("Tick it");
  await expect(card.locator("p").getByText(`Click the checkbox “Finished” on ${url}`)).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(replies).toHaveCount(++done);

  // An option with no text still says what it sends.
  model.callTools({ name: "choose_option", args: { ref: named("Size").ref, option: "" } });
  await askInPanel("Choose the blank one");
  await expect(card.locator("p").getByText(`Choose “” (sent as “blank”) in the dropdown “Size” on ${url}`)).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(replies).toHaveCount(++done);

  // An element that's gone says so.
  await askBeforeActing("never");
  await page.evaluate(() => document.querySelector("#size")!.remove());
  expect(await resultOf("choose_option", { ref: named("Size").ref, option: "Small" })).toContain("no longer on the page");
});

test("an address that can't load says so instead of reporting success", async () => {
  await askBeforeActing("never");
  await openFixture();
  await openChat();
  const replies = chrome.getByRole("complementary", { name: "Berry" }).getByText("A reply from the model");
  const dead = "https://blueberry-test.invalid/report";

  model.callTools({ name: "open_tab", args: { url: dead } });
  await askInPanel("Open it");
  await expect(replies).toHaveCount(1);
  const opened = String(model.requests.at(-1)?.messages.at(-1)?.content);
  expect(opened).toContain(`couldn't load ${dead}`);
  expect(opened).toContain("ERR_NAME_NOT_RESOLVED");
  expect(opened).not.toContain("Done");

  model.callTools({ name: "go_to", args: { url: `${dead}/other` } });
  await askInPanel("Try another");
  await expect(replies).toHaveCount(2);
  expect(String(model.requests.at(-1)?.messages.at(-1)?.content)).toContain("ERR_NAME_NOT_RESOLVED");

  model.callTools({ name: "go_to", args: { url: `${origin}/` } });
  await askInPanel("Go somewhere real");
  await expect(replies).toHaveCount(3);
  expect(String(model.requests.at(-1)?.messages.at(-1)?.content)).toContain("Done.");
});
