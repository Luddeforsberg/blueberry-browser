// The steps a normal browser uses, as percentages.
export const ZOOM_LEVELS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export type SiteZoomLevels = Record<string, number>;

// Pages with no host, such as local files, share one level per scheme.
export const siteKey = (url: string): string | null => {
  try {
    const { hostname, protocol } = new URL(url);
    return hostname || protocol;
  } catch {
    return null;
  }
};

export const zoomPercent = (levels: SiteZoomLevels, url: string): number => {
  const key = siteKey(url);
  return key !== null && Object.hasOwn(levels, key) ? levels[key] : 100;
};

export const nextZoom = (percent: number, direction: 1 | -1): number => {
  const next =
    direction === 1
      ? ZOOM_LEVELS.find((level) => level > percent)
      : ZOOM_LEVELS.findLast((level) => level < percent);
  return next ?? percent;
};

// A site at 100% isn't stored, so resetting one removes it.
export const sanitizeSiteZoom = (raw: unknown, fallback: SiteZoomLevels = {}): SiteZoomLevels => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  return Object.fromEntries(
    Object.entries(raw).filter(([, percent]) => percent !== 100 && ZOOM_LEVELS.includes(percent))
  );
};

interface ZoomTab {
  url: string;
  webContents: {
    setZoomFactor: (factor: number) => void;
    on: (event: "did-navigate", listener: (event: unknown, url: string) => void) => unknown;
  };
}

export class SiteZoom {
  constructor(
    private readonly store: {
      levels: () => SiteZoomLevels;
      save: (levels: SiteZoomLevels) => void;
      tabs: () => ZoomTab[];
    }
  ) {}

  percent(url: string): number {
    return zoomPercent(this.store.levels(), url);
  }

  track(tab: ZoomTab): void {
    tab.webContents.on("did-navigate", (_, url) => tab.webContents.setZoomFactor(this.percent(url) / 100));
  }

  step(tab: ZoomTab, direction: 1 | -1): void {
    this.set(tab, nextZoom(this.percent(tab.url), direction));
  }

  reset(tab: ZoomTab): void {
    this.set(tab, 100);
  }

  private set(tab: ZoomTab, percent: number): void {
    const key = siteKey(tab.url);
    if (key === null) return;
    this.store.save(sanitizeSiteZoom({ ...this.store.levels(), [key]: percent }));
    this.store
      .tabs()
      .filter((open) => siteKey(open.url) === key)
      .forEach((open) => open.webContents.setZoomFactor(percent / 100));
  }
}
