import { describe, expect, it } from "vitest";
import { addressToKeep, replyPointsTo } from "./jobTabs";

describe("replyPointsTo", () => {
  it("is true when the reply names the page's site or address", () => {
    expect(replyPointsTo("It's in your cart on Webhallen.com.", "https://www.webhallen.com/se/cart")).toBe(true);
    expect(replyPointsTo("See https://shop.example.com/item/4", "https://shop.example.com/item/4?ref=x")).toBe(true);
    expect(replyPointsTo("Found it on www.example.com", "https://example.com/a")).toBe(true);
  });

  it("is false when it doesn't, or only names part of the site", () => {
    expect(replyPointsTo("", "https://example.com")).toBe(false);
    expect(replyPointsTo("All done", "https://example.com")).toBe(false);
    expect(replyPointsTo("Found it on example.com", "https://shop.example.com/a")).toBe(false);
    expect(replyPointsTo("Found it on notexample.com", "https://example.com/a")).toBe(false);
    expect(replyPointsTo("Found it on example.co", "https://example.com/a")).toBe(false);
    expect(replyPointsTo("about:blank", "about:blank")).toBe(false);
  });
});

describe("addressToKeep", () => {
  it("keeps a web address whole, and only its site and path after a handoff", () => {
    expect(addressToKeep("https://example.com/a?q=1#x", { handedBack: false, codeTyped: false })).toBe("https://example.com/a?q=1#x");
    expect(addressToKeep("https://example.com/a?token=1#x", { handedBack: true, codeTyped: false })).toBe("https://example.com/a");
  });

  it("keeps nothing a code was typed into, or that isn't a web page", () => {
    expect(addressToKeep("https://example.com/a", { handedBack: false, codeTyped: true })).toBeNull();
    expect(addressToKeep("file:///Users/me/a.html", { handedBack: false, codeTyped: false })).toBeNull();
    expect(addressToKeep("not a url", { handedBack: false, codeTyped: false })).toBeNull();
  });
});
