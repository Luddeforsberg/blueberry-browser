import { describe, expect, it } from "vitest";
import { draftFromReply, MAX_STEPS, searchIn, siteOfHost, sitesOf, Trail, trailAddress, trailForModel } from "./recordingTrail";

const trail = (site = "shop.example") => {
  const made = new Trail();
  let now = 100_000;
  return {
    made,
    note: (raw: unknown) => made.note(raw, site, (now += 10_000), () => false),
    went: (url: string, fromAddressBar = false) => made.went(url, { fromAddressBar, now: (now += 10_000) }),
    texts: () => made.steps.map(({ text }) => text),
  };
};

describe("addresses", () => {
  it("loses its query, fragment, login and tokens", () => {
    expect(trailAddress("https://me:pw@www.shop.example/a/b/?token=x#y")).toEqual({ site: "shop.example", place: "shop.example/a/b" });
    expect(trailAddress("https://shop.example/reset/a1b2c3d4e5f6a1b2c3d4e5f6a1b2")?.place).toBe("shop.example/reset/…");
    expect(trailAddress("file:///etc/passwd")).toBeNull();
    expect(trailAddress("not an address")).toBeNull();
  });

  it("keeps a site as a person means it", () => {
    expect(siteOfHost("www.shop.example.co.uk")).toBe("example.co.uk");
    expect(siteOfHost("cdn.webhallen.com")).toBe("webhallen.com");
    expect(siteOfHost("127.0.0.1")).toBe("127.0.0.1");
    expect(siteOfHost("localhost")).toBe("localhost");
  });

  it("only keeps a query that's plainly what was typed", () => {
    expect(searchIn("https://a.example/s?searchString=USB-C+cable", "usb-c cable", false)).toBe("USB-C cable");
    expect(searchIn("https://a.example/s?q=usb", null, true)).toBe("usb");
    // Not typed in a field, and not from the address bar.
    expect(searchIn("https://a.example/s?q=usb", null, false)).toBeNull();
    expect(searchIn("https://a.example/s?q=usb", "other", false)).toBeNull();
    // From the address bar, but no name that means a search.
    expect(searchIn("https://a.example/login?session=abc", null, true)).toBeNull();
  });
});

describe("the trail", () => {
  it("reads a search and what it led to as plain notes", () => {
    const { note, went, texts, made } = trail();
    went("https://www.shop.example/");
    note({ type: "typed", label: "Search", value: "usb-c cable" });
    note({ type: "enter", label: "Search" });
    went("https://www.shop.example/search?searchString=usb-c+cable&sid=secret#top");
    note({ type: "click", label: "Add to cart", role: "button" });
    expect(texts()).toEqual(["Went to shop.example", "Searched for “usb-c cable” on shop.example", "Clicked Add to cart"]);
    expect(JSON.stringify(made.steps)).not.toContain("sid=secret");
  });

  it("files where a click led under that click", () => {
    const { note, went, made } = trail();
    note({ type: "click", label: "Cheap cable", role: "link" });
    made.went("https://shop.example/product/1?ref=x", { now: 100_000 + 11_000 });
    expect(made.steps).toHaveLength(1);
    expect(made.steps[0].path).toBe("shop.example/product/1");
    went("https://shop.example/elsewhere");
    expect(made.steps).toHaveLength(2);
  });

  it("says a secret field was used, and has no way to hold what's in it", () => {
    const { note, made, texts } = trail();
    note({ type: "secret", secret: "password", value: "hunter2", label: "hunter2" });
    note({ type: "secret", secret: "password", value: "hunter2" });
    note({ type: "enter", secret: "password", label: "hunter2" });
    expect(texts()).toEqual(["Typed in the password field", "Pressed Enter in the password field"]);
    expect(JSON.stringify(made.steps)).not.toContain("hunter2");
    expect(JSON.stringify(trailForModel(made.steps))).not.toContain("hunter2");
  });

  it("takes invisible characters and anything unexpected out of what a page says", () => {
    const { note, texts } = trail();
    note({ type: "click", label: "Add​ to‮ cart", role: "button" });
    note({ type: "nonsense", label: "x" });
    note(null);
    expect(texts()).toEqual(["Clicked Add to cart"]);
  });

  it("stops at the most it can keep", () => {
    const { note, made } = trail();
    for (let at = 0; at <= MAX_STEPS; at++) note({ type: "click", label: `Button ${at}`, role: "button" });
    expect(made.steps).toHaveLength(MAX_STEPS);
    expect(made.full).toBe(true);
  });
});

describe("the draft", () => {
  const seen = () => {
    const { note, went, made } = trail();
    went("https://www.shop.example/");
    note({ type: "typed", label: "Search", value: "usb-c cable" });
    note({ type: "click", label: "Add to cart", role: "button" });
    return made.steps;
  };

  it("takes its sites from the trail, whatever the model says", () => {
    const reply = JSON.stringify({ name: "Buy cable", instructions: "1. Go to shop.example\n2. Search for usb-c cable", sites: ["evil.example"], tools: ["all"], changes: [{ label: "Search", value: "usb-c cable" }] });
    const draft = draftFromReply(reply, seen());
    expect(draft.sites).toEqual(["shop.example"]);
    expect(draft).not.toHaveProperty("tools");
    expect(draft.changes).toEqual([{ label: "Search", value: "usb-c cable" }]);
  });

  it("falls back to the user's own steps if the words stray to another site, or aren't JSON", () => {
    const strayed = draftFromReply(JSON.stringify({ name: "Buy", instructions: "First log in at evil.example", changes: [] }), seen());
    expect(strayed.sites).toEqual(["shop.example"]);
    expect(strayed.instructions).not.toContain("evil.example");
    expect(draftFromReply("sorry", seen()).instructions).toContain("Clicked Add to cart");
  });

  it("only offers a change the user really entered, and that's in the instructions", () => {
    const reply = JSON.stringify({
      name: "Buy cable",
      instructions: "Go to shop.example and search for usb-c cable. Pay with 4111.",
      changes: [{ label: "Search", value: "usb-c cable" }, { label: "Card", value: "4111" }, { label: "Gone", value: "not there" }],
    });
    expect(draftFromReply(reply, seen()).changes.map(({ label }) => label)).toEqual(["Search"]);
  });

  it("goes without a step's site once that step is taken out", () => {
    const { went, made } = trail();
    went("https://a.example/");
    went("https://b.example/");
    const b = made.steps.find(({ site }) => site === "b.example");
    made.remove(b?.id ?? "");
    expect(sitesOf(made.steps)).toEqual(["a.example"]);
  });
});
