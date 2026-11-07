import { expect, test, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel, type FakeModel } from "./fakeModel";

const FIRST_ANSWER = "Lindqvist Data and Fjällbo both sell to sales teams.";

let model: FakeModel;
let app: ElectronApplication;

test.beforeAll(async () => {
  model = await startFakeModel();
});

test.afterAll(() => model.close());

test.afterEach(async () => {
  await app?.close();
});

const newestUserMessage = (request: FakeModel["requests"][number]) =>
  String(request.messages.findLast(({ role }) => role === "user")?.content ?? "");

// What the planner answers for one job: one card, which starts at once with the user's own words.
const oneJob = () =>
  model.planWith({
    reply: "On it.",
    ask: false,
    cards: [{ key: "c1", bird: "berry", prompt: "One job", from: [], for_each_row: false, waits_for_user: false, table_of: null }],
  });

test("a card pulled out of another gets its thread, and the Nest keeps both", async () => {
  model.reset();
  const profile = mkdtempSync(join(tmpdir(), "blueberry-nest-"));
  app = await launchApp(profile, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");

  await chrome.getByRole("button", { name: "New nest" }).click();
  const name = chrome.getByRole("textbox", { name: "Nest name" });
  await expect(name).toHaveValue("New Nest");

  // The composer at the bottom starts a card of its own, when Berry finds it's one job, and the cheap model names the
  // Nest from that first request.
  model.replyWith(FIRST_ANSWER);
  model.titleWith("Swedish SaaS leads");
  oneJob();
  const composer = chrome.getByRole("textbox", { name: "Ask in this Nest" });
  await composer.fill("Find two Swedish SaaS companies");
  await composer.press("Enter");
  const first = chrome.locator(".react-flow__node").first();
  await expect(first.getByRole("status")).toHaveText("Done");
  await expect(first).toContainText(FIRST_ANSWER);
  await expect(first).toContainText("Find two Swedish SaaS companies");
  await expect(name).toHaveValue("Swedish SaaS leads");
  expect(model.titleRequests.some((request) => JSON.stringify(request.messages).includes("Find two Swedish SaaS companies"))).toBe(true);

  // Its handle's click puts a draft beside it, on a line, saying what it will get.
  await first.hover();
  await first.getByLabel("Pull a new card out of Berry’s").click();
  const draft = chrome.locator(".react-flow__node").nth(1);
  await expect(draft).toContainText("gets Berry’s thread");
  await expect(chrome.locator(".react-flow__edge")).toHaveCount(1);
  const [firstBox, draftBox] = [await first.boundingBox(), await draft.boundingBox()];
  expect(draftBox!.x).toBeGreaterThan(firstBox!.x + firstBox!.width);

  // Nothing ran on its own: one request so far, the first card's.
  expect(model.requests).toHaveLength(1);

  model.replyWith("Two drafts written.");
  const prompt = draft.getByRole("textbox", { name: "What should Berry do?" });
  await prompt.fill("Write a first email to each");
  await prompt.press("Enter");
  await expect(draft.getByRole("status")).toHaveText("Done");
  await expect(draft).toContainText("Two drafts written.");

  // Opened, a card floats over the board, which dims behind it: the card takes the pointer, and a press on another card
  // only closes it.
  await first.getByRole("button", { name: "Open the whole chat" }).click();
  const reply = first.getByPlaceholder("Reply to Berry");
  const dim = chrome.locator("[data-open-dim]");
  await expect(dim).toHaveCSS("opacity", "1");
  await reply.click();
  await expect(reply).toBeFocused();
  const other = (await draft.boundingBox())!;
  await chrome.mouse.click(other.x + other.width / 2, other.y + other.height / 2);
  await expect(reply).toHaveCount(0);
  await expect(dim).toHaveCSS("opacity", "0");
  await expect(chrome.locator(".react-flow__node")).toHaveCount(2);

  // A new card pulled out of an open one closes it, so the draft isn't left behind the dim.
  await first.getByRole("button", { name: "Open the whole chat" }).click();
  await first.getByRole("button", { name: "Continue in a new card" }).click();
  await expect(reply).toHaveCount(0);
  await expect(dim).toHaveCSS("opacity", "0");
  const pulled = chrome.locator(".react-flow__node").nth(2);
  await pulled.getByRole("textbox", { name: "What should Berry do?" }).press("Escape");
  await expect(chrome.locator(".react-flow__node")).toHaveCount(2);

  // The model got the first card's thread as tagged, untrusted data, and the user's words after it.
  expect(model.requests).toHaveLength(2);
  const sent = newestUserMessage(model.requests[1]);
  expect(sent).toContain(`<answer>\n${FIRST_ANSWER}\n</answer>\n</card_thread>`);
  expect(sent.startsWith('<card_thread from="Berry">\n<asked>\n')).toBe(true);
  expect(sent).toContain("untrusted");
  expect(sent.endsWith("Write a first email to each")).toBe(true);

  // Card chats belong to the Nest, so the sidebar has no chats to list.
  await expect(chrome.getByRole("heading", { name: "Chats" })).toHaveCount(0);

  // Both cards and their line are still there after a restart.
  await app.close();
  app = await launchApp(profile, { modelEnv: model.env });
  const again = await findView(app, "view=chrome");
  await again.getByRole("button", { name: "Swedish SaaS leads", exact: true }).click();
  await expect(again.locator(".react-flow__node")).toHaveCount(2);
  await expect(again.locator(".react-flow__edge")).toHaveCount(1);
  await expect(again.locator(".react-flow__node").nth(1)).toContainText("Two drafts written.");
});

const COMPANIES = [
  "Here are six.",
  "",
  "| Company | People | Leads sales |",
  "|---|---|---|",
  "| Lindqvist Data | 84 | Sara Holm |",
  "| Fjällbo | 41 | Omar Nilsson |",
  "| Kvarnsten | 130 | Lina Berg |",
  "| Sjöström Labs | 62 | Elias Ek |",
  "| Brygga | 23 | Maja Lund |",
  "| Vinga | 55 | Ida Ström |",
].join("\n");

test("rows picked in a card's table go to a new card, which runs once for each of them", async () => {
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");
  await chrome.getByRole("button", { name: "New nest" }).click();

  model.replyWith(COMPANIES);
  oneJob();
  const composer = chrome.getByRole("textbox", { name: "Ask in this Nest" });
  await composer.fill("Find six Swedish SaaS companies");
  await composer.press("Enter");
  const first = chrome.locator(".react-flow__node").first();
  await expect(first.getByRole("status")).toHaveText("Done");

  // The answer's table is the card's result: five rows, then the rest a press away.
  const rows = first.locator("tbody tr");
  await expect(rows).toHaveCount(5);
  await expect(first.getByRole("button", { name: "1 more" })).toBeVisible();

  // A click picks one, Shift picks a range, Cmd takes one away and adds it back, and Esc lets them all go.
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ["Shift"] });
  await expect(first.getByText("3 selected")).toBeVisible();
  await rows.nth(1).click({ modifiers: ["ControlOrMeta"] });
  await expect(first.getByText("2 selected")).toBeVisible();
  await chrome.keyboard.press("Escape");
  await expect(first.getByText("selected")).toHaveCount(0);
  await rows.nth(1).click();
  await rows.nth(3).click({ modifiers: ["ControlOrMeta"] });
  await rows.nth(4).click({ modifiers: ["ControlOrMeta"] });
  await expect(first.getByText("3 selected")).toBeVisible();
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(rows.nth(0)).toHaveAttribute("aria-selected", "false");

  // The line's round end touches the card's edge, rather than floating beside it.
  await first.hover();
  const handle = first.getByLabel("Pull a new card out of the 3 selected rows");
  await handle.click();
  const draft = chrome.locator(".react-flow__node").nth(1);
  await expect(draft).toContainText("gets 3 rows from Berry");
  // Read in one frame, since the board may still be moving to show the new card.
  const gap = await chrome.evaluate(
    () => document.querySelector(".react-flow__edge circle")!.getBoundingClientRect().left - document.querySelector(".react-flow__node")!.getBoundingClientRect().right
  );
  expect(Math.abs(gap)).toBeLessThanOrEqual(1);

  // For each row is on, since rows were picked, and says how many runs it will make.
  await expect(draft.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(draft).toContainText("3 runs");
  expect(model.requests).toHaveLength(1);

  model.replyWith("Hej, a short note.");
  const prompt = draft.getByRole("textbox", { name: "What should Berry do?" });
  await prompt.fill("Find a recent post by the sales lead");
  await prompt.press("Enter");
  await expect(draft.getByRole("status").first()).toHaveText("Done");
  // Sent, its line is solid.
  await expect(chrome.locator(".react-flow__edge path").first()).not.toHaveAttribute("style", /dasharray/);
  // Its result is one table: the picked rows, and a column of its own with each row's short value.
  await expect(draft.getByRole("button", { name: /^Open (Fjällbo|Sjöström Labs|Brygga)’s run$/ })).toHaveCount(3);
  await expect(draft.locator("tbody tr").first()).toContainText("Hej, a short note.");
  // The bird carried the rows along the line and is home again, even in a window that draws no frames off-screen.
  await expect(chrome.locator(".react-flow__viewport-portal > :not([data-open-dim])")).toHaveCount(0);
  // Pressing a run opens its own thread.
  await draft.getByRole("button", { name: "Open Fjällbo’s run" }).click();
  await expect(draft.getByPlaceholder("Reply to Berry")).toBeVisible();
  await draft.getByRole("button", { name: "Every run" }).click();
  await chrome.keyboard.press("Escape");
  await expect(draft.getByPlaceholder("Reply to Berry")).toHaveCount(0);

  // A click on empty board makes a new draft, and never takes a sent For-each card for an empty one, even with Delete
  // answered for it.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  const board = await chrome.locator(".react-flow__pane").boundingBox();
  await chrome.mouse.click(board!.x + board!.width - 60, board!.y + board!.height - 160);
  await expect(chrome.locator(".react-flow__node")).toHaveCount(3);
  await expect(draft).toContainText("For each of 3 rows from Berry");

  // One run for each picked row, each with that row and no other.
  expect(model.requests).toHaveLength(4);
  const sent = model.requests.slice(1).map(newestUserMessage);
  for (const [index, company] of ["Fjällbo", "Sjöström Labs", "Brygga"].entries()) {
    const run = sent.find((message) => message.includes(`| ${company} |`));
    expect(run, `a run for ${company}`).toBeDefined();
    expect(run!.match(/\| \d+ \|/g)).toHaveLength(1);
    expect(run).toContain("work on this row only");
    expect(run!.endsWith("Find a recent post by the sales lead")).toBe(true);
    expect(sent.filter((message) => message.includes(`| ${company} |`)), `${index}`).toHaveLength(1);
  }
  for (const left of ["Lindqvist Data", "Kvarnsten", "Vinga"]) expect(sent.join("\n")).not.toContain(left);
});

