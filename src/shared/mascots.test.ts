import { describe, expect, it } from "vitest";
import { narrowSites, NOWHERE, permissionsInWords, siteAllowed } from "./mascots";

const words = (sites: string[], tools: ("visit" | "click" | "type")[]) => permissionsInWords({ sites, tools }).map(({ text }) => text);

describe("permissionsInWords", () => {
  it.each([
    [[], ["visit", "click", "type"], ["Can go anywhere", "Can click and type"]],
    [[], ["visit"], ["Can go anywhere", "Can’t type or click"]],
    [[], [], ["Reads any page you have open", "Can’t open pages by itself", "Can’t type or click"]],
    [["hemnet.se"], ["visit"], ["Only visits hemnet.se", "Can’t type or click"]],
    [["hemnet.se", "booli.se"], ["visit", "click"], ["Only visits hemnet.se and booli.se", "Can click, but can’t type"]],
    [["a.se", "b.se", "c.se"], ["visit", "type"], ["Only visits a.se, b.se and c.se", "Can type, but can’t click"]],
    [["hemnet.se"], ["click", "type"], ["Only reads hemnet.se", "Can’t go to an address by itself", "Can click and type"]],
  ] as const)("says what %j and %j allow", (sites, tools, expected) => {
    expect(words([...sites], [...tools])).toEqual(expected);
  });

  it("marks only what isn't limited as open", () => {
    expect(permissionsInWords({ sites: [], tools: ["visit", "click", "type"] }).map(({ open }) => open)).toEqual([true, true]);
    expect(permissionsInWords({ sites: ["a.se"], tools: ["visit"] }).map(({ open }) => open)).toEqual([false, false]);
  });
});

describe("narrowSites", () => {
  it("only ever takes away", () => {
    expect(narrowSites([], [])).toEqual([]);
    expect(narrowSites([], ["a.example"])).toEqual(["a.example"]);
    expect(narrowSites(["a.example"], [])).toEqual(["a.example"]);
    expect(narrowSites(["a.example"], ["shop.a.example", "b.example"])).toEqual(["shop.a.example"]);
    expect(narrowSites(["shop.a.example"], ["a.example"])).toEqual(["shop.a.example"]);
  });

  it("goes nowhere when the two don't meet, because an empty list would mean anywhere", () => {
    expect(narrowSites(["a.example"], ["b.example"])).toEqual([NOWHERE]);
    expect(siteAllowed("https://a.example/", [NOWHERE])).toBe(false);
  });
});
