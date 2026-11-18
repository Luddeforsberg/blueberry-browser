import { describe, expect, it } from "vitest";
import { forgetGone, goneSince, rowsToDraw, type Row } from "./comings";

const rows = (...keys: string[]): Row<string>[] => keys.map((key) => ({ key, item: key }));
const order = (drawn: { key: string; phase: string }[]) => drawn.map(({ key, phase }) => (phase === "here" ? key : `${key}:${phase}`));

describe("rows coming and going", () => {
  it("keeps a closed row where it was while it folds", () => {
    const gone = goneSince(rows("a", "b", "c"), new Set(["a", "c"]), 0);
    expect(gone).toEqual([{ key: "b", item: "b", after: "a", at: 0 }]);
    expect(order(rowsToDraw(rows("a", "c"), gone, new Set()))).toEqual(["a", "b:folding", "c"]);
  });

  it("folds the first row in first place", () => {
    const gone = goneSince(rows("a", "b"), new Set(["b"]), 0);
    expect(order(rowsToDraw(rows("b"), gone, new Set()))).toEqual(["a:folding", "b"]);
  });

  it("keeps the order of rows closed one after another from the top, each before it has finished folding", () => {
    // a goes, then b goes while a is still folding.
    const first = goneSince(rows("a", "b", "c"), new Set(["b", "c"]), 0);
    const drawn = rowsToDraw(rows("b", "c"), first, new Set());
    const second = goneSince(drawn, new Set(["c"]), 50).filter((row) => !first.some(({ key }) => key === row.key));
    expect(order(rowsToDraw(rows("c"), [...first, ...second], new Set()))).toEqual(["a:folding", "b:folding", "c"]);
  });

  it("keeps the order when a lower row closes before the one above it", () => {
    const first = goneSince(rows("a", "b", "c", "d"), new Set(["a", "b", "d"]), 0);
    const drawn = rowsToDraw(rows("a", "b", "d"), first, new Set());
    const second = goneSince(drawn, new Set(["a", "d"]), 50).filter((row) => !first.some(({ key }) => key === row.key));
    expect(order(rowsToDraw(rows("a", "d"), [...first, ...second], new Set()))).toEqual(["a", "b:folding", "c:folding", "d"]);
  });

  it("a row that follows one done folding takes that one’s place, rather than jumping to the top", () => {
    const gone = [
      { key: "b", item: "b", after: "a", at: 0 },
      { key: "c", item: "c", after: "b", at: 50 },
    ];
    const left = forgetGone(gone, ({ at }) => at === 0);
    expect(left).toEqual([{ key: "c", item: "c", after: "a", at: 50 }]);
    expect(order(rowsToDraw(rows("a", "d"), left, new Set()))).toEqual(["a", "c:folding", "d"]);
  });

  it("marks a new row as opening, and leaves the rest alone", () => {
    expect(order(rowsToDraw(rows("a", "b"), [], new Set(["b"])))).toEqual(["a", "b:opening"]);
  });

  it("draws nothing extra for an empty list, or once every row is gone", () => {
    expect(rowsToDraw([], [], new Set())).toEqual([]);
    expect(order(rowsToDraw([], goneSince(rows("a"), new Set(), 0), new Set()))).toEqual(["a:folding"]);
    expect(forgetGone(goneSince(rows("a"), new Set(), 0), () => true)).toEqual([]);
  });
});
