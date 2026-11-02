import { describe, expect, it } from "vitest";
import { quietConsole } from "./quietConsole";

describe("the runner's log", () => {
  it("keeps the words and drops what came with them", () => {
    const lines: unknown[][] = [];
    const write = (...args: unknown[]) => void lines.push(args);
    const target = { log: write, info: write, warn: write, error: write, debug: write };
    quietConsole(target);
    target.error("Error in a task:", new Error("401 for key sk-secret on <page>Order placed</page>"));
    target.error(new Error("page text"));
    target.log("Job job-1: done.");
    expect(lines).toEqual([["Error in a task:"], ["Job job-1: done."]]);
  });
});
