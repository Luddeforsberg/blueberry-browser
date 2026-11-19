import { FakeListChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { generateTitle } from "./cheapModel";

describe("generateTitle", () => {
  const titled = (response: string) => generateTitle([{ role: "user", content: "hi" }], new FakeListChatModel({ responses: [response] }));

  it("cleans up the model's answer", async () => {
    expect(await titled("Trip to Porto")).toBe("Trip to Porto");
    expect(await titled(' "Trip to Porto." ')).toBe("Trip to Porto");
  });

  it("has no title when the model finds no topic", async () => {
    expect(await titled("NONE")).toBeNull();
    expect(await titled("none.")).toBeNull();
    expect(await titled("  ")).toBeNull();
  });

  it("keeps a title to 60 characters", async () => {
    expect(await titled("x".repeat(60))).toBe("x".repeat(60));
    expect(await titled("x".repeat(61))).toBe(`${"x".repeat(59)}…`);
  });
});
