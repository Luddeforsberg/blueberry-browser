import type { Visit } from "../shared/ipc";

const MAX_VISITS = 20;

// Pages visited in this session, newest first. It stays in memory until local history storage exists.
export class History {
  private visits: Visit[] = [];

  record(url: string, title: string, favicon: string | null, now = Date.now()): void {
    if (!/^https?:/i.test(url)) return;
    const previous = this.visits.find((visit) => visit.url === url);
    this.visits = [
      {
        url,
        title: title || previous?.title || url,
        favicon: favicon ?? previous?.favicon ?? null,
        visitedAt: now,
      },
      ...this.visits.filter((visit) => visit.url !== url),
    ].slice(0, MAX_VISITS);
  }

  // Titles and favicons arrive after the navigation that recorded the visit.
  update(url: string, details: { title?: string; favicon?: string | null }): void {
    this.visits = this.visits.map((visit) =>
      visit.url === url
        ? {
            ...visit,
            title: details.title || visit.title,
            favicon: details.favicon ?? visit.favicon,
          }
        : visit
    );
  }

  recent(): Visit[] {
    return this.visits;
  }
}
