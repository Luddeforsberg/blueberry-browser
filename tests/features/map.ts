// Preload types live beside a .ts file of the same name, so TypeScript skips them unless asked.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../src/preload/chrome.d.ts" />
import type { Page } from "@playwright/test";
import { mascotSnapshot } from "../../src/main/cloudJobs";
import type { MascotProfile } from "../../src/shared/library";
import type { InternalPage, Settings } from "../../src/shared/ipc";
import { flockRows } from "../../src/shared/phone";
import { join } from "node:path";
import { chooseFromMenu, findView } from "../app";
import type { Drive } from "./driver";
import { LIVE, type PhoneDrive } from "./phone";
import type { FakeModel } from "../fakeModel";
import { SETTINGS_PAGES, SETTINGS_SECTIONS } from "../../src/shared/settingsPlaces";
import { habitProposals, habitVisits, writeBrowserHistory } from "./history";

// Every feature a user can reach, as data: its name, the DESIGN.md section it's in, how to open it and the states worth
// seeing. `pnpm run drive` opens one, `pnpm run baseline` pictures them all, and tests/featureMap.spec.ts opens each
// once. Every state is reached through the app and the fakes, as a test would, never by drawing it by hand.

export type Theme = "light" | "dark";
export type LayoutMode = "vertical" | "horizontal";
export interface Look {
  theme: Theme;
  layout: LayoutMode;
  width: number;
}

// What a feature needs before the app starts.
export interface Needs {
  supabase?: boolean;
  // A headless Chrome standing in for the cloud browser.
  cloudBrowser?: boolean;
  // Starts with the first run instead of skipping it.
  firstRun?: boolean;
  // Starts with the starter mascots in the flock.
  starters?: boolean;
  settings?: Partial<Settings>;
  // Files to put in the profile, at the moment drive's clock starts at.
  profile?: (dir: string, now: number) => Promise<void> | void;
  // More environment for the app, given the profile.
  env?: (dir: string) => Record<string, string>;
  // What the fake model answers from the start, for anything the app asks it at launch.
  model?: (model: FakeModel) => void;
}

export interface FeatureState {
  // Opens the feature in this state and waits until it's there.
  open: (drive: Drive) => Promise<void>;
  // On top of the feature's own needs.
  needs?: Needs;
  // The window to picture, by a view it holds, when it isn't the feature's.
  window?: string;
}

interface FeatureBase {
  name: string;
  // The section of DESIGN.md it's drawn from.
  design: string;
  // Which layouts change how it looks. "none" is outside the browser window, such as the desktop mascot.
  layouts: "both" | LayoutMode | "none";
}

// A feature of the app, opened in the built app with the fakes behind it.
export interface AppFeature extends FeatureBase {
  surface?: "app";
  // The window to picture, by a view it holds. The browser window, by its chrome view, unless it says otherwise.
  window?: string;
  needs?: Needs;
  // The first state is the one opened when none is named.
  states: Record<string, FeatureState>;
}

// The phone page in site/app/, in a browser at a phone's size against the fake Supabase.
export interface PhoneFeature extends FeatureBase {
  surface: "phone";
  layouts: "none";
  states: Record<string, { open: (phone: PhoneDrive) => Promise<void> }>;
}

export type Feature = AppFeature | PhoneFeature;

// The ways in that every feature shares, the same calls the end-to-end tests make.

const openPage = (drive: Drive, page: InternalPage, param?: string) =>
  drive.chrome.evaluate(([page, param]) => window.chromeAPI.browser.openPage(page, param ? { param } : undefined), [page, param] as const);

const seen = (where: Page, text: string | RegExp) => where.getByText(text).first().waitFor();
const heading = (where: Page, name: string | RegExp) => where.getByRole("heading", { name }).first().waitFor();

const createTab = async (drive: Drive, url: string) => {
  await drive.chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), url);
  const page = await findView(drive.app, url);
  await page.waitForLoadState("load");
  return page;
};

const tabs = (drive: Drive) => drive.chrome.evaluate(() => window.chromeAPI.browser.getTabs());