const SHOTS = process.env.NEST_SHOTS;
const THREE_COMPANIES = ["Three to start with.", "", "| Company | Leads sales |", "|---|---|", "| Lindqvist Data | Sara Holm |", "| Fjällbo | Omar Nilsson |", "| Brygga | Maja Lund |"].join("\n");

test("Berry lays two jobs out as a plan, which runs only on Run, and the second waits for Looks right, continue", async () => {
  test.setTimeout(60_000);
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900));
  const chrome = await findView(app, "view=chrome");
  const shot = async (name: string) => {
    if (SHOTS) await chrome.screenshot({ path: join(SHOTS, `${name}.png`) });
  };
  const saved = await chrome.evaluate(() =>
    window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Find companies.", sites: ["allabolag.se"], tools: ["visit", "click", "type"] })
  );
  if (!saved.ok) throw new Error(saved.error);
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light" }));
  await chrome.getByRole("button", { name: "New nest" }).click();

  model.planWith({
    reply: "That’s two jobs, so I’ve laid them out above. I’ll stop after the list so you can check it before any email is written.",
    ask: false,
    cards: [
      { key: "c1", bird: saved.id, prompt: "Find three Swedish B2B SaaS companies and who leads sales at each, as a table", from: [], for_each_row: false, waits_for_user: false, table_of: "companies" },
      { key: "c2", bird: "berry", prompt: "Draft a first email to each", from: ["c1"], for_each_row: false, waits_for_user: true, table_of: null },
    ],
  });
  const composer = chrome.getByRole("textbox", { name: "Ask in this Nest" });
  const planned = model.holdPlan();
  await composer.fill("Find Swedish SaaS companies we could sell to and draft a first email to each");
  await composer.press("Enter");

  // While Berry plans, quiet shapes stand where the cards will land and Thinking shimmers, until the plan comes.
  const ghosts = chrome.locator("[data-plan-ghost]");
  await expect(ghosts).toHaveCount(2);
  await expect(chrome.getByLabel("Talking with Berry").getByRole("status")).toHaveText("Thinking");
  await shot("0-planning");
  planned();

  // The plan is on the board, dashed and not started, with the request and Berry's answer over the composer.
  const cards = chrome.locator(".react-flow__node");
  await expect(cards).toHaveCount(2);
  await expect(ghosts).toHaveCount(0);
  const [scout, writer] = [cards.nth(0), cards.nth(1)];
  await expect(scout.getByRole("status")).toHaveText("Planned");
  await expect(scout).toContainText("Only goes to allabolag.se");
  await expect(scout).toContainText("A table of companies lands here");
  await expect(writer).toContainText("Starts when you say Scout’s answer is right");
  const talk = chrome.getByLabel("Talking with Berry");
  await expect(talk).toContainText("Find Swedish SaaS companies we could sell to");
  await expect(talk).toContainText("That’s two jobs");
  await expect(chrome.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  await expect(chrome.getByRole("textbox", { name: "Ask in this Nest" })).toHaveAttribute("placeholder", "Change the plan, or press Run");
  expect(model.planRequests).toHaveLength(1);
  expect(model.requests).toHaveLength(0);
  await shot("1-plan");

  // Before Run, a card's prompt edits in place, For each row turns on, and a line pulled out adds a card, which goes again.
  const prompt = writer.getByRole("textbox", { name: "What Berry will do" });
  await prompt.fill("Draft a short first email to the person who leads sales");
  await writer.getByRole("switch").click();
  await expect(writer.getByRole("status")).toHaveText("Planned · for each row");
  await writer.hover();
  await writer.getByLabel("Pull a new card out of Berry’s").click();
  await expect(cards).toHaveCount(3);
  await cards.nth(2).hover();
  await cards.nth(2).getByRole("button", { name: "Delete card" }).click();
  await expect(cards).toHaveCount(2);
  // The new card moved the board to show it, so it goes back to where both cards are in sight.
  const pane = (await chrome.locator(".react-flow__pane").boundingBox())!;
  await chrome.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  for (let tries = 0; tries < 10 && (await scout.boundingBox())!.x < pane.x + 60; tries++) await chrome.mouse.wheel(-120, 0);
  await expect.poll(async () => (await scout.boundingBox())!.x).toBeGreaterThanOrEqual(pane.x + 60);
  await prompt.click();
  await shot("2-editing");
  expect(model.requests).toHaveLength(0);

  // Run sends every planned card. The first starts at once, and the second waits for the user to check its answer.
  model.replyWith(THREE_COMPANIES);
  await chrome.getByRole("button", { name: "Run", exact: true }).click();
  await expect(scout.getByRole("status")).toHaveText("Done");
  await expect(writer.getByRole("status")).toHaveText("Waits for you");
  const looksRight = scout.getByRole("button", { name: "Looks right, continue" });
  await expect(looksRight).toBeVisible();
  await expect(chrome.getByRole("button", { name: "Run", exact: true })).toHaveCount(0);
  // The request has folded to one line, which opens.
  await expect(talk.getByRole("button", { expanded: false })).toContainText("Find Swedish SaaS companies");
  expect(model.requests).toHaveLength(1);
  expect(newestUserMessage(model.requests[0])).toBe("Find three Swedish B2B SaaS companies and who leads sales at each, as a table");
  await shot("3-waits-light");
  await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "dark" }));
  await shot("4-waits-dark");

  // Looks right, continue runs the edited card once for each row of the fresh table, each with only its row.
  model.replyWith("A short note.");
  await looksRight.click();
  await expect(writer.getByRole("status").first()).toHaveText("Done");
  expect(model.requests).toHaveLength(4);
  const runs = model.requests.slice(1).map(newestUserMessage);
  for (const company of ["Lindqvist Data", "Fjällbo", "Brygga"]) {
    const run = runs.find((message) => message.includes(`| ${company} |`));
    expect(run, `a run for ${company}`).toBeDefined();
    expect(run!.endsWith("Draft a short first email to the person who leads sales")).toBe(true);
  }
});

