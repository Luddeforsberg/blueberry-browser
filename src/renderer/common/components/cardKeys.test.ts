import { describe, expect, it } from "vitest";
import { ARM_MS, keyCounts } from "./cardKeys";

describe("keys on a card", () => {
  const press = { inside: true, repeat: false, armedAt: 1000 };

  it("counts a key pressed on the card once it has been there half a second", () => {
    expect(keyCounts({ ...press, at: 1000 + ARM_MS })).toBe(true);
    expect(keyCounts({ ...press, at: 1000 + 5000 })).toBe(true);
  });

  it.each([0, 1, ARM_MS - 1])("doesn't count one %i ms after the card appeared or took the keyboard", (after) => {
    expect(keyCounts({ ...press, at: 1000 + after })).toBe(false);
  });

  it("never counts a key held down", () => {
    expect(keyCounts({ ...press, repeat: true, at: 1000 + 5000 })).toBe(false);
  });

  it("never counts a key with the keyboard outside the card", () => {
    expect(keyCounts({ ...press, inside: false, at: 1000 + 5000 })).toBe(false);
  });
});
