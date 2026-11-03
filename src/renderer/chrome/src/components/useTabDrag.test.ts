import { describe, expect, it } from "vitest";
import { clampOffset, dropIndex, nudgeTarget, settledOffset, type Slot } from "./useTabDrag";

// Three sidebar rows, all one size.
const rows: Slot[] = [0, 36, 72].map((start) => ({ start, size: 36 }));
// The tab row with the active tab first, wider than the others, and 2px between them.
const row: Slot[] = [
  { start: 0, size: 150 },
  { start: 152, size: 100 },
  { start: 254, size: 100 },
  { start: 356, size: 100 },
];

describe("dropIndex", () => {
  it("stays put until the tab covers half of the next one", () => {
    expect(dropIndex(0, 1, rows)).toBe(1);
    expect(dropIndex(17, 1, rows)).toBe(1);
    expect(dropIndex(18, 1, rows)).toBe(2);
    expect(dropIndex(-17, 1, rows)).toBe(1);
    expect(dropIndex(-19, 1, rows)).toBe(0);
  });

  it("stops at both ends of the list", () => {
    expect(dropIndex(-500, 1, rows)).toBe(0);
    expect(dropIndex(500, 1, rows)).toBe(2);
  });

  it("goes by each tab's own size when the dragged one is wider", () => {
    // Past half of the second narrow tab, though not a whole wide tab's width.
    expect(dropIndex(154, 0, row)).toBe(2);
    expect(dropIndex(152, 0, row)).toBe(1);
    expect(dropIndex(306, 0, row)).toBe(3);
  });

  it("goes by each tab's own size when a narrow one passes the wide one", () => {
    expect(dropIndex(-127, 2, row)).toBe(1);
    expect(dropIndex(-179, 2, row)).toBe(0);
    expect(dropIndex(-177, 2, row)).toBe(1);
  });
});

describe("clampOffset", () => {
  it("keeps the dragged tab inside the list", () => {
    expect(clampOffset(-500, 1, rows)).toBe(-36);
    expect(clampOffset(500, 1, rows)).toBe(36);
    expect(clampOffset(10, 1, rows)).toBe(10);
  });

  it("lets a wide tab reach the end of the list, and a narrow one the start", () => {
    expect(clampOffset(500, 0, row)).toBe(306);
    expect(clampOffset(-500, 3, row)).toBe(-356);
  });
});

describe("settledOffset", () => {
  it("puts the dragged tab where the slot it takes was, whatever their sizes", () => {
    expect(settledOffset(1, 2, rows)).toBe(36);
    // The wide tab's end lands where the third tab's end was, rather than two wide steps along.
    expect(settledOffset(0, 2, row)).toBe(204);
    expect(settledOffset(0, 3, row)).toBe(306);
    // A narrow tab's start lands where the one it passes started.
    expect(settledOffset(2, 1, row)).toBe(-102);
    expect(settledOffset(2, 0, row)).toBe(-254);
    expect(settledOffset(1, 1, row)).toBe(0);
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
