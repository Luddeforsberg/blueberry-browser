import { describe, expect, it } from "vitest";
import {
  capitalized,
  cardName,
  named,
  TITLE_IN_LABEL,
  whose,
} from "./nestNames";

describe("cardName", () => {
  it("names a card by its title, quoted, which reads as a name rather than an owner", () => {
    const name = cardName("14 candidates, 6 strong", "Berry");
    expect(name).toEqual({ text: "“14 candidates, 6 strong”", titled: true });
    expect(whose(name, "answer")).toBe("the “14 candidates, 6 strong” answer");
    expect(named(name)).toBe("“14 candidates, 6 strong”");
  });

  it("falls back to its bird with no title, or an empty one", () => {
    for (const title of [undefined, null, "", "  \n "]) {
      const name = cardName(title, "Scout");
      expect(name).toEqual({ text: "Scout", titled: false });
      expect(whose(name, "thread")).toBe("Scout’s thread");
    }
    expect(whose("pitch.csv", "rows")).toBe("pitch.csv’s rows");
  });

  it("keeps a title of the most it shows whole, and cuts one past it with an ellipsis", () => {
    const most = "a".repeat(TITLE_IN_LABEL);
    expect(cardName(most, "Berry").text).toBe(`“${most}”`);
    const cut = cardName(`${"word ".repeat(10)}end`, "Berry").text;
    expect(cut.endsWith("…”")).toBe(true);
    expect([...cut].length).toBe(TITLE_IN_LABEL + 2);
    expect(cut).not.toContain(" …");
    expect(cardName("Pricing\nfor 3 rivals", "Berry").text).toBe(
      "“Pricing for 3 rivals”",
    );
  });

  it("capitalizes words that start a sentence", () => {
    expect(capitalized(whose(cardName("12 found", "Berry"), "answer"))).toBe(
      "The “12 found” answer",
    );
    expect(capitalized("")).toBe("");
  });
});
