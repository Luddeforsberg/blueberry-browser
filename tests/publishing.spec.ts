// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../src/preload/chrome.d.ts" />
import { expect, test } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findView, launchApp } from "./app";
import { startFakeModel } from "./fakeModel";
import { startFakeSupabase } from "./fakeSupabase";

const EMAIL = "ana.private@example.com";
const PASSWORD = "correct horse battery";

const inTempDir = (name: string) => mkdtempSync(join(tmpdir(), `blueberry-publishing-${name}-`));

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
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read svt.se and mail ana.private@example.com.", sites: ["svt.se"], tools: ["visit"] })
    );

    // A chat, which is where the example comes from. The chat's other words must not go anywhere.
    await chrome.getByRole("button", { name: "Flock", exact: true }).click();
    model.replyWith("Private first reply.");
    await chrome.getByRole("listitem").filter({ hasText: "Scout" }).getByRole("button", { name: "Chat", exact: true }).click();
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
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("flock"));
    await chrome.getByRole("button", { name: "Publish Scout" }).click();
    const form = chrome.getByRole("form", { name: "Sign in" });
    await form.getByRole("radio", { name: "Create account" }).click();
    await form.getByLabel("Email").fill(EMAIL);
    await form.getByLabel("Password").fill(PASSWORD);
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
    id = server.rows[0].id;
    await expect(chrome.getByText(`https://gallery.example/m/?id=${id}`)).toBeVisible();

    // Words typed and then cancelled never show as if they were public.
    const looks = chrome.getByRole("region", { name: "How it looks" });
    await expect(looks).toContainText("By Ana");
    await chrome.getByRole("button", { name: "Edit the listing" }).click();
    await authorName.fill("Not public");
    await chrome.getByRole("button", { name: "Cancel" }).click();
    await expect(looks).toContainText("By Ana");
    await expect(looks).not.toContainText("Not public");

    // Only the listed fields left, and neither the password nor the session went anywhere but sign-in.
    const posted = server.received.find(({ method, path }) => method === "POST" && path.startsWith("/rest/v1/mascots"));
    expect(Object.keys(JSON.parse(posted?.body ?? "{}")).sort()).toEqual(["accessory", "author_name", "category", "description", "example_answer", "example_prompt", "instructions", "name", "palette", "sites", "tools"]);
    const notSignIn = server.received.filter(({ path }) => !path.startsWith("/auth/"));
    for (const { body } of notSignIn) {
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain("Private first");
    }
    expect(JSON.stringify(notSignIn.map(({ body }) => body).filter((body) => !body.includes("instructions")))).not.toContain(EMAIL);
    // Only ours: something else on a dev machine can probe a new port.
    expect(server.received.filter(({ apikey, path }) => /^\/(rest|auth)\//.test(path) && apikey !== server.env.SUPABASE_PUBLISHABLE_KEY)).toEqual([]);

    // The session is on disk only encrypted, and the renderer can't get it.
    const saved = readFileSync(join(authorProfile, "account.json"), "utf8");
    expect(saved).not.toContain("access-");
    expect(saved).not.toContain(EMAIL);
    expect(JSON.stringify(await chrome.evaluate(() => window.chromeAPI.account.state()))).not.toContain("access-");

    // Its own card doesn't offer to add it back.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    const own = chrome.getByRole("list", { name: "Gallery", exact: true }).getByRole("listitem", { name: "Scout", exact: true });
    await expect(own).toContainText("By Ana");
    await expect(own.getByRole("button", { name: "Add Scout", exact: true })).toHaveCount(0);

    // Settings shows who's signed in and what's published, and sign out works.
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Account" }));
    await expect(chrome.getByRole("heading", { name: `Signed in as ${EMAIL}` })).toBeVisible();
    await expect(chrome.getByRole("list", { name: "What you’ve published" })).toContainText("Scout");
    await chrome.getByRole("button", { name: "Sign out" }).click();
    await expect(chrome.getByRole("heading", { name: "Not signed in" })).toBeVisible();
  } finally {
    await author.close();
  }

  // Anything else stored there can't get past the app's own checks, whatever a request put in.
  server.seed({ name: "Sneaky", palette: "robin", accessory: "cap", description: "Reaches home.", category: "Work", instructions: "Go.", sites: ["192.168.1.1"], tools: ["visit"], author_name: "Mallory" });
  server.seed({ name: "Fake", palette: "robin", accessory: "cap", description: "Looks official.", category: "Work", instructions: "Go.", sites: [], tools: [], author_name: "Blueberry" });
  server.seed({ name: "Berry", palette: "robin", accessory: "cap", description: "Looks like Berry.", category: "Work", instructions: "Go.", sites: [], tools: [], author_name: "Mallory" });
  server.seed({ name: "Removed", palette: "robin", accessory: "cap", description: "Taken down.", category: "Work", instructions: "Go.", sites: [], tools: [], author_name: "Mallory", hidden: true });
  server.seed({ name: "Popular", palette: "canary", accessory: "bow", description: "Lots of adds.", category: "Work", instructions: "Read.\u{E0049}\u200B", sites: [], tools: ["visit", "everything"], author_name: "Bea", add_count: 7, skipApprovals: true, created_at: "2026-01-01T00:00:00Z" });

  // A stranger on another computer, with no account.
  const strangerProfile = inTempDir("stranger");
  const stranger = await launchApp(strangerProfile, { modelEnv: { ...model.env, ...server.env } });
  try {
    const chrome = await findView(stranger, "view=chrome");
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    const gallery = chrome.getByRole("list", { name: "Gallery", exact: true });
    const scout = gallery.getByRole("listitem", { name: "Scout", exact: true });
    await expect(scout).toContainText("By Ana");
    await expect(scout).toContainText("0 adds");
    await expect(scout).toContainText("Only visits svt.se");
    for (const name of ["Sneaky", "Fake", "Berry", "Removed"]) await expect(gallery.getByRole("listitem", { name, exact: true })).toHaveCount(0);

    // Starters still show, with no made-up count.
    const paper = gallery.getByRole("listitem", { name: "Morning Paper" });
    await expect(paper).toContainText("By Blueberry");
    await expect(paper).not.toContainText("adds");

    // Sorting is real.
    await expect(gallery.getByRole("heading").first()).toHaveText("Scout");
    await chrome.getByRole("radio", { name: "Most added" }).click();
    await expect(gallery.getByRole("heading").first()).toHaveText("Popular");
    await chrome.getByRole("radio", { name: "Newest" }).click();

    // The review has everything, then the author changes it. What's added is what was reviewed.
    await scout.getByRole("button", { name: "Add Scout", exact: true }).click();
    await expect(chrome.getByText("Read svt.se and mail")).toBeVisible();
    await expect(chrome.getByRole("region", { name: "Example" })).toContainText("Three stories from SVT, checked by me.");
    const original = String(server.rows[0].instructions);
    server.rows[0].instructions = "Changed after the review: do something else.";
    await chrome.getByRole("button", { name: "Add to flock" }).click();
    await expect(chrome.getByRole("heading", { name: "Scout is in your flock" })).toBeVisible();

    const onFile = () => JSON.parse(readFileSync(join(strangerProfile, "mascots.json"), "utf8")) as Record<string, unknown>[];
    expect(Object.keys(onFile()[0]).sort()).toEqual(["deletedAt", "galleryId", "id", "instructions", "look", "name", "sites", "tools"]);
    expect(onFile()[0]).toMatchObject({ instructions: original, sites: ["svt.se"], tools: ["visit"], galleryId: id });
    await expect.poll(() => server.rows[0].add_count).toBe(1);

    // It's a limited mascot, under the safety rules, and it never reads the entry again.
    model.replyWith("Hello.");
    await chrome.getByRole("button", { name: "Start a chat with Scout" }).click();
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
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("flock"));
    await expect(chrome.getByRole("list", { name: "Your flock" }).getByRole("listitem").filter({ hasText: "Scout" })).toBeVisible();
    expect(onFile()[0].instructions).toBe(original);

    // Hidden characters and unknown tools don't come through on the other one.
    const entries = (await chrome.evaluate(() => window.chromeAPI.mascots.gallery())).entries;
    const popular = entries.find((entry) => entry.draft.name === "Popular");
    expect(popular?.draft).toEqual({ name: "Popular", look: { palette: "canary", accessory: "bow" }, instructions: "Read.", sites: [], tools: ["visit"] });

    // With the server gone, the starters still show and the page says so.
    server.state.down = true;
    const down = await chrome.evaluate(() => window.chromeAPI.mascots.gallery());
    expect(down.status).toBe("unreachable");
    expect(down.entries.some((entry) => entry.draft.name === "Morning Paper")).toBe(true);
    expect(down.entries.some((entry) => entry.draft.name === "Popular")).toBe(false);
    server.state.down = false;
  } finally {
    await stranger.close();
    model.close();
    server.close();
  }
});

