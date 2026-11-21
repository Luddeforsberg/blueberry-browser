import type { Visit } from "@shared/ipc";
import type { PinnedSite } from "@shared/library";
import { siteOf } from "@shared/sites";

// A place to begin showing a job, one press from the "Show me how" tab.
export interface StartingSite {
  site: string;
  url: string;
  favicon: string | null;
}

// The user's pinned sites first, as they saved them, then the sites they went to most among their newest visits, at the
// site's front page, since a visit's own address can carry anything. One per site.
export const startingSites = (pinned: PinnedSite[], visits: Visit[], max = 3): StartingSite[] => {
  const sites = new Map<string, StartingSite>();
  pinned.forEach(({ url, favicon }) => {
    const site = siteOf(url);
    if (site && !sites.has(site)) sites.set(site, { site, url, favicon: favicon ?? null });
  });
  // Newest first, so a tie goes to the one visited last.
  const counts = new Map<string, { count: number; visit: Visit }>();
  visits.forEach((visit) => {
    const site = siteOf(visit.url);
    if (!site || sites.has(site)) return;
    const seen = counts.get(site);
    counts.set(site, { count: (seen?.count ?? 0) + 1, visit: seen?.visit ?? visit });
  });
  [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .forEach(([site, { visit }]) => sites.set(site, { site, url: `${new URL(visit.url).origin}/`, favicon: visit.favicon }));
  return [...sites.values()].slice(0, max);
};