const FIXTURES = join(__dirname, "fixtures");

const LEADS = ["Company,Leads sales", "Lindqvist Data,Sara Holm", '"Fjällbo, AB",Omar Nilsson', "Brygga,Maja Lund", ""].join("\r\n");
// What each run answers, too long to be a cell, with the pages it found.
const POSTS = "I looked at their LinkedIn.\n\nThe newest posts are about hiring: https://linkedin.com/posts/lindqvist-1, https://linkedin.com/posts/fjallbo-1 and https://linkedin.com/posts/brygga-1\n\nNothing newer.";
const SLUGS: Record<string, string> = { "Lindqvist Data": "lindqvist", "Fjällbo, AB": "fjallbo", Brygga: "brygga" };

test("a CSV file becomes a table card, For each row adds a column to it, a second adds another, and every table copies and downloads", async () => {
  test.setTimeout(90_000);
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900));
  const chrome = await findView(app, "view=chrome");
  const shots = async (name: string) => {
    if (!SHOTS) return;
    for (const appearance of ["light", "dark"] as const) {
      await chrome.evaluate((theme) => window.chromeAPI.settings.updateSettings({ appearance: theme }), appearance);
      await chrome.waitForTimeout(150);
      await chrome.screenshot({ path: join(SHOTS, `${name}-${appearance}.png`) });
    }
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light" }));
  };
  const folder = mkdtempSync(join(tmpdir(), "blueberry-table-"));
  writeFileSync(join(folder, "Swedish leads.csv"), `\uFEFF${LEADS}`);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, join(folder, "Swedish leads.csv"));
  await chrome.getByRole("button", { name: "New nest" }).click();

  // The composer's + adds a table from a file: a card with no bird, titled from the file, with its rows.
  await chrome.getByRole("button", { name: "Add a file or note" }).click();
  await chrome.getByRole("menuitem", { name: "Add a table from a file" }).click();
  const cards = chrome.locator(".react-flow__node");
  const leads = cards.first();
  await expect(leads).toContainText("Swedish leads");
  await expect(leads).toContainText("3 rows, 2 columns");
  await expect(leads.locator("tbody tr")).toHaveCount(3);
  await expect(leads.locator("tbody tr").nth(1)).toContainText("Fjällbo, AB");
  await shots("csv-card");

  // A line out of it brings its rows, and with For each row on, says what each run gets.
  await leads.hover();
  await leads.getByLabel("Pull a new card out of Swedish leads").click();
  const scout = cards.nth(1);
  await expect(scout).toContainText("gets every row of Swedish leads");
  await expect(scout.locator("[data-crosses]")).toHaveText("3 rows, 2 columns from Swedish leads");
  await scout.getByRole("switch").click();
  await expect(scout.locator("[data-crosses]")).toHaveText("One row each, 2 columns");
  await expect(scout).toContainText("3 runs");
  await shots("crosses");

  // Each run's value is the cheap model's, from the job and that run's answer, and the column is named from the job.
  model.columnWith("Latest post");
  model.cellsFrom((data) => {
    const company = Object.keys(SLUGS).find((name) => data.includes(`<row>\n| Company | Leads sales |\n| --- | --- |\n| ${name} |`))!;
    return `[Hiring post](https://linkedin.com/posts/${SLUGS[company]}-1)`;
  });
  model.replyWith(POSTS);
  const held = model.holdAfterFirstToken();
  await scout.getByRole("textbox", { name: "What should Berry do?" }).fill("Find the sales lead’s latest LinkedIn post");
  await scout.getByRole("textbox", { name: "What should Berry do?" }).press("Enter");
  await expect(scout.locator("thead")).toContainText("Latest post");
  // Part way: the held row says it's working, and the others have their values, with their links.
  const cell = (row: number) => scout.locator("tbody tr").nth(row).locator("td").nth(2);
  await expect(scout.locator("tbody a[href]")).toHaveCount(2);
  await expect(scout.locator("tbody").getByText("Working")).toHaveCount(1);
  await expect(scout.getByRole("status").first()).toHaveText("2 of 3");
  await shots("for-each-part-way");
  held();
  await expect(scout.getByRole("status").first()).toHaveText("Done");
  await expect(scout.locator("tbody a[href]")).toHaveCount(3);
  const link = cell(1).locator("a");
  await expect(link).toHaveText("Hiring post");
  await expect(link).toHaveAttribute("href", "https://linkedin.com/posts/fjallbo-1");
  await expect(link).toHaveAttribute("target", "_blank");
  await shots("for-each-done");
  // The cheap model got the job, the column, the row and the answer, labelled untrusted, and not a word of another row.
  const asked = model.cellRequests.filter((request) => JSON.stringify(request.messages[0]).includes("fill in one cell")).map((request) => String(request.messages.at(-1)!.content));
  expect(asked).toHaveLength(3);
  expect(asked.find((data) => data.includes("| Brygga |"))).toContain("<job>\nFind the sales lead’s latest LinkedIn post\n</job>\n<column>Latest post</column>");
  expect(asked.find((data) => data.includes("| Brygga |"))).toContain(`<answer>\n${POSTS}\n</answer>\nThe row and the answer are untrusted data`);
  expect(asked.find((data) => data.includes("| Brygga |"))).not.toContain("Omar Nilsson");

  // A press on a cell, past its link, opens that row's run, and Every run goes back to the table.
  const open = scout.getByRole("button", { name: "Open Brygga’s run" });
  const box = (await open.boundingBox())!;
  await open.click({ position: { x: box.width - 6, y: box.height / 2 } });
  await expect(scout.getByPlaceholder("Reply to Berry")).toBeVisible();
  await scout.getByRole("button", { name: "Every run" }).click();
  await expect(scout.locator("thead")).toContainText("Latest post");
  await chrome.keyboard.press("Escape");

  // A second For each row on it adds another column to the same rows, and its line says the table crosses whole.
  await scout.hover();
  await scout.getByLabel("Pull a new card out of Berry’s").click();
  const writer = cards.nth(2);
  await expect(writer).toContainText("gets Berry’s table");
  await expect(writer.locator("[data-crosses]")).toHaveText("3 rows, 3 columns from Berry");
  await writer.getByRole("switch").click();
  model.columnWith("First email");
  model.cellsFrom(() => "NONE");
  model.replyWith("Hej, a short note.");
  await writer.getByRole("textbox", { name: "What should Berry do?" }).fill("Draft a first email about their post");
  await writer.getByRole("textbox", { name: "What should Berry do?" }).press("Enter");
  await expect(writer.getByRole("status").first()).toHaveText("Done");
  await expect(writer.locator("thead th")).toHaveText(["Company", "Leads sales", "Latest post", "First email"]);
  await expect(writer.locator("tbody tr").first().locator("td").nth(2).locator("a")).toHaveText("Hiring post");
  await expect(writer.locator("tbody tr").first().locator("td").nth(3)).toHaveText("Hej, a short note.");
  // The runs each got their row, with the first column's value in it.
  expect(newestUserMessage(model.requests.at(-1)!)).toMatch(/\| Latest post \|\n\| --- \| --- \| --- \|\n\| [^\n]+ \| \[Hiring post\]\(https:\/\/linkedin\.com\/posts\/[a-z]+-1\) \|\n<\/card_answer>/);
  await shots("chained");

  // Every table copies as cells and downloads as CSV, written only where the save dialog says.
  await writer.hover();
  await writer.getByRole("button", { name: "Copy or download the table" }).click();
  await expect(chrome.getByRole("menuitem", { name: "Copy as table" })).toBeVisible();
  await expect(chrome.getByRole("menuitem", { name: "Download CSV" })).toBeVisible();
  await shots("export-menu");
  await chrome.getByRole("menuitem", { name: "Copy as table" }).click();
  await expect(writer.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied.split("\n")[0]).toBe("Company\tLeads sales\tLatest post\tFirst email");
  expect(copied.split("\n")[2]).toBe("Fjällbo, AB\tOmar Nilsson\tHiring post (https://linkedin.com/posts/fjallbo-1)\tHej, a short note.");
  const saveTo = join(folder, "export.csv");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
  }, saveTo);
  await writer.getByRole("button", { name: /Copy or download the table|Copied/ }).click();
  await chrome.getByRole("menuitem", { name: "Download CSV" }).click();
  await expect.poll(() => existsSync(saveTo)).toBe(true);
  expect(readFileSync(saveTo, "utf8")).toBe(
    "\uFEFFCompany,Leads sales,Latest post,First email\r\n" +
      "Lindqvist Data,Sara Holm,Hiring post (https://linkedin.com/posts/lindqvist-1),\"Hej, a short note.\"\r\n" +
      "\"Fjällbo, AB\",Omar Nilsson,Hiring post (https://linkedin.com/posts/fjallbo-1),\"Hej, a short note.\"\r\n" +
      "Brygga,Maja Lund,Hiring post (https://linkedin.com/posts/brygga-1),\"Hej, a short note.\"\r\n"
  );

  // A longer file comes with the board as its first rows only, says how many more there are, and "2 more" brings the
  // rest from main.
  writeFileSync(join(folder, "seven.csv"), ["Company", ...Array.from({ length: 7 }, (_, index) => `Company ${index + 1}`)].join("\n"));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, join(folder, "seven.csv"));
  await chrome.getByRole("button", { name: "Add a file or note" }).last().click();
  await chrome.getByRole("menuitem", { name: "Add a table from a file" }).click();
  const seven = cards.filter({ hasText: "7 rows, 1 column" });
  await expect(seven.locator("tbody tr")).toHaveCount(5);
  await seven.getByRole("button", { name: "2 more" }).click();
  await expect(seven.locator("tbody tr")).toHaveCount(7);
  await expect(seven.locator("tbody tr").last()).toHaveText("Company 7");

  // A short file with a cell too long for the board's first rows has no "N more", and its rows can still be picked: the
  // first press brings the whole table, and the line takes the row as it really is.
  const note = "n".repeat(300);
  writeFileSync(join(folder, "long.csv"), `Company,Note\nFjällbo,${note}\nBrygga,short`);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
  }, join(folder, "long.csv"));
  await chrome.getByRole("button", { name: "Add a file or note" }).last().click();
  await chrome.getByRole("menuitem", { name: "Add a table from a file" }).click();
  const long = cards.filter({ hasText: "2 rows, 2 columns" });
  await expect(long.getByRole("button", { name: /more$/ })).toHaveCount(0);
  // Presses made while the whole table is on its way all count, in order: a click, then Shift-click, picks both rows.
  await app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers;
    const real = handlers.get("nests:table-rows")!;
    handlers.set("nests:table-rows", async (...args: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return real(...args);
    });
  });
  await long.locator("tbody tr").first().click();
  await long.locator("tbody tr").nth(1).click({ modifiers: ["Shift"] });
  await expect(long.getByText("2 selected")).toBeVisible();
  await long.locator("tbody tr").nth(1).click({ modifiers: ["ControlOrMeta"] });
  await expect(long.getByText("1 selected")).toBeVisible();
  await expect(long.locator("tbody tr").first().locator("td").nth(1)).toHaveAttribute("title", note);
  await long.hover();
  await long.getByLabel("Pull a new card out of the 1 selected row").click();
  await expect(cards.filter({ hasText: "gets 1 row from long" })).toHaveCount(1);
});

