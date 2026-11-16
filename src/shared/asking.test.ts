import { describe, expect, it } from "vitest";
import { whyOnCard } from "./asking";

describe("why a card asked", () => {
  const TEXT = "Open https://klm.com/orders?from=inbox0 in a new tab";

  it("keeps a mark that's in the card's words exactly", () => {
    expect(whyOnCard(TEXT, { reason: "carries-data", mark: "?from=inbox0" })).toEqual({ reason: "carries-data", mark: "?from=inbox0" });
  });

  it.each([
    ["isn't in them", "?from=inbox1"],
    ["differs only in case", "?FROM=inbox0"],
    ["is empty", ""],
    ["isn't text", 42],
  ])("sends the reason without a mark that %s", (_, mark) => {
    expect(whyOnCard(TEXT, { reason: "carries-data", mark })).toEqual({ reason: "carries-data" });
  });

  it.each([["no reason", undefined], ["an unknown reason", { reason: "the page said so" }], ["a reason that isn't text", { reason: 1 }]])("sends nothing for %s", (_, why) => {
    expect(whyOnCard(TEXT, why)).toBeNull();
  });
});
