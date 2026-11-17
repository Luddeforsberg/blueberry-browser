import { describe, expect, it } from "vitest";
import { greetingName } from "./accountName";

describe("the name the new tab greets with", () => {
  it("is the saved name, trimmed, and none for no name or only spaces", () => {
    expect(greetingName("Sam")).toBe("Sam");
    expect(greetingName("  Sam ")).toBe("Sam");
    expect(greetingName(null)).toBeNull();
    expect(greetingName("")).toBeNull();
    expect(greetingName("   ")).toBeNull();
  });
});
