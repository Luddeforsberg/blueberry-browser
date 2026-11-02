import { describe, expect, it } from "vitest";
import { clampOffset, dropIndex, nudgeTarget } from "./useTabDrag";

describe("dropIndex", () => {
  it("stays put until the tab passes half a slot", () => {
    expect(dropIndex(0, 1, 36, 3)).toBe(1);
    expect(dropIndex(17, 1, 36, 3)).toBe(1);
    expect(dropIndex(18, 1, 36, 3)).toBe(2);
    expect(dropIndex(-19, 1, 36, 3)).toBe(0);
  });

  it("stops at both ends of the list", () => {
    expect(dropIndex(-500, 1, 36, 3)).toBe(0);
    expect(dropIndex(500, 1, 36, 3)).toBe(2);
  });
});

describe("clampOffset", () => {
  it("keeps the dragged tab inside the list", () => {
    expect(clampOffset(-500, 1, 36, 3)).toBe(-36);
    expect(clampOffset(500, 1, 36, 3)).toBe(36);
    expect(clampOffset(10, 1, 36, 3)).toBe(10);
  });
});

describe("nudgeTarget", () => {
  // b and d are a job's tabs, which the sidebar shows under its chat.
  const all = ["a", "b", "c", "d", "e"];
  const shown = ["a", "c", "e"];

  it("steps over hidden tabs to the next one shown", () => {
    expect(nudgeTarget(all, shown, "a", 1)).toBe(2);
    expect(nudgeTarget(all, shown, "e", -1)).toBe(2);
    expect(nudgeTarget(all, shown, "c", -1)).toBe(0);
  });

  it("goes nowhere past either end, or for a tab that isn't shown", () => {
    expect(nudgeTarget(all, shown, "a", -1)).toBeNull();
    expect(nudgeTarget(all, shown, "e", 1)).toBeNull();
    expect(nudgeTarget(all, shown, "b", 1)).toBeNull();
  });
});
