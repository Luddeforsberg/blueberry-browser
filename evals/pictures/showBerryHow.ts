import type { Page } from "@playwright/test";
import { findView } from "../../tests/app";
import type { Founder } from "./founderApp";
import { openPage, until } from "./jobs";

// Show Berry how, done once by hand: the founder's Monday look at competitors' prices, with real clicks on the real pages,
// as Playwright sends them through the tab's own input. Nothing is copied, so the clipboard on this computer is never
// touched.

const recorded = (founder: Founder) => founder.chrome.evaluate(() => window.chromeAPI.recording.state().then(({ steps }) => steps.length));

// Not every click is a note, such as one on a control already chosen, so a step that never comes is said and passed.
const settled = async (founder: Founder, page: Page, count: number) => {
  await page.waitForLoadState("load");
  await until(`step ${count}`, async () => (await recorded(founder)) >= count, 8_000).catch((error: unknown) => console.log(String(error)));
};

const inNewTab = async (founder: Founder, url: string): Promise<Page> => {
  await founder.chrome.evaluate((address) => window.chromeAPI.browser.createTab(address), url);
  const page = await findView(founder.app, new URL(url).hostname);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_500);
  return page;
};

export async function showBerryHow(founder: Founder): Promise<void> {
  const { chrome } = founder;
  await openPage(founder, "routines");
  await chrome.getByRole("button", { name: "Show Berry how" }).click();
  const start = chrome.getByRole("textbox", { name: "Where does it start?" });
  await start.fill("https://jane.app/pricing");
  await start.press("Enter");
  const jane = await findView(founder.app, "jane.app/pricing");
  await settled(founder, jane, 1);
  await jane.getByRole("link", { name: "Core features" }).nth(1).click();
  await settled(founder, jane, 2);

  const cliniko = await inNewTab(founder, "https://www.cliniko.com/pricing/");
  await settled(founder, cliniko, 3);
  await cliniko.getByRole("link", { name: /26 to 200 practitioners/ }).click();
  await settled(founder, cliniko, 4);

  const calendly = await inNewTab(founder, "https://calendly.com/pricing");
  await settled(founder, calendly, 5);
  await calendly.getByText("Add Notetaker & Callie", { exact: true }).nth(1).click();
  await settled(founder, calendly, 6);

  await chrome.getByRole("status").filter({ hasText: "Watching" }).getByRole("button", { name: "Done" }).click();
  await chrome.getByRole("heading", { name: "What I watched" }).waitFor();
}
