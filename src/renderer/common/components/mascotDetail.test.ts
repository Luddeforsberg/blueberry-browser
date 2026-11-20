import { describe, expect, it } from "vitest";
import { mascotDetail } from "./mascotDetail";

describe("a berry's detail by its size", () => {
  it("draws everything from 48px", () => {
    expect(mascotDetail(48)).toBe("full");
    expect(mascotDetail(112)).toBe("full");
  });

  it("leaves the texture out from 28px up to 48px", () => {
    expect(mascotDetail(47)).toBe("mid");
    expect(mascotDetail(28)).toBe("mid");
  });

  it("keeps only the outline, the top and the eyes under 28px", () => {
    expect(mascotDetail(27)).toBe("small");
    expect(mascotDetail(14)).toBe("small");
  });
});