test("a file and a note on a card go to its bird with the message, and a Word file is refused with why", async () => {
  test.setTimeout(60_000);
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900));
  const chrome = await findView(app, "view=chrome");
  const shots = async (name: string) => {
    if (!SHOTS) return;
    for (const appearance of ["light", "dark"] as const) {
      await chrome.evaluate((theme) => window.chromeAPI.settings.updateSettings({ appearance: theme }), appearance);
      await chrome.waitForTimeout(150);
      await chrome.screenshot({ path: join(SHOTS, `${name}-${appearance}.png`) });
    }
  };
  // The system's file picker answers with these, as if the user picked them.
  const pick = (...names: string[]) =>
    app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as never;
    }, names.map((name) => join(FIXTURES, name)));
  await chrome.getByRole("button", { name: "New nest" }).click();
  // The Nest's own composer is at the bottom of the page, so its menu opens upward, in sight.
  await chrome.getByRole("button", { name: "Add a file or note" }).click();
  await expect(chrome.getByRole("menuitem", { name: "Add a note" })).toBeInViewport();
  await chrome.keyboard.press("Escape");

  // A click on the board makes a draft, and its + adds a file the picker gives, then a note written in place.
  const pane = (await chrome.locator(".react-flow__pane").boundingBox())!;
  await chrome.mouse.click(pane.x + 120, pane.y + 140);
  const card = chrome.locator(".react-flow__node").first();
  await pick("tallgren-one-pager.pdf");
  await card.getByRole("button", { name: "Add a file or note" }).click();
  await chrome.getByRole("menuitem", { name: "Add a file" }).click();
  await expect(card.getByRole("button", { name: "With: tallgren-one-pager.pdf" })).toBeVisible();
  await card.getByRole("button", { name: "Add a file or note" }).click();
  await chrome.getByRole("menuitem", { name: "Add a note" }).click();
  await card.getByRole("textbox", { name: "Note" }).fill("Write to Lina Berg at Kvarnsten. Keep it under 120 words.");
  await card.getByRole("button", { name: "Add note" }).click();
  const line = card.getByRole("button", { name: "With: tallgren-one-pager.pdf, your note" });
  await expect(line).toBeVisible();
  await expect(card.getByRole("textbox", { name: "Note" })).toHaveCount(0);

  // A Word file is refused, saying why, and nothing is added.
  await pick("brief.docx");
  await card.getByRole("button", { name: "Add a file or note" }).click();
  await chrome.getByRole("menuitem", { name: "Add a file" }).click();
  await expect(card.getByRole("alert")).toHaveText("brief.docx is a Word file, which can’t be added yet. Save it as a PDF and add that.");
  await expect(line).toBeVisible();
  await shots("refused-type");

  // The line opens the list: the file's name and size, the note, and a way to remove each before it's sent.
  await line.click();
  const list = card.getByRole("list", { name: "Files and notes" });
  await expect(list).toContainText("tallgren-one-pager.pdf");
  await expect(list).toContainText("1.9 KB");
  await expect(list).toContainText("Write to Lina Berg at Kvarnsten");
  await expect(list.getByRole("button", { name: "Remove tallgren-one-pager.pdf" })).toBeVisible();
  await card.getByRole("textbox", { name: "What should Berry do?" }).fill("Draft a short first email from our one-pager");
  await shots("attachment-list");
  expect(model.requests).toHaveLength(0);

  model.replyWith("Hej Lina, a short note about Tallgren.");
  await card.getByRole("textbox", { name: "What should Berry do?" }).press("Enter");
  await expect(card.getByRole("status")).toHaveText("Done");
  await expect(card.getByRole("button", { name: "With: tallgren-one-pager.pdf, your note" })).toBeVisible();
  await shots("card-with-pdf-and-note");

  // The model got the PDF as a file, after a line saying the user attached it and that it's untrusted, the note as the
  // user's words, and what they typed last.
  expect(model.requests).toHaveLength(1);
  const content = model.requests[0].messages.findLast(({ role }) => role === "user")!.content as Array<Record<string, unknown>>;
  const pdf = readFileSync(join(FIXTURES, "tallgren-one-pager.pdf")).toString("base64");
  const fileAt = content.findIndex((block) => block.type === "file");
  expect(content[fileAt]).toEqual({ type: "file", file: { filename: "tallgren-one-pager.pdf", file_data: `data:application/pdf;base64,${pdf}` } });
  expect(String(content[fileAt - 1].text)).toContain('The user attached the PDF "tallgren-one-pager.pdf" to this card.');
  expect(String(content[fileAt - 1].text)).toContain("untrusted");
  const words = content.filter((block) => block.type === "text").map((block) => String(block.text));
  expect(words.join("\n")).toContain("<user_note>\nWrite to Lina Berg at Kvarnsten. Keep it under 120 words.\n</user_note>");
  expect(words.at(-1)).toBe("Draft a short first email from our one-pager");

  // Sent, they still show, and can't be removed or changed.
  await card.getByRole("button", { name: "With: tallgren-one-pager.pdf, your note" }).click();
  await expect(card.getByRole("list", { name: "Files and notes" })).toContainText("tallgren-one-pager.pdf");
  await expect(card.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Your note", exact: true })).toBeDisabled();
});

