import { expect, test } from "@playwright/test";
import {
  setUpBrowserApp,
  origin,
  model,
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

test("Berry does nothing if a link changes while the user decides", async () => {
  await askBeforeActing("always");
  const page = await openFixture("/form");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_elements", args: { query: "Continue" } });
  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Continue");
  await expect(card.locator("p").getByText(`Click the link “Continue” on ${origin}/form, which goes to ${origin}/one`)).toBeVisible();

  await page.evaluate(() => document.querySelector("a")!.setAttribute("href", "/delete"));
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();

  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("the page changed");
  expect(page.url()).toBe(`${origin}/form`);

  model.callTools({ name: "list_elements", args: { query: "Draft" } });
  model.callTools({ name: "click", args: { ref: "e2" } });
  await askInPanel("Save a draft");
  await expect(card.locator("p").getByText(`Click the button “Draft” on ${origin}/form, which goes to ${origin}/draft`)).toBeVisible();
});

test("Berry only acts on a page once allowed, and shows what will happen", async () => {
  await askBeforeActing("always");
  const page = await openFixture("/form");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "list_elements", args: {} });
  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Save it");
  await expect(card.locator("p").getByText(`Click the button “Save” on ${origin}/form`)).toBeVisible();
  expect(await page.title()).toBe("Form");
  const listed = String(model.requests.at(-1)?.messages.at(-1)?.content);
  expect(listed).toContain('"name":"Save"');
  expect(listed).not.toContain("hunter2");

  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await page.title()).toBe("Form");
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("The user said no");

  model.callTools({ name: "click", args: { ref: "e1" } });
  await askInPanel("Please save it");
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => page.title()).toBe("Saved");
  await expect(panel.getByText("Clicked “Save” on 127.0.0.1")).toBeVisible();

  model.callTools({ name: "type_text", args: { ref: "e2", text: "hi there", submit: true } });
  await askInPanel("Write a note");
  await expect(
    card.locator("p").getByText(`Type “hi there” into the field “Note” and submit it on ${origin}/form, which goes to ${origin}/form`),
  ).toBeVisible();
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => page.title()).toBe("Sent hi there");
  await expect(card).toHaveCount(0);
});

test("by default Berry acts without asking unless it's risky, and Settings can turn asking off", async () => {
  const page = await openFixture("/risks");
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });
  const clicked = () => page.evaluate(() => (window as unknown as { clicked?: string }).clicked);
  const act = async (name: string, args: object) => {
    model.callTools({ name, args });
    await askInPanel(`Do ${JSON.stringify(args)}`);
  };

  model.callTools({ name: "list_elements", args: {} });
  await askInPanel("What's here?");
  await expect(panel.getByRole("button", { name: "Stop" })).toHaveCount(0);
  const replies = () => panel.getByText("A reply from the model");
  await expect(replies()).toHaveCount(1);
  const listed = JSON.parse(String(model.requests.at(-1)?.messages.at(-1)?.content).trim()) as {
    elements: Array<{ ref: string; name: string; role: string }>;
  };
  const ref = (name: string) => listed.elements.find((element) => element.name === name)!.ref;
  const unnamed = listed.elements.find((element) => element.name === "")!.ref;

  let done = 1;
  for (const [name, expected] of [
    ["Next page", "Next page"],
    ["Load more", "Load more"],
    ["Find", "Find"],
  ]) {
    await act("click", { ref: ref(defined(name)) });
    await expect(replies()).toHaveCount(++done);
    expect(await clicked()).toBe(expected);
    await expect(card).toHaveCount(0);
  }
  await act("type_text", { ref: ref("Search"), text: "berries" });
  await expect(replies()).toHaveCount(++done);
  await expect(card).toHaveCount(0);

  for (const [element, expected] of [
    [ref("Delete account"), "Delete account"],
    [ref("Ta bort inlägg"), "Ta bort inlägg"],
    [unnamed, "”"],
    [ref("Go"), "Go"],
  ]) {
    await act("click", { ref: element });
    await expect(card.locator("p").getByText(defined(expected), { exact: false })).toBeVisible();
    await card.getByRole("button", { name: "Don’t allow" }).click();
    await expect(replies()).toHaveCount(++done);
  }
  await act("type_text", { ref: ref("Title"), text: "hello" });
  await expect(card.locator("p").getByText("Type “hello”", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(replies()).toHaveCount(++done);
  await act("type_text", { ref: ref("Search"), text: "x".repeat(101) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(replies()).toHaveCount(++done);
  // Not in the message, since an address the user typed doesn't ask.
  model.callTools({ name: "open_tab", args: { url: "https://unknown.example/?secret=abc" } });
  await askInPanel("Open it");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(replies()).toHaveCount(++done);

  await askBeforeActing("never");
  await act("click", { ref: ref("Delete account") });
  await expect(replies()).toHaveCount(++done);
  await expect(card).toHaveCount(0);
  expect(await clicked()).toBe("Delete");
});

test("with the mascot off, a tab Berry is using glows and shimmers until the reply ends", async () => {
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ mascotOnPages: false }));
  const page = await openFixture();
  await openChat();
  const row = chrome.getByRole("region", { name: "Tabs" }).getByRole("listitem").filter({ hasText: "Fixture" });
  const glow = () => page.evaluate(() => getComputedStyle(document.documentElement, "::after").boxShadow);
  expect(await glow()).toBe("none");

  model.callTools({ name: "read_page", args: {} });
  const release = model.holdBeforeFirstToken();
  await askInPanel("Read this");
  await expect.poll(glow).not.toBe("none");
  await expect(row.getByText("Berry is working here")).toBeAttached();
  expect((await getTabs()).find((tab) => tab.url.startsWith(origin))?.berryWorking).toBe(true);
  await chrome.waitForTimeout(600);
  await chrome.screenshot({ path: test.info().outputPath("working-chrome.png") });

  release();
  await expect.poll(glow).toBe("none");
  await expect(row.getByText("Berry is working here")).toHaveCount(0);
});

test("Berry opens an address only once allowed, and never a non-web one", async () => {
  await askBeforeActing("always");
  await openFixture();
  await openChat();
  const panel = chrome.getByRole("complementary", { name: "Berry" });
  const card = panel.getByRole("region", { name: "Approval needed" });

  model.callTools({ name: "open_tab", args: { url: "file:///etc/hosts" } });
  await askInPanel("Open the file");
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(panel.getByText("A reply from the model")).toBeVisible();
  expect(JSON.stringify(model.requests.at(-1)?.messages.at(-1))).toContain("Only http and https");

  const before = (await getTabs()).length;
  model.callTools({ name: "open_tab", args: { url: `${origin}/form` } });
  // Held, since its tab closes once it's done.
  const finish = model.holdBeforeFirstToken();
  await askInPanel("Open the form");
  await expect(card.locator("p").getByText(`Open ${origin}/form in a new tab`)).toBeVisible();
  expect(await getTabs()).toHaveLength(before);
  await card.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(async () => (await getTabs()).length).toBe(before + 1);
  // It opens behind the user, who stays where they were.
  await expect.poll(async () => (await getTabs()).at(-1)?.title).toBe("Form");
  expect((await activeTab()).title).toBe("Fixture");
  finish();
  await expect(panel.getByText("A reply from the model")).toHaveCount(2);
});
