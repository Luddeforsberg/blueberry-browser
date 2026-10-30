import { describe, expect, it } from "vitest";
import { toUrl } from "./url";

describe("toUrl", () => {
  it("keeps full web addresses", () => {
    expect(toUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(toUrl("HTTP://example.com")).toBe("HTTP://example.com");
  });

  it("adds https to something that looks like a domain", () => {
    expect(toUrl("  wikipedia.org/wiki/Jackdaw ")).toBe("https://wikipedia.org/wiki/Jackdaw");
  });

  it("searches for anything else", () => {
    expect(toUrl("jackdaw facts")).toBe("https://www.google.com/search?q=jackdaw%20facts");
    expect(toUrl("node.js vs deno")).toBe("https://www.google.com/search?q=node.js%20vs%20deno");
  });
});
