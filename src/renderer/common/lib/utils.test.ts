import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type size next to a text colour", () => {
    expect(cn("text-13", "text-foreground")).toBe("text-13 text-foreground");
  });

  it("lets a later type size replace an earlier one", () => {
    expect(cn("text-13", "text-20")).toBe("text-20");
  });
});