const switchTo = async (drive: Drive, find: (tab: Awaited<ReturnType<typeof tabs>>[number]) => boolean) => {
  const tab = (await tabs(drive)).find(find);
  if (!tab) throw new Error("No such tab");
  await drive.chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), tab.id);
};

// Three pages open, ending on the news, so the tabs and the history have something in them.
const threeTabs = async (drive: Drive) => {
  for (const [host, path] of [["shop.example", "/"], ["travel.example", "/flights"], ["news.example", "/news"]]) await createTab(drive, drive.site.url(host, path));
  await seen(drive.chrome, "Morning News");
};

// A chat sent from the new tab, as typing in the box does, and opened.
const startChat = async (drive: Drive, text: string, { title = "NONE", cloud = false }: { title?: string; cloud?: boolean } = {}) => {
  drive.model.titleWith(title);
  const sent = await drive.chrome.evaluate(([text, cloud]) => window.chromeAPI.chat.send(null, text, { seePage: false, cloud }), [text, cloud] as const);
  if (!sent) throw new Error("The chat wasn't sent");
  await openPage(drive, "chat", sent.id);
  return sent.id;
};

const approvalCard = (where: Page) => where.getByRole("region", { name: "Approval needed" }).first().waitFor();

// A few chats with names, so the sidebar's Chats and Needs you have rows.
const someChats = async (drive: Drive) => {
  drive.model.replyWith("The cheapest is the 1 m cable, for 49 kr.");
  await startChat(drive, "Find the cheapest USB-C cable", { title: "Cheapest cable" });
  await seen(drive.chrome, "The cheapest is the 1 m cable");
  drive.model.replyWith("Three flights under €200 this weekend.");
  await startChat(drive, "Flights to Lisbon this weekend", { title: "Lisbon weekend" });
  await seen(drive.chrome, "Three flights under");
};

// The menu's answer is the row chosen, so nothing waits for it here.
const showChatMenu = (drive: Drive) =>
  drive.chrome.evaluate(async () => {
    const { chats } = await window.chromeAPI.library.getLibrary();
    void window.chromeAPI.chat.showMenu(chats[0].id, { x: 120, y: 160, width: 24, height: 24 });
  });

const menuShows = async (drive: Drive, timeout?: number) => {
  const menu = await findView(drive.app, "view=menu");
  await menu.locator('[role=menu]:not([aria-hidden="true"]), [role=alertdialog]').filter({ visible: true }).first().waitFor({ timeout });
};

const saved = (result: { ok: true; id: string } | { ok: false; error: string }): string => {
  if (!result.ok) throw new Error(result.error);
  return result.id;
};

// A routine saved through the app, as the steps would save it.
const saveRoutine = async (drive: Drive) =>
  saved(
    await drive.chrome.evaluate(() =>
      window.chromeAPI.routines.save(null, { name: "Morning stories", instructions: "Read the news page and list five stories worth my time.", schedule: { kind: "daily", time: "08:15" } })
    )
  );

// A mascot of the user's own, with limits.
const saveScout = async (drive: Drive) =>
  saved(
    await drive.chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "kingfisher", accessory: "crown" },
        instructions: "Find the cheapest one that's in stock.",
        sites: ["shop.example"],
        tools: ["visit", "click"],
      })
    )
  );

const makingStep = async (drive: Drive, steps: number) => {
  const { chrome } = drive;
  await openPage(drive, "flock", "new");
  await seen(chrome, "1 / 4");
  if (steps < 2) return;
  await chrome.getByRole("button", { name: "Lingon" }).click();
  await chrome.getByRole("button", { name: "Crown" }).click();
  await chrome.getByRole("button", { name: "Continue" }).click();
  await heading(chrome, "What’s my name?");
  if (steps < 3) return;
  await chrome.getByRole("textbox", { name: "Name" }).fill("Scout");
  await chrome.getByRole("textbox", { name: "Name" }).press("Enter");
  await heading(chrome, "What should I do for you?");
  if (steps < 4) return;
  await chrome.getByRole("textbox", { name: "What it’s for" }).fill("Find the cheapest cable that's in stock.");
  await chrome.getByRole("button", { name: "Continue" }).click();
  await chrome.getByRole("radio", { name: "Only these sites" }).waitFor();
  if (steps < 5) return;
  await chrome.getByRole("radio", { name: "Only these sites" }).click();
  await chrome.getByRole("button", { name: "Add a site" }).click();
  await chrome.getByRole("textbox", { name: "Add a site" }).fill("shop.example");
  await chrome.getByRole("textbox", { name: "Add a site" }).press("Enter");
  await chrome.getByRole("button", { name: "Add Scout" }).click();
  await chrome.getByRole("region", { name: "Scout is added" }).waitFor();
};

