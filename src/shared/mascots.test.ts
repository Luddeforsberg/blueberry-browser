import { describe, expect, it } from "vitest";
import type { MascotPalette } from "./library";
import { narrowSites, NOWHERE, PALETTES, parseMascotDraft, permissionsInWords, serverPalette, siteAllowed } from "./mascots";

const words = (sites: string[], tools: ("visit" | "click" | "type")[]) => permissionsInWords({ sites, tools }).map(({ text }) => text);

describe("permissionsInWords", () => {
  it.each([
    [[], ["visit", "click", "type"], ["Can search the web and go anywhere", "Can click and type"]],
    [[], ["visit"], ["Can search the web and go anywhere", "Can’t type or click"]],
    [[], [], ["Reads any page you have open", "Can’t open pages by itself", "Can’t type or click"]],
    [["hemnet.se"], ["visit"], ["Only visits hemnet.se", "Can’t type or click"]],
    [
      ["hemnet.se", "booli.se"],
      ["visit", "click"],
      ["Only visits hemnet.se and booli.se", "Can click, but can’t type"],
    ],
    [
      ["a.se", "b.se", "c.se"],
      ["visit", "type"],
      ["Only visits a.se, b.se and c.se", "Can type, but can’t click"],
    ],
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

// Each palette's id before the ids were the berries' names, and the berry it was drawn as then.
const OLD_IDS = {
  kingfisher: "blueberry",
  robin: "lingon",
  canary: "cloudberry",
  parakeet: "gooseberry",
  flamingo: "raspberry",
  jackdaw: "currant",
};

describe("a look's palette", () => {
  const lookOf = (palette: unknown) => {
    const parsed = parseMascotDraft({ name: "Scout", look: { palette, accessory: "cap" }, instructions: "Read.", sites: [], tools: [] });
    return "error" in parsed ? parsed.error : parsed.draft.look;
  };

  it("reads an old id as the berry it was drawn as, and a new id as it is", () => {
    for (const [old, berry] of Object.entries(OLD_IDS)) {
      expect(lookOf(old)).toEqual({ palette: berry, accessory: "cap" });
      expect(lookOf(berry)).toEqual({ palette: berry, accessory: "cap" });
    }
    expect(PALETTES.map(({ id }) => id)).toEqual(Object.values(OLD_IDS));
  });

  it("refuses anything else", () => {
    for (const palette of ["", "Robin", "red", "toString", null, 3]) expect(lookOf(palette)).toBe("Choose a look.");
  });

  it("goes to the server under its old id, which today's server and phone page check for", () => {
    for (const [old, berry] of Object.entries(OLD_IDS)) expect(serverPalette(berry as MascotPalette)).toBe(old);
  });
});