test("a chat becomes a Nest's first card, and Needs you opens the Nest at the card that's asking", async () => {
  test.setTimeout(60_000);
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900));
  const chrome = await findView(app, "view=chrome");

  // An ordinary chat, finished.
  model.replyWith("Three flights under €200, the cheapest at 05:40.");
  model.titleWith("Flights to Berlin");
  const sent = await chrome.evaluate(() => window.chromeAPI.chat.send(null, "Find flights to Berlin in May", { seePage: false }));
  await expect.poll(async () => (await chrome.evaluate((id) => window.chromeAPI.library.getChat(id), sent!.id))?.title).toBe("Flights to Berlin");
  await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);

  // Open as a Nest turns it into the first card of a new Nest, in the same tab, named as the chat was.
  await chrome.getByRole("button", { name: "Open as a Nest" }).click();
  await expect(chrome.getByRole("textbox", { name: "Nest name" })).toHaveValue("Flights to Berlin");
  const cards = chrome.locator(".react-flow__node");
  const card = cards.first();
  await expect(cards).toHaveCount(1);
  await expect(card).toContainText("Three flights under €200");
  await expect(card).toContainText("Find flights to Berlin in May");
  // It left the Chats list for the Nest, and nothing ran to do it.
  await expect(chrome.getByRole("heading", { name: "Chats" })).toHaveCount(0);
  await expect(chrome.getByRole("region", { name: /^Nests/ }).getByRole("button", { name: "Flights to Berlin", exact: true })).toBeVisible();
  const tabs = await chrome.evaluate(() => window.chromeAPI.browser.getTabs());
  expect(tabs.filter((tab) => tab.page === "chat")).toHaveLength(0);
  expect(model.requests).toHaveLength(1);

  // From the keyboard, Enter opens the card and Esc closes it.
  await card.focus();
  await chrome.keyboard.press("Enter");
  const reply = card.getByPlaceholder("Reply to Berry");
  await expect(reply).toBeVisible();
  await chrome.keyboard.press("Escape");
  await expect(reply).toHaveCount(0);

  // The composer places a card in the first free place, under this one.
  oneJob();
  model.replyWith("Two hotels by Alexanderplatz under €120.");
  await chrome.getByRole("textbox", { name: "Ask in this Nest" }).fill("Find a hotel near Alexanderplatz");
  await chrome.getByRole("textbox", { name: "Ask in this Nest" }).press("Enter");
  const hotels = cards.nth(1);
  await expect(hotels.getByRole("status")).toHaveText("Done");
  const below = async () => [(await card.boundingBox())!, (await hotels.boundingBox())!];
  const [firstAt, hotelsAt] = await below();
  expect(hotelsAt.y).toBeGreaterThan(firstAt.y + firstAt.height);
  expect(hotelsAt.x).toBeLessThan(firstAt.x + firstAt.width);

  // A reply on the card that asks before opening a page. It's waiting, so the sidebar's row says so.
  await card.focus();
  await chrome.keyboard.press("Enter");
  model.callTools({ name: "open_tab", args: { url: "https://example.com/flights?from=ARN&to=BER" } });
  model.replyWith("Opened it.");
  await reply.fill("Open the cheapest one");
  await reply.press("Enter");
  await expect(card.getByRole("status").first()).toHaveText("Needs your OK");
  await chrome.keyboard.press("Escape");
  // The card grew with the question, so the card placed under it moved down out of its way.
  await expect.poll(async () => {
    const [grown, moved] = await below();
    return moved.y - (grown.y + grown.height);
  }).toBeGreaterThan(0);
  await expect(chrome.getByRole("region", { name: /^Nests/ }).getByText("Needs you")).toBeAttached();

  // Away on the board, the card out of sight, the row in Needs you opens the Nest at that card, open and in view.
  const pane = (await chrome.locator(".react-flow__pane").boundingBox())!;
  await chrome.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  for (let tries = 0; tries < 20 && (await card.boundingBox())!.x < pane.x + pane.width; tries++) await chrome.mouse.wheel(400, 0);
  await expect(card).not.toBeInViewport();
  await chrome.getByRole("button", { name: /^Needs you/ }).click();
  const row = chrome.getByRole("listitem", { name: "Berry is asking" });
  await row.hover();
  await expect(row).toContainText("Flights to Berlin");
  await row.getByRole("button", { name: "Open the card" }).click();
  await expect(chrome.getByRole("textbox", { name: "Nest name" })).toHaveValue("Flights to Berlin");
  await expect(card.getByPlaceholder("Reply to Berry")).toBeVisible();
  await expect(card).toBeInViewport({ ratio: 0.5 });
  expect((await chrome.evaluate(() => window.chromeAPI.browser.getTabs())).filter((tab) => tab.page === "chat")).toHaveLength(0);

  // The sidebar's row does the same, from another tab.
  await chrome.evaluate(() => window.chromeAPI.browser.openPage("needs-you"));
  await chrome.getByRole("region", { name: /^Nests/ }).getByRole("button", { name: /^Flights to Berlin/ }).click();
  await expect(card.getByPlaceholder("Reply to Berry")).toBeVisible();
  await card.getByRole("button", { name: "Don’t allow" }).click();
  await expect(card.getByRole("status").first()).toHaveText("Done");
});

