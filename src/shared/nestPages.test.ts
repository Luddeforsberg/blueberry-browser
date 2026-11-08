import { describe, expect, it } from "vitest";
import { checkAddress, cleanTitle, droppedAddress, MAX_ADDRESS_LENGTH, MAX_PAGE_TITLE_LENGTH, pageName } from "./nestPages";

describe("what can go on the board as a link", () => {
  it.each([
    ["a web page", "https://strawberrybrowser.com/pricing", "https://strawberrybrowser.com/pricing"],
    ["plain http", "http://example.com", "http://example.com/"],
    ["a query and a hash", "https://example.com/a?b=1#c", "https://example.com/a?b=1#c"],
    ["spaces around it", "  https://example.com/a  ", "https://example.com/a"],
    ["the longest address", `https://example.com/${"a".repeat(MAX_ADDRESS_LENGTH - 20)}`, `https://example.com/${"a".repeat(MAX_ADDRESS_LENGTH - 20)}`],
  ])("takes %s", (_, given, url) => {
    expect(checkAddress(given)).toEqual({ ok: true, url });
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["a file", "file:///etc/passwd"],
    ["a data address", "data:text/html,<b>hi</b>"],
    ["a blob", "blob:https://example.com/1"],
    ["one past the longest", `https://example.com/${"a".repeat(MAX_ADDRESS_LENGTH - 19)}`],
    ["a name and password", "https://alice:pw@example.com/"],
    ["nothing", ""],
    ["words", "not a link"],
    ["not a string", 42],
  ])("refuses %s", (_, given) => {
    expect(checkAddress(given).ok).toBe(false);
  });
});

describe("what a drag carries", () => {
  it("takes the first address of a list, past its comments", () => {
    expect(droppedAddress({ uriList: "# from Safari\r\nhttps://a.example/x\r\nhttps://b.example/" })).toBe("https://a.example/x");
  });

  it("takes plain text that is one address", () => {
    expect(droppedAddress({ text: " https://a.example/x " })).toBe("https://a.example/x");
  });

  it("takes nothing from words, or from a list with no address", () => {
    expect(droppedAddress({ text: "see https://a.example/x" })).toBeNull();
    expect(droppedAddress({ uriList: "# only a comment", text: "" })).toBeNull();
    expect(droppedAddress({})).toBeNull();
  });
});

describe("a page's name and title", () => {
  it("names a page by its site and path, without the query", () => {
    expect(pageName("https://www.strawberrybrowser.com/pricing/?plan=pro#top")).toBe("strawberrybrowser.com/pricing");
    expect(pageName("https://example.com/")).toBe("example.com");
  });

  it("keeps a title to one cut line with no hidden marks", () => {
    expect(cleanTitle("Pricing\n‮  plans​")).toBe("Pricing plans");
    expect(cleanTitle("a".repeat(MAX_PAGE_TITLE_LENGTH + 1))).toHaveLength(MAX_PAGE_TITLE_LENGTH);
    expect(cleanTitle(undefined)).toBe("");
  });
});
