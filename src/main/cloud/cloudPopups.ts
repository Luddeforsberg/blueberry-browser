import type { BrowserContext, Page, Request, Route } from "playwright-core";
import type { CdpTab } from "../tools/CdpTab";

// How long a popup gets to say where it's going before it's closed.
const POPUP_URL_MS = 2_000;

export interface PopupRules {
  // Pages made by us, rather than opened by a page.
  ours: (page: Page) => boolean;
  // Our own page being made, which isn't ours until it's done.
  opening: () => Promise<unknown>;
  // The tabs of the job working there now, whose limits a popup's first navigation is held to.
  jobTabs: () => CdpTab[];
  tabOf: (opener: Page | null) => CdpTab | null;
}

// A popup is a new page nothing here watches. Playwright holds every new page until its routes are on, so its requests
// all come through here. Its first navigation comes before Playwright knows its frame, so it's checked against the job's
// limits like any navigation in its tabs, and refused where they say no. Everything else from a popup is refused, the
// popup is closed, and an address it was going to loads in the tab it came from, under that tab's limits: the same as
// following the link there.
export const closePopups = async (context: BrowserContext, rules: PopupRules): Promise<void> => {
  await context.route("**/*", (route, request) => routeRequest(route, request, rules));
  context.on("page", (page) => void closePopup(page, rules));
};

const routeRequest = (route: Route, request: Request, rules: PopupRules): Promise<void> => {
  let page: Page | null = null;
  try {
    page = request.frame().page();
  } catch {
    // A service worker's, or a navigation in a frame that doesn't exist yet, such as a popup's first.
    const refused = request.isNavigationRequest() && rules.jobTabs().filter((tab) => tab.refuse(request.url())).length > 0;
    return refused ? route.abort("blockedbyclient").catch(() => {}) : route.fallback();
  }
  if (rules.ours(page)) return route.fallback();
  return route.abort("blockedbyclient").catch(() => {});
};

const closePopup = async (page: Page, rules: PopupRules): Promise<void> => {
  // Our own page is ours once `newPage` is done.
  await rules.opening();
  if (rules.ours(page)) return;
  const opener = await page.opener().catch(() => null);
  // Where it was going, if it got that far.
  await page.waitForURL(/^https?:/, { timeout: POPUP_URL_MS }).catch(() => {});
  const url = page.url();
  await page.close().catch(() => {});
  if (!/^https?:/.test(url)) return;
  // Only into the tab that opened it, whichever chat that is. A popup with no opener to find, as from a `noopener` link,
  // loads nowhere, so it can't land in another chat's page.
  await rules
    .tabOf(opener)
    ?.loadURL(url)
    .catch(() => {});
};
