import { mascotSnapshot } from "../../../src/main/remoteJobs/cloudJobs";
import type { MascotProfile } from "../../../src/shared/library";
import { sharedMascotRows } from "../../../src/shared/phone";
import { findView } from "../../app";
import type { Drive } from "../driver";
import { LIVE, type PhoneDrive } from "../phone";
import type { Feature } from "../map";
import { seen, tabs, startChat, until } from "./ways";

const switchTo = async (drive: Drive, find: (tab: Awaited<ReturnType<typeof tabs>>[number]) => boolean) => {
  const tab = (await tabs(drive)).find(find);
  if (!tab) throw new Error("No such tab");
  await drive.chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), tab.id);
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
  look: { palette: "lingon", accessory: "cap" },
  instructions: "Find the cheapest one that fits.",
  sites: ["shop.example"],
  tools: ["visit", "click", "type"],
  deletedAt: null,
};
const PROMPT = "Find the cheapest USB-C cable on shop.example and put it in my cart";

const jobOnRunner = async (phone: PhoneDrive, end: "asks" | "done") => {
  await phone.owner("sync_cloud_mascots", { p_mascots: sharedMascotRows([SCOUT]) });
  const job = await phone.owner("start_cloud_job", {
    p_prompt: PROMPT,
    p_history: [],
    p_mascot: mascotSnapshot(SCOUT),
    p_action_approval: "risky",
    p_context_id: "ctx-ana",
  });
  await phone.runner("runner_claim_job");
  const steps = [
    { text: "Opened shop.example", done: true, kind: "open" },
    { text: "Compared 14 cables by price", done: true, kind: "read" },
  ];
  await phone.runner("runner_update_job", { p_job: job, p_steps: steps, p_live_view: LIVE });
  if (end === "asks")
    await phone.runner("runner_ask", {
      p_job: job,
      p_kind: "approval",
      p_text: "Click the button “Place order” on https://shop.example/cart",
    });
  else
    await phone.runner("runner_update_job", {
      p_job: job,
      p_status: "done",
      p_steps: steps,
      p_reply: "The cheapest is a 1 m cable for 49 kr. It's in your cart.",
    });
  await phone.settleTimes();
};

// What shows beyond the browser's own chrome: on a web page, on the desktop, in the cloud and on the phone.
export const outsideFeatures: Feature[] = [
  {
    name: "mascot-on-page",
    design: "Over a web page",
    layouts: "both",
    states: {
      working: {
        open: async (drive) => {
          // Only opening the page: a step after it would show its line or not, by whether the tab was in front yet.
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable on shop.example");
          await drive.chrome
            .getByRole("complementary", { name: /working on/ })
            .locator("img")
            .first()
            .waitFor();
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
          await drive.app.evaluate(() =>
            (globalThis as unknown as { fakeShortcuts: Map<string, () => void> }).fakeShortcuts.get("Alt+Space")?.(),
          );
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
          // Still working, so the job's cloud tab is open.
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Open shop.example", { cloud: true });
          // Loaded, and shown under its chat as the job's.
          await until(
            drive,
            async () =>
              (await window.chromeAPI.browser.getTabs()).some(
                (tab) => tab.page === "cloud" && tab.title === "Cheap Cables" && !!tab.jobChatId,
              ),
            30_000,
          );
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
