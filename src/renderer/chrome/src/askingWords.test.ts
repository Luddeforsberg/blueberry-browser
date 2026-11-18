import { describe, expect, it } from "vitest";
import { ASK_REASONS } from "@shared/asking";
import { REASON_WORDS, whyWords } from "./askingWords";

describe("why a card asks, in words", () => {
  it.each(ASK_REASONS)("has a sentence for %s", (reason) => {
    expect(whyWords({ reason })).toMatch(/^Asking because [a-z].+[^.]\.$/);
    expect(whyWords({ reason })).not.toContain("marked");
  });

  it('says "marked above" only for a mark it can point to', () => {
    expect(whyWords({ reason: "carries-data", mark: "?from=inbox0" })).toBe("Asking because this could carry data, marked above.");
    expect(whyWords({ reason: "carries-data" })).toBe("Asking because this could carry data.");
    expect(whyWords({ reason: "risky-word", mark: "Delete" })).toBe("Asking because of the word marked above.");
    expect(whyWords({ reason: "risky-word" })).toBe("Asking because this control’s name says it changes or sends something.");
    // A reason whose rule never marks anything says nothing about a mark, whatever comes with it.
    expect(whyWords({ reason: "always-ask", mark: "x" })).toBe("Asking because you’ve set me to ask before everything.");
  });

  it("has words for no code the tool layer doesn’t have", () => {
    expect(Object.keys(REASON_WORDS).sort()).toEqual([...ASK_REASONS].sort());
  });
});
