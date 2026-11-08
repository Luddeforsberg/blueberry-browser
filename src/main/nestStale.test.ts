import { describe, expect, it } from "vitest";
import {
  changedLines,
  fingerprint,
  SENT_MIXED,
  SENT_NOTHING,
  sentWith,
} from "./nestStale";

const thread = (answer: string) => ({
  name: "Scout",
  part: "thread" as const,
  exchanges: [{ asked: "Find", answer }],
});

describe("fingerprint", () => {
  it("changes with what a source says, never with its name, and is nothing while it has nothing to give", () => {
    expect(fingerprint(thread("One"))).toBe(
      fingerprint({ ...thread("One"), name: "Renamed" }),
    );
    expect(fingerprint(thread("One"))).not.toBe(fingerprint(thread("Two")));
    expect(fingerprint(null)).toBeNull();
    expect(fingerprint("stale")).toBeNull();
    // A page by its address only, since its text is read as the card sends and never again to compare.
    const page = (url: string, title: string) => ({
      name: "",
      part: "page" as const,
      url,
      title,
      tabId: "1",
    });
    expect(fingerprint(page("https://a.example/", "A"))).toBe(
      fingerprint(page("https://a.example/", "A, later")),
    );
    expect(fingerprint(page("https://a.example/", "A"))).not.toBe(
      fingerprint(page("https://a.example/b", "A")),
    );
    // A table's rows, and a file's bytes, which never read as words.
    const table = (rows: string[][]) => ({
      name: "",
      part: "table" as const,
      table: { header: ["Company"], rows },
    });
    expect(fingerprint(table([["One"]]))).not.toBe(
      fingerprint(table([["One"], ["Two"]])),
    );
    expect(fingerprint(null, new Uint8Array([1, 2]))).not.toBe(
      fingerprint(null, new Uint8Array([1, 3])),
    );
    expect(fingerprint(null, new Uint8Array([1, 2]))).not.toContain("\u0001");
  });
});

describe("sentWith", () => {
  it("is what went on a card's own message, and mixed when a run went with something the runs before didn't", () => {
    expect(sentWith("old", "new", false)).toBe("new");
    expect(sentWith(null, null, false)).toBe(SENT_NOTHING);
    expect(sentWith(null, "new", true)).toBe("new");
    expect(sentWith("new", "new", true)).toBe("new");
    expect(sentWith("old", "new", true)).toBe(SENT_MIXED);
    expect(sentWith(SENT_MIXED, "new", true)).toBe(SENT_MIXED);
  });
});

describe("changedLines", () => {
  it("names only lines sent with something else than they give now", () => {
    expect(changedLines([])).toEqual([]);
    expect(changedLines([{ lineId: "a", sent: "x", now: "x" }])).toEqual([]);
    expect(
      changedLines([
        { lineId: "a", sent: "x", now: "x" },
        { lineId: "b", sent: "x", now: "y" },
      ]),
    ).toEqual(["b"]);
    // Never sent with, such as a line its next message is the first to get, or nothing to give now.
    expect(
      changedLines([
        { lineId: "a", sent: null, now: "y" },
        { lineId: "b", sent: "x", now: null },
      ]),
    ).toEqual([]);
    // A source that had nothing when the card sent, and has answered since, and runs that didn't agree.
    expect(
      changedLines([
        { lineId: "a", sent: SENT_NOTHING, now: "y" },
        { lineId: "b", sent: SENT_MIXED, now: "y" },
      ]),
    ).toEqual(["a", "b"]);
  });
});
