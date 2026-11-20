import { describe, expect, it } from "vitest";
import { stepInPresentTense } from "./WorkViews";

describe("stepInPresentTense", () => {
  it("says a step as it's happening", () => {
    expect(stepInPresentTense("Clicked something on webhallen.com")).toBe("Clicking something on webhallen.com");
    expect(stepInPresentTense("Went to webhallen.com")).toBe("Going to webhallen.com");
  });

  it("leaves words it doesn't know", () => {
    expect(stepInPresentTense("Stayed off example.com")).toBe("Stayed off example.com");
    expect(stepInPresentTense("Reader mode")).toBe("Reader mode");
  });
});
