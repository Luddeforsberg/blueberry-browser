import { describe, expect, it } from "vitest";
import type { Routine, RoutineRun } from "@shared/library";
import {
  blankForm,
  formFor,
  groupRoutines,
  recordedForm,
  routineLine,
  stepsPieces,
  switchAsking,
  toDraft,
  typedInto,
  withRoutinePart,
  withStepsPieces,
  type RoutineFormValues,
} from "./routinesView";

const form = (instructions: string, value: string) =>
  recordedForm({ name: "Job", instructions, sites: [], changes: [{ label: "Search", value }] });

// The value's mark as the box shows it, or null when it isn't marked.
const marked = (values: RoutineFormValues) => stepsPieces(values).find(({ row }) => row !== undefined)?.text ?? null;

// The box after the user has made the value's mark say something else, as the browser would leave it.
const typedInMark = (values: RoutineFormValues, next: string) =>
  withStepsPieces(
    values,
    stepsPieces(values).map((piece) => (piece.row === undefined ? piece : { ...piece, text: next })),
  );

describe("what might change", () => {
  it("is marked where it stands, as a whole value", () => {
    expect(stepsPieces(form("Book 3 seats at 13:30 for $3", "3"))).toEqual([
      { text: "Book " },
      { text: "3", row: 0 },
      { text: " seats at 13:30 for $3" },
    ]);
    expect(marked(form("Set the width to 10px", "10"))).toBe("10");
    expect(stepsPieces(form("Find a cat in the category", "cat"))[1]).toEqual({ text: "cat", row: 0 });
    expect(marked(form("Find a category", "cat"))).toBeNull();
  });

  it("leaves an address's path alone, but not what it's searching for", () => {
    expect(stepsPieces(form("Go to shop.example/product/1 and buy 1", "1")).at(-1)).toEqual({ text: "1", row: 0 });
    expect(stepsPieces(form("Go to https://shop.example/usb?q=usb", "usb")).at(-1)).toEqual({ text: "usb", row: 0 });
    expect(marked(form("Book it on 12/03", "12/03"))).toBe("12/03");
  });

  it("reads back as exactly the text it was made from", () => {
    const values = form("1. Go to the shop\n2. Search for usb cable\n\nThen say how it went.", "usb cable");
    expect(withStepsPieces(values, stepsPieces(values))).toEqual(values);
    expect(
      stepsPieces(values)
        .map(({ text }) => text)
        .join(""),
    ).toBe(values.instructions);
  });

  it("is edited where it stands, and only there, taken as written", () => {
    const values = typedInMark(form("Search for usb, then pick the cheapest usb", "usb"), "$& hdmi");
    expect(values.instructions).toBe("Search for $& hdmi, then pick the cheapest usb");
    expect(values.recorded).toEqual([{ label: "Search", value: "$& hdmi", ask: false, at: 11 }]);
    expect(toDraft(values).instructions).toBe(values.instructions);
  });

  it("stays marked while text is typed before it", () => {
    const values = form("Search for usb", "usb");
    const typed = withStepsPieces(values, [{ text: "Then search for " }, { text: "usb", row: 0 }]);
    expect(typed.recorded?.[0].at).toBe(16);
    expect(marked(typed)).toBe("usb");
  });

  it("keeps what is typed over all or part of it in it, and only then", () => {
    const pieces = stepsPieces(form("Search for usb cable now", "usb cable"));
    expect(typedInto(pieces, 11, 20, "hdmi")).toEqual([{ text: "Search for " }, { text: "hdmi", row: 0 }, { text: " now" }]);
    expect(typedInto(pieces, 15, 20, "wire")).toEqual([{ text: "Search for " }, { text: "usb wire", row: 0 }, { text: " now" }]);
    // Over the value and what's beside it, what's typed is plain, and what's left of the value stays one.
    expect(typedInto(pieces, 15, 24, "!")).toEqual([{ text: "Search for " }, { text: "usb ", row: 0 }, { text: "!" }]);
  });

  it("never holds a line break: a value one lands in ends there", () => {
    const pieces = stepsPieces(form("Search for usb cable now", "usb cable"));
    expect(typedInto(pieces, 20, 20, "\n")).toEqual([{ text: "Search for " }, { text: "usb cable", row: 0 }, { text: "\n now" }]);
    expect(typedInto(pieces, 15, 15, "\n")).toEqual([{ text: "Search for " }, { text: "usb ", row: 0 }, { text: "\ncable now" }]);
    expect(typedInto(pieces, 11, 11, "\n")).toEqual([{ text: "Search for \n" }, { text: "usb cable", row: 0 }, { text: " now" }]);
    expect(typedInto(pieces, 11, 20, "\n")).toEqual([{ text: "Search for \n now" }]);
  });

  it("stops being a value once its mark is emptied, and stops being asked for", () => {
    const asking = switchAsking(form("Search for usb", "usb"), 0);
    for (const left of ["", "  "]) {
      const values = typedInMark(asking, left);
      expect(values.recorded).toEqual([]);
      expect(values.instructions).toBe(`Search for ${left}`);
      expect(marked(values)).toBeNull();
    }
  });

  it("asks each run with a line before the steps, which follows the value", () => {
    const asking = switchAsking(form("Search for usb", "usb"), 0);
    expect(asking.instructions).toBe("Before you start, ask me for the search to use. Last time it was usb.\n\nSearch for usb");
    expect(marked(asking)).toBe("usb");
    const changed = typedInMark(asking, "hdmi");
    expect(changed.instructions).toBe("Before you start, ask me for the search to use. Last time it was hdmi.\n\nSearch for hdmi");
    expect(switchAsking(changed, 0).instructions).toBe("Search for hdmi");
  });

  it("is marked again from a saved routine that asks for it, and only from the lines as they were made", () => {
    const saved = switchAsking(form("Search for usb", "usb"), 0).instructions;
    const routine = (instructions: string): Routine => ({
      id: "r1",
      name: "Job",
      instructions,
      scheduleSpec: { kind: "manual" },
      mascotId: null,
      sites: [],
      inCloud: false,
      schedule: "Only when you ask",
      paused: false,
      nextRunAt: null,
      lastResult: "",
      status: "idle",
      latestRun: null,
      unseen: false,
    });
    const again = formFor(routine(saved));
    expect(again.recorded).toEqual([{ label: "Search", value: "usb", ask: true, at: 11 }]);
    expect(switchAsking(again, 0).instructions).toBe("Search for usb");
    expect(formFor(routine(`${saved} cable`)).recorded).toHaveLength(1);
    expect(formFor(routine(saved.replace("Search for usb", "Search for hdmi"))).recorded).toBeUndefined();
    expect(formFor(routine(saved.replace("\n\n", "\n"))).recorded).toBeUndefined();
    expect(formFor(routine("Search for usb")).recorded).toBeUndefined();
  });
});

