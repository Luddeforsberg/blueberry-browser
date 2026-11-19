import { expect, test } from "@playwright/test";
import { setUpBrowserApp, model, chrome, openFixture, openChat, askInPanel } from "./browserSetup";

setUpBrowserApp();

test("page text reaches the chat", async () => {
  await openFixture();

  const text = await chrome.evaluate(() => window.chromeAPI.chat.getPageText());

  expect(text).toContain("hello from the page");
});

test("chat markdown gets typography styles", async () => {
  model.replyWith("# Heading\n\n", "- item");
  await openFixture();
  await openChat();
  await askInPanel("Show me a list");

  const list = chrome.locator(".prose ul");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("list-style-type", "disc");
});

test("a reply streams as it arrives, and Stop keeps what was written", async () => {
  model.replyWith("first words ", "never sent");
  const release = model.holdAfterFirstToken();
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("hello");

  await expect(panel.getByText("first words")).toBeVisible();
  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(panel.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(panel.getByText("first words")).toBeVisible();
  release();
  await expect(panel.getByText("never sent")).toHaveCount(0);

  // The stopped reply is part of the conversation the model sees next.
  model.replyWith("second reply");
  await askInPanel("and again");
  await expect(panel.getByText("second reply")).toBeVisible();
  const roles = model.requests.at(-1)?.messages.map((message) => message.role);
  expect(roles).toEqual(["system", "user", "assistant", "user"]);
});

test("the panel shares the page with the model, and the main chat doesn't", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  await askInPanel("What's here?");
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  const shared = JSON.stringify(model.requests.at(-1)?.messages);
  expect(shared).toContain("hello from the page");
  expect(shared).toContain("data:image/png");

  await panel.getByRole("group", { name: "Berry can see 127.0.0.1" }).hover();
  await panel.getByRole("button", { name: "Remove this page" }).click();
  await askInPanel("And now?");
  await expect(panel.getByText("A reply from the model")).toHaveCount(2);
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain("hello from the page");

  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  await message.fill("Something else");
  await message.press("Enter");
  await expect.poll(() => model.requests.length).toBe(3);
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain("hello from the page");
});

test("what Berry says before a tool call shows above the reply while it works, and isn't part of the answer", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });

  model.sayThenCallTools("I'll search the page first.", { name: "find_in_page", args: { query: "HELLO" } });
  model.replyWith("It says hello.");
  const answer = model.holdBeforeFirstToken();
  await askInPanel("Does it say hello?");
  const statusLine = panel.getByRole("status").filter({ hasText: "I'll search the page first." });
  await expect(statusLine).toBeVisible();
  await expect.poll(() => model.requests.length).toBe(2);
  expect(JSON.stringify(model.requests[0].messages[0])).toContain("The user is here to answer.");

  answer();
  await expect(panel.getByText("It says hello.")).toBeVisible();
  await expect(statusLine).toHaveCount(0);
  await expect(panel.getByText("I'll search the page first.")).toHaveCount(0);
  // The next request carries the earlier reply as the model will see it, with only its answer.
  await askInPanel("Thanks");
  await expect.poll(() => model.requests.length).toBe(3);
  expect(JSON.stringify(model.requests[2].messages)).not.toContain("I'll search the page first.");
});

test("the thinking state says so beside the mascot, whose face is the pips", async () => {
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("gallery"));
  const thinking = chrome.getByRole("status").filter({ hasText: "Thinking.." }).first();
  await expect(thinking).toBeVisible();
  // The face and the words are the whole indicator, with no pips of the line's own.
  await expect(thinking.locator("[data-pips]")).toHaveCount(0);
  await expect(thinking.locator("xpath=../..").getByRole("img", { name: "Berry, thinking" })).toBeVisible();
});

test("a reply takes over from Thinking in place, and isn't redrawn when it ends", async () => {
  const fadesDone = () =>
    chrome.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => (animation as CSSAnimation).animationName === "fade-in")
          .map((animation) => animation.finished),
      ).then(() => undefined),
    );
  model.replyWith("first words ", "and the rest");
  const releaseStart = model.holdBeforeFirstToken();
  const releaseRest = model.holdAfterFirstToken();
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("new-tab"));
  const message = chrome.getByRole("textbox", { name: /Search, enter a URL, or ask/ });
  await message.fill("hello");
  await message.press("Enter");

  const status = chrome.getByRole("status").filter({ hasText: "Thinking.." });
  await expect(status).toBeVisible();
  await fadesDone();
  const thinking = await status.boundingBox();

  releaseStart();
  const words = chrome.getByText("first words");
  await expect(words).toBeVisible();
  await expect(chrome.getByRole("status")).toHaveCount(0);
  await fadesDone();
  // The words start where Thinking was.
  expect(Math.abs((await words.boundingBox())!.y - thinking!.y)).toBeLessThan(2);
  const reply = await words.elementHandle();

  releaseRest();
  await expect(chrome.getByRole("button", { name: "Send" }).last()).toBeVisible();
  await expect(words).toHaveText("first words and the rest");
  expect(await reply?.evaluate((element) => element.isConnected)).toBe(true);
});

test("the main chat and the chat panel share one composer", async () => {
  await chrome.evaluate(async () => {
    const chat = await window.chromeAPI.chat.send(null, "Hello", { seePage: false });
    await window.chromeAPI.browser.openPage("chat", { param: chat!.id, title: chat!.title });
  });
  const main = chrome.getByRole("textbox", { name: "Message" });
  await expect(main).toBeVisible();
  const mainClass = await main.getAttribute("class");

  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" }).getByRole("textbox", { name: "Message" });
  await expect(panel).toBeVisible();
  expect(await panel.getAttribute("class")).toBe(mainClass);
});

test("a card on the composer shows the page Berry can see, and removing it takes the page away", async () => {
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("group", { name: "Berry can see 127.0.0.1" });

  await expect(card).toBeVisible();
  await card.hover();
  await panel.getByRole("button", { name: "Remove this page" }).click();

  await expect(card).toHaveCount(0);
  expect(await chrome.evaluate(() => window.chromeAPI.chat.getPageAccess())).toBe(false);

  // + offers the page in front first.
  await panel.getByRole("button", { name: "Add a tab or a file" }).click();
  await panel.getByRole("menuitem", { name: /^This page/ }).click();
  await expect(card).toBeVisible();
  expect(await chrome.evaluate(() => window.chromeAPI.chat.getPageAccess())).toBe(true);
});