const routineStep = async (drive: Drive, steps: number) => {
  const { chrome } = drive;
  await openPage(drive, "routines", "new");
  await chrome.getByRole("textbox", { name: "What should I do?" }).waitFor();
  if (steps < 2) return;
  await chrome.getByRole("textbox", { name: "What should I do?" }).fill("Check the prices of USB-C cables");
  await chrome.getByRole("button", { name: "Continue" }).click();
  await chrome.getByRole("radio", { name: "Weekly" }).waitFor();
  if (steps < 3) return;
  await chrome.getByRole("radio", { name: "Every day" }).click();
  await chrome.getByRole("button", { name: "Continue" }).click();
  await chrome.getByRole("radiogroup", { name: "Who does it" }).waitFor();
  if (steps < 4) return;
  await chrome.getByRole("button", { name: "Continue" }).click();
  await chrome.getByRole("radiogroup", { name: "Where it may go" }).waitFor();
};

const ACCOUNT = { email: "alex@example.com", password: "correct horse battery" };

// The account menu's button: a person with a server, Settings and more without one, in the sidebar or the toolbar.
const openAccountMenu = async (drive: Drive) => {
  await drive.chrome.getByRole("button", { name: /^(Settings and more|Account, )/ }).first().click();
  const where = drive.look.layout === "horizontal" ? await findView(drive.app, "view=overlay") : drive.chrome;
  await where.getByRole("dialog", { name: "Account" }).waitFor();
};

const desktopOn = async (drive: Drive) => {
  await drive.chrome.evaluate(() => window.chromeAPI.settings.updateSettings({ desktopBerry: true }));
  const desktop = await findView(drive.app, "view=desktop");
  await desktop.locator('[data-desktop-drop][data-mood="rest"]').waitFor();
  return desktop;
};

// A job on the cloud runner that has stopped to ask, as the phone page finds it after signing in.
const SCOUT: MascotProfile = {
  id: "m-scout",
  name: "Scout",
  look: { palette: "robin", accessory: "cap" },
  instructions: "Find the cheapest one that fits.",
  sites: ["shop.example"],
  tools: ["visit", "click", "type"],
  deletedAt: null,
};
const PROMPT = "Find the cheapest USB-C cable on shop.example and put it in my cart";

const jobOnRunner = async (phone: PhoneDrive, end: "asks" | "done") => {
  await phone.owner("sync_cloud_flock", { p_birds: flockRows([SCOUT]) });
  const job = await phone.owner("start_cloud_job", { p_prompt: PROMPT, p_history: [], p_mascot: mascotSnapshot(SCOUT), p_action_approval: "risky", p_context_id: "ctx-ana" });
  await phone.runner("runner_claim_job");
  const steps = [{ text: "Opened shop.example", done: true, kind: "open" }, { text: "Compared 14 cables by price", done: true, kind: "read" }];
  await phone.runner("runner_update_job", { p_job: job, p_steps: steps, p_live_view: LIVE });
  if (end === "asks") await phone.runner("runner_ask", { p_job: job, p_kind: "approval", p_text: "Click the button “Place order” on https://shop.example/cart" });
  else await phone.runner("runner_update_job", { p_job: job, p_status: "done", p_steps: steps, p_reply: "The cheapest is a 1 m cable for 49 kr. It's in your cart." });
  await phone.settleTimes();
};