describe("changing one part", () => {
  it("takes only that part, and sends no name unless the name is the part", () => {
    const current = { ...blankForm("SVT news", "Read SVT"), id: "r1", kind: "daily" as const, time: "09:00" };
    const changed = { ...current, instructions: "Read DN", time: "17:00" };
    expect(withRoutinePart(current, changed, "does")).toMatchObject({ name: "", instructions: "Read DN", time: "09:00" });
    expect(withRoutinePart(current, { ...current, name: "News" }, "name")).toMatchObject({ name: "News", instructions: "Read SVT" });
  });

  it("keeps sites only while it’s limited to them", () => {
    const values = { ...blankForm("", "Look"), sites: ["svt.se"] };
    expect(toDraft(values).sites).toEqual([]);
    expect(toDraft({ ...values, onlySomeSites: true }).sites).toEqual(["svt.se"]);
  });
});

describe("the list", () => {
  const NOW = new Date(2026, 10, 16, 12, 0).getTime();
  const run = (patch: Partial<RoutineRun>): RoutineRun => ({
    id: "run",
    routineId: "r",
    status: "finished",
    startedAt: NOW,
    endedAt: NOW,
    lateFor: null,
    steps: [],
    result: null,
    error: null,
    approval: null,
    tokens: null,
    seen: true,
    ...patch,
  });
  const routine = (id: string, patch: Partial<Routine> = {}): Routine => ({
    id,
    name: id,
    instructions: "Read SVT",
    scheduleSpec: { kind: "daily", time: "09:00" },
    mascotId: null,
    sites: [],
    inCloud: false,
    schedule: "",
    paused: false,
    nextRunAt: NOW + 3_600_000,
    lastResult: "Not run yet",
    status: "idle",
    latestRun: null,
    unseen: false,
    ...patch,
  });
  const keys = (routines: Routine[]) => groupRoutines(routines).map((group) => [group.key, group.routines.map(({ id }) => id)]);

  it("has no groups for no routines", () => {
    expect(groupRoutines([])).toEqual([]);
  });

  it("groups by what matters, in order, leaving out the empty ones", () => {
    expect(
      keys([
        routine("manual", { scheduleSpec: { kind: "manual" }, nextRunAt: null }),
        routine("paused", { paused: true, status: "paused", nextRunAt: null }),
        routine("later", { nextRunAt: NOW + 7_200_000 }),
        routine("sooner", { nextRunAt: NOW + 60_000 }),
        routine("running", { status: "running" }),
        routine("queued", { status: "queued" }),
        routine("asking", { status: "needs-approval" }),
      ]),
    ).toEqual([
      ["needs-you", ["asking"]],
      ["running", ["running", "queued"]],
      ["scheduled", ["sooner", "later"]],
      ["paused", ["paused"]],
      ["manual", ["manual"]],
    ]);
    expect(keys([routine("one")])).toEqual([["scheduled", ["one"]]]);
  });

  it("puts what needs you first, even while paused, and a one-off that has run with those only run when asked", () => {
    expect(
      keys([
        routine("done-once", { scheduleSpec: { kind: "once", at: NOW - 1000 }, nextRunAt: null }),
        routine("paused-asking", { paused: true, status: "needs-approval" }),
        routine("failed", { status: "failed" }),
      ]),
    ).toEqual([
      ["needs-you", ["paused-asking"]],
      ["scheduled", ["failed"]],
      ["manual", ["done-once"]],
    ]);
  });

  it("says what one waiting for you wants, where a running one is, and what went wrong in ask", () => {
    const approval = { id: "a", text: "Open https://www.klm.com/orders/123" };
    expect(routineLine(routine("a", { status: "needs-approval", latestRun: run({ status: "needs-approval", approval }) }))).toEqual({
      words: "Open klm.com",
      last: null,
    });
    expect(routineLine(routine("b", { status: "running", latestRun: run({ status: "running", statusLine: "Scanning fares.." }) }))).toEqual(
      { words: "Scanning fares..", last: null },
    );
    expect(
      routineLine(
        routine("c", { status: "running", latestRun: run({ status: "running", steps: [{ text: "Opened tap.pt", done: true }] }) }),
      ),
    ).toEqual({ words: "Opened tap.pt", last: null });
    expect(
      routineLine(routine("d", { status: "failed", lastResult: "Today: couldn’t finish", latestRun: run({ status: "failed" }) })),
    ).toEqual({ words: "Every day at 09:00", last: { text: "Today: couldn’t finish", ask: true } });
    expect(routineLine(routine("e", { scheduleSpec: { kind: "manual" }, nextRunAt: null }))).toEqual({
      words: null,
      last: { text: "Not run yet", ask: false },
    });
    expect(routineLine(routine("f", { cloudNote: "Moving back to this Mac…" }))).toEqual({
      words: "Every day at 09:00",
      last: { text: "Moving back to this Mac…", ask: false },
    });
  });
});
