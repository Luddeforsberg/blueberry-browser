import { describe, expect, it } from "vitest";
import { iconMascotId } from "./appIcon";

describe("iconMascotId", () => {
  const mascots = [
    { id: "berry", deletedAt: null },
    { id: "scout", deletedAt: null },
    { id: "gone", deletedAt: 1_700_000_000_000 },
  ];

  it("is the chosen mascot while it's one of the mascots", () => {
    expect(iconMascotId("scout", mascots)).toBe("scout");
  });

  it("hands the icon back to Berry for a mascot that's deleted or was never there", () => {
    expect(iconMascotId("gone", mascots)).toBeNull();
    expect(iconMascotId("someone-else", mascots)).toBeNull();
    expect(iconMascotId("scout", [])).toBeNull();
  });

  it("is Berry for Berry, by null or by its id", () => {
    expect(iconMascotId(null, mascots)).toBeNull();
    expect(iconMascotId("berry", mascots)).toBeNull();
  });
});
