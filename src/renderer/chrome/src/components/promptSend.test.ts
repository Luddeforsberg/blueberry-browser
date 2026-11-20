import { describe, expect, it } from "vitest";
import { leftAfterSend } from "./promptSend";

describe("what stays in a prompt box once its message is taken", () => {
  it("is nothing when it's what was sent", () => {
    expect(leftAfterSend("Book a table", "Book a table")).toBe("");
  });

  it("is what was typed on after it was sent", () => {
    expect(leftAfterSend("Book a table\n\nFor four, please", "Book a table")).toBe("For four, please");
  });

  it("is all of it when what was sent has been changed since", () => {
    expect(leftAfterSend("Book two tables", "Book a table")).toBe("Book two tables");
    expect(leftAfterSend("", "Book a table")).toBe("");
  });
});
