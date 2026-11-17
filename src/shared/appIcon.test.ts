import { describe, expect, it } from "vitest";
import { iconMascotId } from "./appIcon";

describe("iconMascotId", () => {
  const flock = [
    { id: "berry", deletedAt: null },
    { id: "scout", deletedAt: null },
    { id: "gone", deletedAt: 1_700_000_000_000 },
  ];

  it("is the chosen mascot while it's in the flock", () => {
    expect(iconMascotId("scout", flock)).toBe("scout");
  });

  it("hands the icon back to Berry for a mascot that's deleted or was never there", () => {
    expect(iconMascotId("gone", flock)).toBeNull();
    expect(iconMascotId("someone-else", flock)).toBeNull();
    expect(iconMascotId("scout", [])).toBeNull();
  });

  it("is Berry for Berry, by null or by its id", () => {
    expect(iconMascotId(null, flock)).toBeNull();
    expect(iconMascotId("berry", flock)).toBeNull();
  });
});
