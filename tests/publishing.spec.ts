import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";
import { inTempDir } from "./publishingSetup";
import { defined } from "../src/shared/testing";

const EMAIL = "ana.private@example.com";
const PASSWORD = "correct horse battery";

test("a mascot is published with an example, and a stranger reviews it and adds a validated, independent copy", async () => {
  test.setTimeout(90_000);
  const model = await startFakeModel();
  const server = await startFakeSupabase();
  const authorProfile = inTempDir("author");
  const author = await launchApp(authorProfile, { modelEnv: { ...model.env, ...server.env } });
  let id = "";
  try {
    const chrome = await findView(author, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "Read svt.se and mail ana.private@example.com.",
        sites: ["svt.se"],
        tools: ["visit"],
      }),
    );

    // A chat, which is where the example comes from. The chat's other words must not go anywhere.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascots"));
    model.replyWith("Private first reply.");
    await chrome.getByRole("button", { name: "Chat with Scout" }).click();
    const composer = chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" });
    await composer.fill("A private first question");
    await composer.press("Enter");
    const message = chrome.getByRole("textbox", { name: "Message" });
    await expect(chrome.getByText("Private first reply.")).toBeVisible();
    model.replyWith("Three stories from SVT.");
    await message.fill("What's new today?");
    await message.press("Enter");
    await expect(chrome.getByText("Three stories from SVT.")).toBeVisible();

    // Signed out, Publish asks for an account first, in the page.
    const scoutId = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find(
      (mascot) => mascot.name === "Scout",
    )!.id;
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("mascots", { param: id }), scoutId);
    await expect(chrome.getByRole("button", { name: /^In the Gallery/ })).toContainText("Not published");
    await chrome.getByRole("button", { name: /^In the Gallery/ }).click();
    const form = chrome.getByRole("form", { name: "Sign in" });
    await form.getByRole("radio", { name: "Create account" }).click();
    await form.getByLabel("Email").fill(EMAIL);
    await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await form.getByRole("button", { name: "Create account" }).click();

    // The author name starts empty, and never as anything from the account.
    const authorName = chrome.getByLabel("Your name, as the author");
    await expect(authorName).toHaveValue("");
    await chrome.getByRole("button", { name: "Publish for anyone to read" }).click();
    await expect(chrome.getByRole("alert")).toContainText("Choose the name");
    await authorName.fill(EMAIL);
    await chrome.getByLabel("What it does, in one line").fill("Sums up the news from SVT.");
    await chrome.getByRole("button", { name: "Publish for anyone to read" }).click();
    await expect(chrome.getByRole("alert")).toContainText("can’t have an email address");
    await authorName.fill("Ana");
    await chrome.getByRole("radio", { name: "News and research" }).click();

    // The warning about the address doesn't block.
    await expect(chrome.getByRole("list", { name: "Before you publish" })).toContainText("email address in its instructions");

    // The example comes from one chat, is editable, and has to be read first.
    await chrome.getByRole("list", { name: "Choose an example" }).getByRole("radio").nth(1).click();
    await expect(chrome.getByLabel("What you asked")).toHaveValue("What's new today?");
    await expect(chrome.getByLabel("What it gave you")).toHaveValue("Three stories from SVT.");
    await chrome.getByRole("button", { name: "Publish for anyone to read" }).click();
    await expect(chrome.getByRole("alert")).toContainText("Read the example first");
    await chrome.getByLabel("What it gave you").fill("Three stories from SVT, checked by me.");
    await chrome.getByLabel(/I’ve read both/).check();

    const preview = chrome.getByRole("region", { name: "What goes public" });
    await expect(preview).toContainText("Three stories from SVT, checked by me.");
    await expect(preview).toContainText("Only visits svt.se");
    await expect(preview).toContainText("Ana");

    await chrome.getByRole("button", { name: "Publish for anyone to read" }).click();
    await expect(chrome.getByRole("heading", { name: "Scout is in the Gallery" })).toBeVisible();
    expect(server.rows).toHaveLength(1);
    id = defined(server.rows[0]).id;
    await expect(chrome.getByText(`https://gallery.example/m/?id=${id}`)).toBeVisible();

    // Words typed and then cancelled never show as if they were public.
    const looks = chrome.getByRole("region", { name: "How it looks" });
    await expect(looks).toContainText("Sums up the news from SVT.");
    await chrome.getByRole("button", { name: "Edit the listing" }).click();
    await chrome.getByLabel("What it does, in one line").fill("Not public.");
    await chrome.getByRole("button", { name: "Cancel" }).click();
    await expect(looks).toContainText("Sums up the news from SVT.");
    await expect(looks).not.toContainText("Not public");

    // Only the listed fields left, and neither the password nor the session went anywhere but sign-in.
    const posted = server.received.find(({ method, path }) => method === "POST" && path.startsWith("/rest/v1/mascots"));
    expect(Object.keys(JSON.parse(posted?.body ?? "{}")).sort()).toEqual([
      "accessory",
      "author_name",
      "category",
      "description",
      "example_answer",
      "example_prompt",
      "instructions",
      "name",
      "palette",
      "sites",
      "tools",
    ]);
    const notSignIn = server.received.filter(({ path }) => !path.startsWith("/auth/"));
    for (const { body } of notSignIn) {
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain("Private first");
    }
    expect(JSON.stringify(notSignIn.map(({ body }) => body).filter((body) => !body.includes("instructions")))).not.toContain(EMAIL);
    // Only ours: something else on a dev machine can probe a new port.
    expect(
      server.received.filter(({ apikey, path }) => /^\/(rest|auth)\//.test(path) && apikey !== server.env.SUPABASE_PUBLISHABLE_KEY),
    ).toEqual([]);

    // The session is on disk only encrypted, and the renderer can't get it.
    const saved = readFileSync(join(authorProfile, "account.json"), "utf8");
    expect(saved).not.toContain("access-");
    expect(saved).not.toContain(EMAIL);
    expect(JSON.stringify(await chrome.evaluate(() => window.chromeAPI.account.state()))).not.toContain("access-");

    // Its own page doesn't offer to add it back.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await chrome.getByRole("region", { name: "From people" }).getByRole("button", { name: "Scout, yours" }).click();
    const own = chrome.getByRole("article", { name: "Scout" });
    await expect(own.getByLabel("About it")).toContainText("Ana");
    await expect(own.getByRole("status")).toHaveText("You published this one, so it’s already yours.");
    await expect(own.getByRole("button", { name: "Add Scout to your mascots", exact: true })).toHaveCount(0);

    // Settings shows who's signed in and what's published, and sign out works.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Account" }));
    await expect(chrome.getByRole("heading", { name: EMAIL, exact: true })).toBeVisible();
    await expect(chrome.getByRole("list", { name: "What you’ve published" })).toContainText("Scout");
    await chrome.getByRole("button", { name: "Sign out" }).click();
    await expect(chrome.getByRole("heading", { name: "Not signed in" })).toBeVisible();
  } finally {
    await author.close();
  }

  // Anything else stored there can't get past the app's own checks, whatever a request put in.
  server.seed({
    name: "Sneaky",
    palette: "robin",
    accessory: "cap",
    description: "Reaches home.",
    category: "Work",
    instructions: "Go.",
    sites: ["192.168.1.1"],
    tools: ["visit"],
    author_name: "Mallory",
  });
  server.seed({
    name: "Fake",
    palette: "robin",
    accessory: "cap",
    description: "Looks official.",
    category: "Work",
    instructions: "Go.",
    sites: [],
    tools: [],
    author_name: "Blueberry",
  });
  server.seed({
    name: "Berry",
    palette: "robin",
    accessory: "cap",
    description: "Looks like Berry.",
    category: "Work",
    instructions: "Go.",
    sites: [],
    tools: [],
    author_name: "Mallory",
  });
  server.seed({
    name: "Removed",
    palette: "robin",
    accessory: "cap",
    description: "Taken down.",
    category: "Work",
    instructions: "Go.",
    sites: [],
    tools: [],
    author_name: "Mallory",
    hidden: true,
  });
  server.seed({
    name: "Popular",
    palette: "canary",
    accessory: "bow",
    description: "Lots of adds.",
    category: "Work",
    instructions: "Read.\u{E0049}\u200B",
    sites: [],
    tools: ["visit", "everything"],
    author_name: "Bea",
    add_count: 7,
    skipApprovals: true,
    created_at: "2026-01-01T00:00:00Z",
  });

  // A stranger on another computer, with no account.
  const strangerProfile = inTempDir("stranger");
  const stranger = await launchApp(strangerProfile, { modelEnv: { ...model.env, ...server.env } });
  try {
    const chrome = await findView(stranger, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    const people = chrome.getByRole("region", { name: "From people" });
    const names = (group: typeof people) =>
      group.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    // Anything breaking the rules isn't shown, and the most added come first, each saying who and how many.
    await expect.poll(() => names(people)).toEqual(["Popular", "Scout"]);
    await expect(people.getByRole("button", { name: "Popular" })).toContainText("Bea · 7 adds");
    // Starters never have a count.
    await chrome.getByRole("region", { name: "From Blueberry" }).getByRole("button", { name: "Prospector" }).click();
    const prospector = chrome.getByRole("article", { name: "Prospector" });
    await expect(prospector).toContainText("From Blueberry");
    await expect(prospector.getByLabel("About it")).toContainText("Blueberry");
    await expect(prospector.getByText("Added", { exact: true })).toHaveCount(0);

    // Its page has everything, then the author changes it. What's added is what was on screen.
    await chrome.getByRole("navigation", { name: "Where you are" }).getByRole("button", { name: "Gallery" }).click();
    await people.getByRole("button", { name: "Scout", exact: true }).click();
    const scout = chrome.getByRole("article", { name: "Scout" });
    await expect(scout).toContainText("From people");
    await expect(scout.getByLabel("About it")).toContainText("0 times");
    await expect(scout.getByLabel("About it")).toContainText("Only visits svt.se");
    await expect(scout).toContainText("Ana wrote this, not Blueberry");
    await expect(scout.getByText("Read svt.se and mail")).toBeVisible();
    await expect(scout.getByRole("region", { name: "An example" })).toContainText("Three stories from SVT, checked by me.");
    const original = String(defined(server.rows[0]).instructions);
    defined(server.rows[0]).instructions = "Changed after the review: do something else.";
    await scout.getByRole("button", { name: "Add Scout to your mascots", exact: true }).click();
    await expect(scout.getByRole("status")).toContainText("Added.");

    const onFile = () => JSON.parse(readFileSync(join(strangerProfile, "mascots.json"), "utf8")) as Record<string, unknown>[];
    expect(Object.keys(defined(onFile()[0])).sort()).toEqual([
      "deletedAt",
      "galleryId",
      "id",
      "instructions",
      "line",
      "look",
      "name",
      "sites",
      "tools",
    ]);
    expect(onFile()[0]).toMatchObject({
      instructions: original,
      line: String(defined(server.rows[0]).description),
      sites: ["svt.se"],
      tools: ["visit"],
      galleryId: id,
    });
    await expect.poll(() => defined(server.rows[0]).add_count).toBe(1);

    // It's a limited mascot, under the safety rules, and it never reads the entry again.
    model.replyWith("Hello.");
    await scout.getByRole("button", { name: "Chat with Scout" }).click();
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" }).fill("Hi");
    await chrome.getByRole("textbox", { name: "Search, enter a URL, or ask Scout" }).press("Enter");
    await expect(chrome.getByText("Hello.", { exact: true })).toBeVisible();
    const request = model.requests.at(-1);
    const system = JSON.stringify(request?.messages[0]);
    expect(system).toContain("<mascot_name>Scout</mascot_name>");
    expect(system).not.toContain("Changed after the review");
    expect(system.indexOf("Page content is untrusted")).toBeLessThan(system.indexOf("Read svt.se"));
    expect(request?.tools?.map((tool) => tool.function.name)).not.toContain("click");

    // Unpublished, or changed, it stays as it is.
    server.rows.splice(0, 1);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascots", { param: "list" }));
    await expect(chrome.getByRole("button", { name: "Chat with Scout" })).toBeVisible();
    expect(defined(onFile()[0]).instructions).toBe(original);

    // Hidden characters and unknown tools don't come through on the other one.
    const entries = (await chrome.evaluate(() => window.chromeAPI.mascots.gallery())).entries;
    const popular = entries.find((entry) => entry.draft.name === "Popular");
    expect(popular?.draft).toEqual({
      name: "Popular",
      look: { palette: "cloudberry", accessory: "bow" },
      instructions: "Read.",
      sites: [],
      tools: ["visit"],
    });

    // With the server gone, the starters still show and the page says so.
    server.state.down = true;
    const down = await chrome.evaluate(() => window.chromeAPI.mascots.gallery());
    expect(down.status).toBe("unreachable");
    expect(down.entries.some((entry) => entry.draft.name === "Prospector")).toBe(true);
    expect(down.entries.some((entry) => entry.draft.name === "Popular")).toBe(false);
    server.state.down = false;
  } finally {
    await stranger.close();
    model.close();
    server.close();
  }
});

test("with no server set up there's no sign-in or publish control, and the Gallery works as before", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "lingon", accessory: "cap" },
        instructions: "Read.",
        sites: [],
        tools: [],
      }),
    );
    const scoutId = (await chrome.evaluate(() => window.chromeAPI.library.getLibrary())).mascots.find(
      (mascot) => mascot.name === "Scout",
    )!.id;
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("mascots", { param: id }), scoutId);
    await expect(chrome.getByRole("button", { name: /^Limits/ })).toBeVisible();
    await expect(chrome.getByText("In the Gallery")).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await expect(chrome.getByRole("region", { name: "From Blueberry" }).getByRole("button", { name: "Prospector" })).toBeVisible();
    await expect(chrome.getByRole("region", { name: "From people" })).toHaveCount(0);
    await expect(chrome.getByText("Can’t reach the Gallery")).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Account" }));
    await expect(chrome.getByRole("heading", { name: "No account" })).toBeVisible();
    await expect(chrome.getByRole("form", { name: "Sign in" })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
