import { findView } from "../../app";
import type { Drive } from "../driver";
import { SETTINGS_PAGES, SETTINGS_SECTIONS } from "../../../src/shared/settingsPlaces";
import type { Feature } from "../map";
import { openPage, seen, heading, threeTabs, startChat, approvalCard, until } from "./ways";

const saved = (result: { ok: true; id: string } | { ok: false; error: string }): string => {
  if (!result.ok) throw new Error(result.error);
  return result.id;
};

// A routine saved through the app, as the steps would save it.
const saveRoutine = async (drive: Drive) =>
  saved(
    await drive.chrome.evaluate(() =>
      window.chromeAPI.routines.save(null, {
        name: "Morning stories",
        instructions: "Read the news page and list five stories worth my time.",
        schedule: { kind: "daily", time: "08:15" },
      }),
    ),
  );

// A mascot of the user's own, with limits.
const saveScout = async (drive: Drive) =>
  saved(
    await drive.chrome.evaluate(() =>
      window.chromeAPI.mascots.save(null, {
        name: "Scout",
        look: { palette: "blueberry", accessory: "crown" },
        instructions: "Find the cheapest one that's in stock.",
        sites: ["shop.example"],
        tools: ["visit", "click"],
      }),
    ),
  );

const makingStep = async (drive: Drive, steps: number) => {
  const { chrome } = drive;
  await openPage(drive, "mascots", "new");
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

// Every section of Settings and every page one step in, by the place in the tab's param.
const SETTINGS_PLACES = [...SETTINGS_SECTIONS, ...Object.keys(SETTINGS_PAGES)];

// The app's own pages, and the first run.
export const pageFeatures: Feature[] = [
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
            await drive.chrome
              .getByRole("tab", { name: "General" })
              .or(drive.chrome.getByRole("button", { name: /^Back to / }))
              .first()
              .waitFor();
          },
        },
      ]),
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
          await openPage(drive, "mascots");
          await drive.chrome.getByRole("button", { name: "New mascot" }).waitFor();
        },
      },
      mascot: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "mascots", scout);
          await heading(drive.chrome, "Scout");
        },
      },
      limits: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "mascots", `${scout}/limits`);
          await drive.chrome.getByRole("radio", { name: "Any site" }).waitFor();
        },
      },
      memory: {
        open: async (drive) => {
          const scout = await saveScout(drive);
          await openPage(drive, "mascots", `${scout}/memory`);
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
          await until(drive, async () => (await window.chromeAPI.recording.state()).steps.length > 0);
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
          await drive.chrome.evaluate(
            (address) => window.chromeAPI.browser.createTab(address),
            drive.site.url("shop.example", "/report.pdf"),
          );
          await until(drive, async () => (await window.chromeAPI.downloads.list()).some((item) => item.state === "completed"));
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
];
