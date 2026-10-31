import { describe, expect, it } from "vitest";
import { nextZoom, sanitizeSiteZoom, SiteZoom, siteKey, zoomPercent, type SiteZoomLevels } from "./siteZoom";

const fakeTab = (url: string) => {
  const listeners: ((event: unknown, url: string) => void)[] = [];
  const factors: number[] = [];
  return {
    url,
    factors,
    navigate: (to: string) => listeners.forEach((listener) => listener(null, to)),
    webContents: {
      setZoomFactor: (factor: number) => factors.push(factor),
      on: (_: string, listener: (event: unknown, url: string) => void) => listeners.push(listener),
    },
  };
};

const zoomWith = (tabs: ReturnType<typeof fakeTab>[], initial: SiteZoomLevels = {}) => {
  let levels = initial;
  const zoom = new SiteZoom({
    levels: () => levels,
    save: (next) => (levels = next),
    tabs: () => tabs,
  });
  return { zoom, levels: () => levels };
};

describe("site zoom levels", () => {
  it("keys pages by host, ignoring the port and path", () => {
    expect(siteKey("https://example.com:8080/a?b=c")).toBe("example.com");
    expect(siteKey("file:///Users/me/a.html")).toBe("file:");
    expect(siteKey("not a url")).toBeNull();
  });

  it("steps to the next level and stops at both ends", () => {
    expect(nextZoom(100, 1)).toBe(110);
    expect(nextZoom(100, -1)).toBe(90);
    expect(nextZoom(25, -1)).toBe(25);
    expect(nextZoom(33, -1)).toBe(25);
    expect(nextZoom(400, 1)).toBe(500);
    expect(nextZoom(500, 1)).toBe(500);
  });

  it("is 100% for a site with no saved level, including names every object inherits", () => {
    expect(zoomPercent({}, "https://example.com/")).toBe(100);
    expect(zoomPercent({}, "https://constructor/")).toBe(100);
    expect(zoomPercent({ "example.com": 150 }, "https://example.com/")).toBe(150);
  });

  it("keeps only real levels from disk or a renderer", () => {
    expect(
      sanitizeSiteZoom({ good: 125, off: 101, full: 100, text: "125", none: null, nan: Number.NaN })
    ).toEqual({ good: 125 });
    expect(sanitizeSiteZoom([125], { kept: 110 })).toEqual({ kept: 110 });
    expect(sanitizeSiteZoom("loud", { kept: 110 })).toEqual({ kept: 110 });
    expect(sanitizeSiteZoom(undefined, { kept: 110 })).toEqual({ kept: 110 });
  });
});

describe("SiteZoom", () => {
  it("zooms every open tab on the site, and leaves other sites alone", () => {
    const one = fakeTab("https://example.com/a");
    const two = fakeTab("https://example.com/b");
    const other = fakeTab("https://other.com/");
    const { zoom, levels } = zoomWith([one, two, other]);

    zoom.step(one, 1);

    expect(levels()).toEqual({ "example.com": 110 });
    expect(one.factors).toEqual([1.1]);
    expect(two.factors).toEqual([1.1]);
    expect(other.factors).toEqual([]);
  });

  it("forgets the site on reset", () => {
    const tab = fakeTab("https://example.com/");
    const { zoom, levels } = zoomWith([tab], { "example.com": 150 });

    zoom.reset(tab);

    expect(levels()).toEqual({});
    expect(tab.factors).toEqual([1]);
  });

  it("applies the saved level when a tab reaches a site, and 100% when it leaves", () => {
    const tab = fakeTab("https://other.com/");
    const { zoom } = zoomWith([tab], { "example.com": 150 });

    zoom.track(tab);
    tab.navigate("https://example.com/");
    tab.navigate("https://other.com/");

    expect(tab.factors).toEqual([1.5, 1]);
  });
});