test("a blueberry://mascot link opens that Gallery entry, fetched again, and adds nothing", async () => {
  const server = await startFakeSupabase();
  const scout = server.seed({ name: "Scout", palette: "robin", accessory: "cap", description: "Sums up SVT.", category: "News and research", instructions: "Read svt.se.", sites: ["svt.se"], tools: ["visit"], author_name: "Ana" });
  const profile = inTempDir("linked");
  const app = await launchApp(profile, { modelEnv: server.env });
  // The way the system hands a link over: `open-url` on a Mac, a second launch's arguments on Windows and Linux.
  const openUrl = (link: string) => app.evaluate(({ app: electronApp }, url) => electronApp.emit("open-url", { preventDefault: () => {} }, url), link);
  const secondLaunch = (link: string) => app.evaluate(({ app: electronApp }, url) => electronApp.emit("second-instance", {}, ["blueberry-browser", "--some-switch", url], process.cwd()), link);
  const activePage = () => chrome.evaluate(async () => (await window.chromeAPI.browser.getTabs()).find((tab) => tab.isActive)?.page ?? null);
  let chrome = await findView(app, "view=chrome");
  try {
    // It registers for the scheme, which a test only writes down.
    expect(await app.evaluate(() => (globalThis as { fakeProtocols?: unknown[][] }).fakeProtocols?.map(([scheme]) => scheme))).toEqual(["blueberry"]);

    // Anything but the one form does nothing at all.
    expect(await activePage()).toBe("new-tab");
    for (const link of [`blueberry://mascot/${scout.id}?add=1`, `blueberry://mascot/${scout.id}/`, `blueberry://routine/${scout.id}`, "blueberry://mascot/javascript:alert(1)", `blueberry://mascot/${"a".repeat(5000)}`]) {
      await openUrl(link);
      await secondLaunch(link);
    }
    await chrome.waitForTimeout(300);
    expect(await activePage()).toBe("new-tab");

    await openUrl(`blueberry://mascot/${scout.id}`);
    await expect(chrome.getByRole("heading", { name: "Add Scout to your flock?" })).toBeVisible();
    expect(await activePage()).toBe("mascot-gallery");
    await expect(chrome.getByText("From a link you opened")).toBeVisible();
    await expect(chrome.getByText("Sums up SVT.")).toBeVisible();
    await expect(chrome.getByRole("list", { name: "What it’s allowed to do" }).first()).toContainText("Only visits svt.se");

    // The same link again, from a second launch while another tab is in front, opens it again from the server as it is now.
    await chrome.getByRole("button", { name: "Cancel" }).click();
    await expect(chrome.getByRole("heading", { name: "Gallery", exact: true })).toBeVisible();
    await chrome.evaluate(() => window.chromeAPI.browser.createTab());
    expect(await activePage()).toBe("new-tab");
    scout.description = "Sums up SVT, now without sport.";
    // As if it were pressed again a while later, since the same link straight away is dropped.
    await app.evaluate(() => {
      const real = Date.now;
      Date.now = () => real() + 10_000;
    });
    await secondLaunch(`blueberry://mascot/${scout.id.toUpperCase()}`);
    await expect(chrome.getByText("Sums up SVT, now without sport.")).toBeVisible();
    await expect(chrome.getByRole("heading", { name: "Add Scout to your flock?" })).toBeVisible();

    // One that's gone says so.
    await openUrl("blueberry://mascot/00000000-0000-4000-8000-000000000000");
    await expect(chrome.getByRole("heading", { name: "This mascot isn’t in the Gallery any more" })).toBeVisible();

    // Nothing was added, counted or run.
    expect(existsSync(join(profile, "mascots.json")) ? JSON.parse(readFileSync(join(profile, "mascots.json"), "utf8")) : []).toEqual([]);
    expect(scout.add_count).toBe(0);
    expect(server.received.filter(({ path }) => path.includes("record_add"))).toEqual([]);
  } finally {
    await app.close();
  }

  // A Gallery tab opened on an id, as a link that comes before the page has loaded leaves it, opens the same review.
  const again = await launchApp(profile, { modelEnv: server.env });
  try {
    chrome = await findView(again, "view=chrome");
    await chrome.evaluate((id) => window.chromeAPI.browser.openPage("mascot-gallery", { param: id }), scout.id);
    await expect(chrome.getByRole("heading", { name: "Add Scout to your flock?" })).toBeVisible();
  } finally {
    await again.close();
    server.close();
  }
});

test("with no server set up there's no sign-in or publish control, and the Gallery works as before", async () => {
  const app = await launchApp();
  try {
    const chrome = await findView(app, "view=chrome");
    await chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read.", sites: [], tools: [] })
    );
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("flock"));
    await expect(chrome.getByRole("button", { name: "Edit Scout" })).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Publish Scout" })).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("mascot-gallery"));
    await expect(chrome.getByRole("list", { name: "Gallery", exact: true }).getByRole("listitem", { name: "Morning Paper" })).toBeVisible();
    await expect(chrome.getByRole("radio", { name: "Most added" })).toHaveCount(0);
    await expect(chrome.getByText("Couldn’t reach the Gallery’s server")).toHaveCount(0);
    await chrome.evaluate(() => window.chromeAPI.browser.openPage("settings", { param: "Account" }));
    await expect(chrome.getByRole("heading", { name: "No account" })).toBeVisible();
    await expect(chrome.getByRole("form", { name: "Sign in" })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
