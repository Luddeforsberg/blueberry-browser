import { describe, expect, it } from "vitest";
import { clampOffset, dropIndex } from "./useTabDrag";

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