test("Allow for this card's runs lets a For-each card's other runs do exactly that, a card reads from two, and runs go again", async () => {
  test.setTimeout(120_000);
  model.reset();
  const server = createServer((_, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Draft</title><p>A draft</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // A model the price table knows, so the cards say what they cost: 30k tokens in at $1 a million is $0.03 a reply.
  model.usageWith({ input: 30_000, output: 0 });
  app = await launchApp(undefined, { modelEnv: { ...model.env, LLM_MODEL: "gpt-6.1-terra" } });
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900));
  const chrome = await findView(app, "view=chrome");
  const shots = async (name: string) => {
    if (!SHOTS) return;
    for (const appearance of ["light", "dark"] as const) {
      await chrome.evaluate((theme) => window.chromeAPI.settings.updateSettings({ appearance: theme }), appearance);
      await chrome.waitForTimeout(150);
      await chrome.screenshot({ path: join(SHOTS, `${name}-${appearance}.png`) });
    }
    await chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ appearance: "light" }));
  };
  try {
    // Started on the board itself, since a model name the price table knows changes how LangChain asks for a plan.
    await chrome.getByRole("button", { name: "New nest" }).click();
    await expect.poll(async () => (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).nests.length).toBe(1);
    const nestId = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).nests[0].id;
    model.replyWith(THREE_COMPANIES);
    const start = await chrome.evaluate((nest) => window.chromeAPI.nests.addCard(nest, { x: 0, y: 0 }), nestId);
    await chrome.evaluate((id) => window.chromeAPI.nests.send(id, "Find three Swedish SaaS companies"), start!.id);
    const cards = chrome.locator(".react-flow__node");
    const first = cards.first();
    await expect(first.getByRole("status")).toHaveText("Done");
    await expect(first.getByLabel("What this card’s chat has cost: $0.03")).toBeVisible();

    // Before For each row sends, it says what the runs will likely cost, from what the card it reads from cost.
    await first.hover();
    await first.getByLabel("Pull a new card out of Berry’s").click();
    const writer = cards.nth(1);
    if ((await writer.getByRole("switch").getAttribute("aria-checked")) !== "true") await writer.getByRole("switch").click();
    await expect(writer).toContainText("3 runs, about $0.09");
    await shots("estimate");

    // Each run opens the same address, which asks, and then one run opens another.
    const draftPage = `${origin}/draft?ref=nest`;
    for (let run = 0; run < 3; run++) model.callTools({ name: "open_tab", args: { url: draftPage } });
    model.callTools({ name: "open_tab", args: { url: `${origin}/other?ref=nest` } });
    model.replyWith("Saved the draft.");
    const prompt = writer.getByRole("textbox", { name: "What should Berry do?" });
    await prompt.fill("Open the draft page for the company");
    await prompt.press("Enter");

    // The three going at once each ask, each offering the same exact choice next to Allow.
    const forCard = writer.getByRole("button", { name: `Allow opening ${draftPage} for this card’s runs` });
    await expect(forCard).toHaveCount(3);
    await shots("allow-for-card");
    await forCard.first().click();

    // That allows the other two asking for exactly it. Another address still asks, with its own choice.
    await expect(forCard).toHaveCount(0);
    await expect(writer.getByRole("button", { name: `Allow opening ${origin}/other?ref=nest for this card’s runs` })).toHaveCount(1);
    expect(model.requests.filter((request) => JSON.stringify(request.messages).includes("/other?ref=nest"))).toHaveLength(0);

    // Stopped while that one asks, one run didn't finish, and it had done something allowed, so it says so first.
    await writer.getByRole("button", { name: "Stop" }).click();
    const retry = writer.getByRole("button", { name: "Retry 1 that didn’t finish" });
    await expect(retry).toBeVisible();
    await expect(writer.getByLabel(/^What its runs have cost so far: \$/)).toBeVisible();
    await retry.click();
    await expect(writer.getByRole("alert")).toContainText("may do it again");
    await shots("retry-warning");
    const before = model.requests.length;
    await writer.getByRole("button", { name: "Retry anyway" }).click();
    await expect(writer.getByRole("status").first()).toHaveText("Done");
    expect(model.requests.length - before).toBe(1);
    await expect(writer.getByRole("button", { name: /that didn’t finish/ })).toHaveCount(0);

    // A run's steps say which actions went by what was allowed for the card's runs.
    let shown = false;
    for (const company of ["Lindqvist Data", "Fjällbo", "Brygga"]) {
      await writer.getByRole("button", { name: `Open ${company}’s run` }).click();
      if ((await writer.getByText("Allowed for this card’s runs").count()) > 0) {
        shown = true;
        await shots("run-step");
        break;
      }
      await writer.getByRole("button", { name: "Every run" }).click();
    }
    expect(shown).toBe(true);
    await chrome.keyboard.press("Escape");

    // A card can read from two: Scout's thread and Berry's, each tagged by name, in order.
    const saved = await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Find rivals.", sites: [], tools: [] })
    );
    if (!saved.ok) throw new Error(saved.error);
    const scout = await chrome.evaluate(([nest, bird]) => window.chromeAPI.nests.addCard(nest!, { x: 0, y: 700, mascotId: bird }), [nestId, saved.id]);
    model.replyWith("Their rivals are Kvarnsten and Vinga.");
    await chrome.evaluate((id) => window.chromeAPI.nests.send(id, "Find their rivals"), scout!.id);
    const scoutCard = chrome.locator(`.react-flow__node[data-id="${scout!.id}"]`);
    await expect(scoutCard.getByRole("status")).toHaveText("Done");
    const compare = await chrome.evaluate((nest) => window.chromeAPI.nests.addCard(nest, { x: 900, y: 700 }), nestId);
    const compareCard = chrome.locator(`.react-flow__node[data-id="${compare!.id}"]`);
    await compareCard.getByRole("button", { name: "Add a file, a note or an input" }).click();
    await chrome.getByRole("menuitem", { name: "Add an input: Scout" }).click();
    await compareCard.getByRole("button", { name: "Add a file, a note or an input" }).click();
    await chrome.getByRole("menuitem", { name: "Add an input: Berry" }).first().click();
    await expect(compareCard).toContainText("gets Scout’s thread and Berry’s");
    await shots("two-inputs");
    model.replyWith("Lindqvist Data is ahead of Kvarnsten.");
    const comparePrompt = compareCard.getByRole("textbox", { name: "What should Berry do?" });
    await comparePrompt.fill("Compare each company with its rivals");
    await comparePrompt.press("Enter");
    await expect(compareCard.getByRole("status")).toHaveText("Done");
    const message = newestUserMessage(model.requests.at(-1)!);
    expect(message.indexOf('<card_thread from="Scout">')).toBe(0);
    expect(message.indexOf('<card_thread from="Berry">')).toBeGreaterThan(0);
    expect(message.endsWith("Compare each company with its rivals")).toBe(true);
  } finally {
    server.close();
  }
});