// Every section of Settings and every page one step in, by the place in the tab's param.
const SETTINGS_PLACES = [...SETTINGS_SECTIONS, ...Object.keys(SETTINGS_PAGES)];

export const FEATURES: Feature[] = [
  {
    name: "new-tab",
    design: "New tab",
    layouts: "both",
    states: {
      empty: { open: (drive) => heading(drive.chrome, /Where to/) },
      "first-jobs": {
        needs: { settings: { firstJobs: ["try", "meet"] } },
        open: (drive) => drive.chrome.getByRole("region", { name: "First jobs" }).waitFor(),
      },
      // History brought in from another browser, and what the cheap model proposes from it once checked.
      suggestions: {
        needs: {
          profile: (dir, now) => writeBrowserHistory(join(dir, "browsers"), habitVisits(now)),
          env: (dir) => ({ BLUEBERRY_BROWSER_DATA: join(dir, "browsers") }),
          model: (model) => model.suggestFrom(habitProposals),
        },
        open: async (drive) => {
          await drive.chrome.evaluate(async () => {
            const [chrome] = await window.chromeAPI.browser.importSources();
            await window.chromeAPI.browser.importHistory(chrome.id);
            await window.chromeAPI.browser.createTab();
          });
          await drive.chrome.getByText("Want the morning news picked out by 8:15?").waitFor();
          await drive.chrome.getByText("Shall I check the cable prices again?").waitFor();
        },
      },
      "from-starters": {
        needs: { starters: true },
        open: (drive) => seen(drive.chrome, "Suggestions"),
      },
      "with-chats": {
        open: async (drive) => {
          await someChats(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.browser.createTab());
          await heading(drive.chrome, /Where to/);
        },
      },
    },
  },
  {
    name: "chat",
    design: "Main chat",
    layouts: "both",
    states: {
      thinking: {
        open: async (drive) => {
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable");
          await seen(drive.chrome, "Find the cheapest USB-C cable");
        },
      },
      reply: {
        open: async (drive) => {
          drive.model.replyWith("The cheapest is the **1 m cable** for 49 kr.\n\n- 1 m, 49 kr\n- 2 m, 79 kr\n- 3 m braided, 129 kr");
          await startChat(drive, "Find the cheapest USB-C cable", { title: "Cheapest cable" });
          await seen(drive.chrome, "3 m braided, 129 kr");
        },
      },
      working: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable on shop.example");
          await drive.chrome.getByRole("complementary", { name: /working on/ }).locator("img").first().waitFor();
        },
      },
      approval: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/cart?item=usb-c-1m") } });
          await startChat(drive, "Put the cheapest cable in my cart");
          await approvalCard(drive.chrome);
        },
      },
      question: {
        open: async (drive) => {
          drive.model.callTools({ name: "ask_user", args: { question: "Which length do you want?", answers: ["1 m", "2 m", "3 m"] } });
          await startChat(drive, "Find me a USB-C cable");
          await seen(drive.chrome, "Which length do you want?");
        },
      },
      handoff: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/account") } });
          drive.model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
          await startChat(drive, "Check my orders on shop.example");
          await seen(drive.chrome, "Sign in on shop.example");
        },
      },
      "with-steps": {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.callTools({ name: "read_page", args: {} });
          drive.model.replyWith("The cheapest on shop.example is the 1 m cable, for 49 kr.");
          await startChat(drive, "Find the cheapest USB-C cable on shop.example", { title: "Cheapest cable" });
          await seen(drive.chrome, "for 49 kr.");
          await drive.chrome.getByRole("button", { name: "Save as routine" }).waitFor();
        },
      },
    },
  },
  {
    name: "chat-panel",
    design: "Chat panel",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("shop.example"));
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
          await drive.chrome.getByRole("textbox", { name: /ask|Message/i }).first().waitFor();
        },
      },
      reply: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("shop.example"));
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
          const box = drive.chrome.getByRole("textbox", { name: /ask|Message/i }).first();
          drive.model.replyWith("This page sells USB-C cables. The cheapest is 1 m for 49 kr.");
          await box.fill("What's the cheapest here?");
          await box.press("Enter");
          await seen(drive.chrome, "The cheapest is 1 m for 49 kr.");
        },
      },
    },
  },
  {
    name: "sidebar",
    design: "Sidebar",
    layouts: "vertical",
    states: {
      tabs: { open: threeTabs },
      chats: {
        open: async (drive) => {
          await someChats(drive);
          await drive.chrome.getByRole("tab", { name: /^Chats/ }).click();
          await drive.chrome.getByRole("tabpanel", { name: "Chats" }).getByText("Lisbon weekend").waitFor();
        },
      },
      collapsed: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
          await drive.chrome.getByRole("navigation", { name: "Sidebar" }).waitFor({ state: "detached" });
        },
      },
      floating: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleSidebar());
          await drive.chrome.evaluate(() => window.chromeAPI.layout.showFloatingSidebar());
          const overlay = await findView(drive.app, "view=overlay");
          await overlay.getByRole("navigation", { name: "Sidebar" }).waitFor();
        },
      },
    },
  },
  {
    name: "tab-row",
    design: "Horizontal layout",
    layouts: "horizontal",
    states: {
      tabs: { open: threeTabs },
    },
  },
  {
    name: "account-menu",
    design: "The account menu",
    layouts: "both",
    states: {
      "no-server": { open: openAccountMenu },
      "signed-in": {
        needs: { supabase: true },
        open: async (drive) => {
          await drive.supabase!.addAccount(ACCOUNT.email, ACCOUNT.password);
          await drive.chrome.evaluate(({ email, password }) => window.chromeAPI.account.signIn(email, password), ACCOUNT);
          await drive.chrome.getByRole("button", { name: `Account, ${ACCOUNT.email}` }).waitFor();
          await openAccountMenu(drive);
        },
      },
    },
  },
  {
    name: "site-permission",
    design: "11. Not redrawn yet",
    layouts: "both",
    states: {
      notifications: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("alerts.example", "/notify"));
          const prompt = await findView(drive.app, "view=prompt");
          await prompt.getByRole("button", { name: "Allow", exact: true }).waitFor();
        },
      },
    },
  },
  {
    name: "address-field",
    design: "Toolbar and the address field",
    layouts: "both",
    states: {
      page: { open: (drive) => createTab(drive, drive.site.url("shop.example")).then(() => undefined) },
      suggestions: {
        open: async (drive) => {
          await threeTabs(drive);
          await drive.chrome.getByRole("button", { name: "Address" }).click();
          await drive.chrome.getByRole("textbox", { name: "Address" }).pressSequentially("lis");
          const list = await findView(drive.app, "view=suggestions");
          await list.getByRole("option").first().waitFor();
          await list.getByRole("option").last().getByText(/Ask Berry/).waitFor();
        },
      },
    },
  },
  {
    name: "tab-preview",
    design: "8. Component states",
    layouts: "both",
    states: {
      card: {
        open: async (drive) => {
          await threeTabs(drive);
          const tab = drive.chrome.getByRole("list", { name: "Tabs", exact: true }).getByRole("button", { name: "Lisbon fares", exact: true });
          await tab.hover();
          const preview = await findView(drive.app, "view=preview");
          await preview.locator("[data-tab-preview]").getByText("Lisbon fares").waitFor();
          await preview.locator("[data-tab-preview] img").first().waitFor();
        },
      },
    },
  },
  {
    name: "find-bar",
    design: "11. Not redrawn yet",
    layouts: "both",
    states: {
      matches: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("birds.example", "/birds"));
          await drive.app.evaluate(({ Menu }) => {
            const search = (items: Electron.MenuItem[]): Electron.MenuItem | undefined =>
              items.flatMap((item) => (item.submenu ? [search(item.submenu.items)] : item.label === "Find…" ? [item] : []))[0];
            (Menu.getApplicationMenu()?.items ?? []).map((top) => search(top.submenu?.items ?? [])).find(Boolean)?.click();
          });
          const find = await findView(drive.app, "view=find");
          await find.getByRole("textbox", { name: "Find in page" }).fill("jackdaw");
          await find.getByText("1 of 3").waitFor();
        },
      },
    },
  },
  {
    name: "menus",
    design: "8. Component states",
    layouts: "both",
    states: {
      "app-menu": {
        open: async (drive) => {
          await drive.chrome.evaluate(() => window.chromeAPI.layout.showAppMenu());
          await menuShows(drive);
        },
      },
      "chat-menu": {
        open: async (drive) => {
          await someChats(drive);
          if (drive.look.layout === "vertical") await drive.chrome.getByRole("tab", { name: /^Chats/ }).click();
          await showChatMenu(drive);
          await menuShows(drive);
        },
      },
      "choose-mascot": {
        open: async (drive) => {
          await drive.chrome.getByRole("button", { name: /^Asking Berry/ }).click();
          await drive.chrome.getByRole("menu", { name: "Choose who to ask" }).waitFor();
        },
      },
      "asking-first": {
        open: async (drive) => {
          await someChats(drive);
          await showChatMenu(drive);
          await menuShows(drive);
          await chooseFromMenu(drive.app, "Delete…");
          const menu = await findView(drive.app, "view=menu");
          await menu.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).waitFor();
        },
      },
      "page-menu": {
        open: async (drive) => {
          const page = await createTab(drive, drive.site.url("shop.example"));
          // A right-click as the page is still settling in can be lost, so it's tried again, as a person would.
          for (let tries = 0; ; tries++) {
            await page.mouse.click(300, 300, { button: "right" });
            const shown = await menuShows(drive, 2_000).then(() => true, () => false);
            if (shown) break;
            if (tries === 3) throw new Error("The page's menu didn't open");
          }
        },
      },
    },
    needs: { starters: true },
  },
  {
    name: "settings",
    design: "Settings",
    layouts: "both",
    states: Object.fromEntries(
      SETTINGS_PLACES.map((place) => [
        place,
        {
          open: async (drive: Drive) => {
            await openPage(drive, "settings", place);
            // A section has the sections' tabs, and a page one step in has its way back instead.
            await drive.chrome.getByRole("tab", { name: "General" }).or(drive.chrome.getByRole("button", { name: /^Back to / })).first().waitFor();
          },
        },
      ])
    ),
  },
  {
    name: "mascots",
    design: "Your mascots",
    layouts: "both",
    needs: { starters: true },
    states: {
      list: {
        open: async (drive) => {
          await openPage(drive, "flock");
          await drive.chrome.getByRole("button", { name: "New mascot" }).waitFor();
        },
      },
      mascot: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "flock", scout);
          await heading(drive.chrome, "Scout");
        },
      },
      limits: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "flock", `${scout}/limits`);
          await drive.chrome.getByRole("radio", { name: "Any site" }).waitFor();
        },
      },
      memory: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "flock", `${scout}/memory`);
          await heading(drive.chrome, "What Scout remembers");
        },
      },
      "new-look": { open: (drive) => makingStep(drive, 1) },
      "new-name": { open: (drive) => makingStep(drive, 2) },
      "new-purpose": { open: (drive) => makingStep(drive, 3) },
      "new-limits": { open: (drive) => makingStep(drive, 4) },
      added: { open: (drive) => makingStep(drive, 5) },
    },
  },
  {
    name: "gallery",
    design: "Gallery",
    layouts: "both",
    states: {
      all: {
        open: async (drive) => {
          await openPage(drive, "mascot-gallery");
          await drive.chrome.getByRole("region", { name: "From Blueberry" }).getByRole("button").first().waitFor();
        },
      },
      mascot: {
        open: async (drive) => {
          await openPage(drive, "mascot-gallery", "meeting-prep");
          await drive.chrome.getByRole("article", { name: "Meeting Prep" }).getByRole("region", { name: "An example" }).waitFor();
        },
      },
    },
  },
  {
    name: "routines",
    design: "Routines",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await openPage(drive, "routines");
          await seen(drive.chrome, /A routine is a job I do again by myself/);
        },
      },
      list: {
        open: async (drive) => {
          await saveRoutine(drive);
          await openPage(drive, "routines", "list");
          await seen(drive.chrome, "Morning stories");
        },
      },
      routine: {
        open: async (drive) => {
          const routine = await saveRoutine(drive);
          await openPage(drive, "routines", routine);
          await heading(drive.chrome, "Morning stories");
        },
      },
      "new-does": { open: (drive) => routineStep(drive, 1) },
      "new-when": { open: (drive) => routineStep(drive, 2) },
      "new-who": { open: (drive) => routineStep(drive, 3) },
      "new-where": { open: (drive) => routineStep(drive, 4) },
    },
  },
  {
    name: "show-berry-how",
    design: "Show Berry how",
    layouts: "both",
    states: {
      watching: {
        open: async (drive) => {
          await openPage(drive, "routines");
          await drive.chrome.getByRole("button", { name: "Show Berry how" }).click();
          await heading(drive.chrome, "Show me how.");
        },
      },
      steps: {
        open: async (drive) => {
          await openPage(drive, "routines");
          await drive.chrome.getByRole("button", { name: "Show Berry how" }).click();
          const start = drive.chrome.getByRole("textbox", { name: "Where does it start?" });
          await start.fill(drive.site.url("shop.example"));
          await start.press("Enter");
          await findView(drive.app, drive.site.url("shop.example"));
          await drive.chrome.waitForFunction(async () => (await window.chromeAPI.recording.state()).steps.length > 0);
          await drive.chrome.waitForTimeout(300);
        },
      },
    },
  },
  {
    name: "history",
    design: "History",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await openPage(drive, "history");
          await heading(drive.chrome, "History");
        },
      },
      visits: {
        open: async (drive) => {
          await threeTabs(drive);
          await openPage(drive, "history");
          await seen(drive.chrome, "Morning News");
        },
      },
    },
  },
  {
    name: "downloads",
    design: "Downloads",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await openPage(drive, "downloads");
          await heading(drive.chrome, "Downloads");
        },
      },
      one: {
        open: async (drive) => {
          await drive.chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), drive.site.url("shop.example", "/report.pdf"));
          await drive.chrome.waitForFunction(async () => (await window.chromeAPI.downloads.list()).some((item) => item.state === "completed"));
          await openPage(drive, "downloads");
          await seen(drive.chrome, "report.pdf");
        },
      },
    },
  },
  {
    name: "needs-you",
    design: "Needs you",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await openPage(drive, "needs-you");
          await heading(drive.chrome, "Needs you");
        },
      },
      approval: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/cart?item=usb-c-1m") } });
          await startChat(drive, "Put the cheapest cable in my cart", { title: "Cable in the cart" });
          await approvalCard(drive.chrome);
          await openPage(drive, "needs-you");
          await approvalCard(drive.chrome);
        },
      },
      handoff: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/account") } });
          drive.model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
          await startChat(drive, "Check my orders on shop.example", { title: "My orders" });
          await seen(drive.chrome, "Sign in on shop.example");
          await openPage(drive, "needs-you");
          await drive.chrome.getByRole("region", { name: "Berry needs you" }).waitFor();
        },
      },
    },
  },
  {
    name: "first-run",
    design: "First run",
    layouts: "none",
    needs: { firstRun: true },
    states: {
      meet: { open: (drive) => heading(drive.chrome, "Hi, I’m Berry.") },
      yours: {
        open: async (drive) => {
          await drive.chrome.getByRole("button", { name: "Get started" }).click();
          await heading(drive.chrome, "Make it yours.");
        },
      },
      brain: {
        open: async (drive) => {
          await drive.chrome.getByRole("button", { name: "Get started" }).click();
          await drive.chrome.getByRole("button", { name: "Continue" }).click();
          await heading(drive.chrome, "Give me a brain.");
        },
      },
      // The steps passed so far are kept in Settings, so the first run starts again at the next one.
      see: {
        needs: { settings: { firstRun: ["meet", "yours", "brain"] } },
        open: (drive) => heading(drive.chrome, "What I can see."),
      },
      // Only with a server to make an account on.
      account: {
        needs: { supabase: true },
        open: async (drive) => {
          await drive.chrome.getByRole("button", { name: "Get started" }).click();
          await heading(drive.chrome, "First, who are you?");
        },
      },
    },
  },
  {
    name: "component-gallery",
    design: "8. Component states",
    layouts: "none",
    states: {
      top: {
        open: async (drive) => {
          await openPage(drive, "gallery");
          await drive.chrome.waitForTimeout(500);
        },
      },
    },
  },
  {
    name: "mascot-on-page",
    design: "Over a web page",
    layouts: "both",
    states: {
      working: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.callTools({ name: "list_elements", args: {} });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable on shop.example");
          await drive.chrome.getByRole("complementary", { name: /working on/ }).locator("img").first().waitFor();
          await switchTo(drive, (tab) => tab.url === drive.site.url("shop.example"));
          await drive.app.evaluate(async ({ webContents }) => {
            for (let tries = 0; tries < 40; tries++) {
              const page = webContents.getAllWebContents().find((contents) => contents.getURL() === "http://shop.example/");
              if (await page?.executeJavaScriptInIsolatedWorld(1000, [{ code: "!!globalThis.__berryActor" }], true)) return;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          });
        },
      },
    },
  },
  {
    name: "desktop-mascot",
    design: "On your desktop",
    layouts: "none",
    window: "desktop",
    states: {
      rest: { open: (drive) => desktopOn(drive).then(() => undefined) },
      composer: {
        window: "composer",
        open: async (drive) => {
          await desktopOn(drive);
          await drive.app.evaluate(() => (globalThis as unknown as { fakeShortcuts: Map<string, () => void> }).fakeShortcuts.get("Alt+Space")?.());
          const composer = await findView(drive.app, "view=composer");
          await composer.getByRole("textbox").first().waitFor();
        },
      },
    },
  },
  {
    name: "cloud-tab",
    design: "11. Not redrawn yet",
    layouts: "both",
    needs: { cloudBrowser: true },
    states: {
      page: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.replyWith("It's open on shop.example");
          const chatId = await startChat(drive, "Open shop.example", { cloud: true });
          await drive.chrome.waitForFunction(async (id) => (await window.chromeAPI.library.getChat(id))?.messages.at(-1)?.content === "It's open on shop.example", chatId, { timeout: 30_000 });
          await switchTo(drive, (tab) => tab.page === "cloud");
          await seen(drive.chrome, "In the cloud");
          await drive.chrome.locator("img").last().waitFor();
        },
      },
    },
  },
  {
    name: "phone",
    design: "On the phone",
    surface: "phone",
    layouts: "none",
    states: {
      "sign-in": { open: async () => {} },
      approval: {
        open: async (phone) => {
          await jobOnRunner(phone, "asks");
          await phone.signIn();
          await phone.page.getByRole("dialog", { name: /Scout wants to click the button “Place order”/ }).waitFor();
        },
      },
      home: {
        open: async (phone) => {
          await jobOnRunner(phone, "asks");
          await phone.signIn();
          await phone.page.getByRole("dialog", { name: /Scout wants to click/ }).waitFor();
          await phone.page.keyboard.press("Escape");
          await phone.page.getByRole("button", { name: /Scout wants to click/ }).waitFor();
        },
      },
      reply: {
        open: async (phone) => {
          await jobOnRunner(phone, "done");
          await phone.signIn();
          await phone.page.getByRole("link", { name: new RegExp(PROMPT) }).click();
          await phone.page.getByText("It's in your cart.").waitFor();
        },
      },
    },
  },
];

export const featureNamed = (name: string): Feature | undefined => FEATURES.find((feature) => feature.name === name);

// The layouts a feature is pictured in by `baseline`.
export const layoutsOf = (feature: Feature): LayoutMode[] => (feature.layouts === "both" ? ["vertical", "horizontal"] : feature.layouts === "none" ? ["vertical"] : [feature.layouts]);
