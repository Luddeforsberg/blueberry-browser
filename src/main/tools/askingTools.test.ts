import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";

describe("the ask_user tool", () => {
  const askTool = (ask: (question: string, answers: string[]) => Promise<string | null>) =>
    createPageTools({
      activeTab: () => null,
      allTabs: () => [],
      openTab: () => {
        throw new Error("Not used");
      },
      closeTab: () => true,
      ask,
      canSee: () => true,
      onUse: () => {},
    }).find((tool) => tool.name === "ask_user")!;

  it.each([
    "What is your password?",
    "What is the code?",
    "What code did you receive?",
    "Vad är koden?",
    "Which card number?",
    "Your 2FA?",
  ])("never asks %s", async (question) => {
    const ask = vi.fn(async () => "secret");
    expect(await askTool(ask).run({ question })).toMatch(/never go through this chat/);
    expect(ask).not.toHaveBeenCalled();
  });

  it.each(["Which colour?", "What is the postal code?", "Which of the two flights did you mean?"])("asks %s", async (question) => {
    expect(await askTool(async () => "Blue").run({ question })).toBe("The user answered: Blue");
  });

  it("says when the user skipped", async () => {
    expect(await askTool(async () => null).run({ question: "Which colour?" })).toMatch(/chose not to answer/);
  });

  it.each([
    ["none", undefined, []],
    ["one", ["Friday evening"], ["Friday evening"]],
    ["three", ["Friday evening", "Saturday evening", "Either"], ["Friday evening", "Saturday evening", "Either"]],
    ["one of 60 characters", ["a".repeat(60)], ["a".repeat(60)]],
  ])("offers %s to press", async (_, answers, offered) => {
    const ask = vi.fn(async () => "Friday evening");
    expect(await askTool(ask).run({ question: "Which evening?", answers })).toBe("The user answered: Friday evening");
    expect(ask).toHaveBeenCalledWith("Which evening?", offered);
  });

  it.each([
    ["a fourth", ["One", "Two", "Three", "Four"]],
    ["an empty one", [""]],
    ["one of 61 characters", ["a".repeat(61)]],
  ])("refuses %s answer", async (_, answers) => {
    expect(() => askTool(async () => null).label({ question: "Which?", answers })).toThrow();
  });

  it.each(["My password", "The code from the text", "Card number ending 4242"])("never asks with %s as an answer", async (answer) => {
    const ask = vi.fn(async () => "secret");
    expect(await askTool(ask).run({ question: "Which one?", answers: ["Neither", answer] })).toMatch(/never go through this chat/);
    expect(ask).not.toHaveBeenCalled();
  });

  it("drops an answer shaped like a code, and keeps the rest", async () => {
    const ask = vi.fn(async () => "Neither");
    await askTool(ask).run({ question: "Which one?", answers: ["482913", "Neither", "AB12 CD34"] });
    expect(ask).toHaveBeenCalledWith("Which one?", ["Neither"]);
  });

  it("shows one question at a time", async () => {
    const answers: Array<() => void> = [];
    const asked: string[] = [];
    const tool = askTool((question) => {
      asked.push(question);
      return new Promise((resolve) => answers.push(() => resolve("ok")));
    });
    const both = Promise.all([tool.run({ question: "First?" }), tool.run({ question: "Second?" })]);
    await vi.waitFor(() => expect(asked).toEqual(["First?"]));
    answers[0]();
    await vi.waitFor(() => expect(asked).toEqual(["First?", "Second?"]));
    answers[1]();
    await both;
  });
});