test("a starter only fills an empty Nest's composer, and a chat that's several jobs offers its request as a Nest", async () => {
  model.reset();
  app = await launchApp(undefined, { modelEnv: model.env });
  const chrome = await findView(app, "view=chrome");

  // Pressing a starter fills the composer with its first blank selected, so typing replaces it, and sends nothing.
  await chrome.getByRole("button", { name: "New nest" }).click();
  const composer = chrome.getByRole("textbox", { name: "Ask in this Nest" });
  await chrome.getByRole("button", { name: "Find customers" }).click();
  await expect(composer).toBeFocused();
  await chrome.keyboard.type("SaaS companies");
  await expect(composer).toHaveValue(/^Find 10 SaaS companies in \[place\]/);
  expect(model.planRequests).toHaveLength(0);

  // Sent, it's the user's words, planned as any request is, and the starters go once there's a card.
  oneJob();
  model.replyWith("Ten found.");
  await composer.press("Enter");
  await expect.poll(() => model.planRequests.length).toBe(1);
  expect(newestUserMessage(model.planRequests[0])).toContain("Find 10 SaaS companies in [place]");
  await expect(chrome.locator(".react-flow__node")).toHaveCount(1);
  await expect(chrome.getByRole("group", { name: "Start from" })).toHaveCount(0);

  // A chat asked to compare three things suggests a Nest under its reply.
  model.replyWith("Here's how they compare.");
  const request = "Compare Notion, Coda and Slite for a small team";
  const sent = await chrome.evaluate((text) => window.chromeAPI.chat.send(null, text, { seePage: false }), request);
  await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
  await expect(chrome.getByText("That’s several jobs, which a Nest does side by side.")).toBeVisible();
  const requestsBefore = model.requests.length;

  // Pressing it opens a new Nest with the request in its composer, unsent, and it doesn't come back for this chat.
  await chrome.getByRole("button", { name: "Open as a Nest" }).click();
  await expect(chrome.getByRole("textbox", { name: "Nest name" })).toHaveValue("New Nest");
  await expect(composer).toHaveValue(request);
  await expect(chrome.locator(".react-flow__node")).toHaveCount(0);
  expect(model.planRequests).toHaveLength(1);
  expect(model.requests).toHaveLength(requestsBefore);
  await chrome.evaluate((id) => window.chromeAPI.browser.openPage("chat", { param: id }), sent!.id);
  await expect(chrome.getByRole("button", { name: "Open as a Nest" })).toBeVisible();
  await expect(chrome.getByText("That’s several jobs, which a Nest does side by side.")).toHaveCount(0);
});
