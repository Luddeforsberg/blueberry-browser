import { describe, expect, it } from "vitest";
import { costOf, costWords, perRunEstimate, roughRunCost } from "./modelPrices";

describe("costOf", () => {
  it("prices fresh input, cached input and output apart, per million tokens", () => {
    // 900k fresh at $1, 100k cached at $0.05, 200k out at $5.
    expect(costOf("gpt-6.1-terra", { input: 1_000_000, cached: 100_000, output: 200_000 })).toBeCloseTo(0.9 + 0.005 + 1, 10);
    expect(costOf("gpt-6.1-terra-2026-10-01", { input: 1_000_000, cached: 0, output: 0 })).toBeCloseTo(1, 10);
    expect(costOf("gpt-6.1-terra", { input: 0, cached: 0, output: 0 })).toBe(0);
  });

  it("is null for a model it has no price for, so nothing made up shows", () => {
    expect(costOf("gpt-4o-mini", { input: 1000, cached: 0, output: 1000 })).toBeNull();
    expect(roughRunCost("gpt-4o-mini")).toBeNull();
  });

  it("never counts more cached than was read", () => {
    expect(costOf("gpt-6.1-sol", { input: 10, cached: 50, output: 0 })).toBeCloseTo((10 * 0.1) / 1_000_000, 12);
  });
});

describe("costWords", () => {
  it("says cents, under a cent, and whole dollars from $100", () => {
    expect(costWords(0)).toBe("under $0.01");
    expect(costWords(0.0049)).toBe("under $0.01");
    expect(costWords(0.005)).toBe("$0.01");
    expect(costWords(0.4)).toBe("$0.40");
    expect(costWords(99.99)).toBe("$99.99");
    expect(costWords(1234.4)).toBe("$1,234");
  });
});

describe("perRunEstimate", () => {
  it("goes by this card's own runs first, then the source's, then a rough guess said to be rough", () => {
    expect(perRunEstimate({ own: [0.02, 0.04], source: [1], rough: 5 })).toEqual({ cost: 0.03, rough: false });
    expect(perRunEstimate({ own: [], source: [0.1, 0.3], rough: 5 })).toEqual({ cost: 0.2, rough: false });
    expect(perRunEstimate({ own: [], source: [], rough: 0.05 })).toEqual({ cost: 0.05, rough: true });
    expect(perRunEstimate({ own: [], source: [], rough: null })).toBeNull();
  });
});
