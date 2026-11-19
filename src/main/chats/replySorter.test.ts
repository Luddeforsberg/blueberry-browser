import { describe, expect, it } from "vitest";
import { ReplySorter } from "./agent";

describe("ReplySorter", () => {
  it("streams a message's words as the answer while it calls no tool", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Found ", false), ...sorter.chunk("it.", false), ...sorter.ended(false)]).toEqual(["Found ", "it."]);
  });

  it("takes words back as a status line once their message calls a tool, and keeps it up to date", () => {
    const sorter = new ReplySorter();
    expect(sorter.chunk("I'll check ", false)).toEqual(["I'll check "]);
    expect(sorter.chunk("their careers page.", false)).toEqual(["their careers page."]);
    expect(sorter.chunk("", true)).toEqual([{ statusLine: "I'll check their careers page." }]);
    expect(sorter.chunk("", true)).toEqual([]);
    expect(sorter.chunk(" Then LinkedIn.", false)).toEqual([{ statusLine: "I'll check their careers page. Then LinkedIn." }]);
    expect(sorter.ended(true)).toEqual([]);
  });

  it("says nothing for a message that only calls tools", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("", true), ...sorter.chunk(" ", false), ...sorter.ended(true)]).toEqual([]);
  });

  it("takes words back when only the whole message shows the call", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Looking.", false), ...sorter.ended(true)]).toEqual(["Looking.", { statusLine: "Looking." }]);
  });

  it("gives words back as the answer when the message ended up calling nothing", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Here's what I found.", true), ...sorter.ended(false)]).toEqual([
      { statusLine: "Here's what I found." },
      "Here's what I found.",
    ]);
  });

  it("starts each message afresh", () => {
    const sorter = new ReplySorter();
    sorter.chunk("First.", true);
    sorter.ended(true);
    expect([...sorter.chunk("The answer.", false), ...sorter.ended(false)]).toEqual(["The answer."]);
  });
});
