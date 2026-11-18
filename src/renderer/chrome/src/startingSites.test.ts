import { describe, expect, it } from "vitest";
import type { Visit } from "@shared/ipc";
import { startingSites } from "./startingSites";

const pin = (url: string) => ({ id: url, title: url, url });
const visit = (url: string): Visit => ({ url, title: url, favicon: null, visitedAt: 0 });
const sites = (found: ReturnType<typeof startingSites>) => found.map(({ site }) => site);

describe("startingSites", () => {
  it("is empty with nothing pinned or visited", () => {
    expect(startingSites([], [])).toEqual([]);
  });

  it("puts pinned sites first, as saved, then the most visited, at most three", () => {
    const found = startingSites(
      [pin("https://www.klm.com/trips")],
      [visit("https://github.com/a"), visit("https://prisjakt.nu/x?q=1"), visit("https://prisjakt.nu/y"), visit("https://news.example/")],
    );
    expect(sites(found)).toEqual(["klm.com", "prisjakt.nu", "github.com"]);
    expect(found[0].url).toBe("https://www.klm.com/trips");
    // A visit's own address can carry anything, so it's the site's front page.
    expect(found[1].url).toBe("https://prisjakt.nu/");
  });

  it("goes by site, once each, and leaves out anything that isn't a web page", () => {
    const found = startingSites(
      [pin("https://klm.com/"), pin("https://www.klm.com/other"), pin("file:///etc/hosts")],
      [visit("https://www.klm.com/"), visit("chrome://settings"), visit("not an address"), visit("http://127.0.0.1:3000/shop")],
    );
    expect(sites(found)).toEqual(["klm.com", "127.0.0.1"]);
    expect(found[1].url).toBe("http://127.0.0.1:3000/");
  });

  it("breaks a tie for the site visited last", () => {
    expect(sites(startingSites([], [visit("https://b.example/"), visit("https://a.example/")], 1))).toEqual(["b.example"]);
  });
});
