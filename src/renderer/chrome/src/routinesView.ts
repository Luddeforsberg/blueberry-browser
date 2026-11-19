import type { RecordedChange, RecordedDraft, Routine, RoutineDraft, RoutineSchedule } from "@shared/library";
import { routinesParam, type RoutinePart, type RoutinePlace } from "@shared/routinePlaces";
import { withSiteNames } from "./siteNames";
import { scheduleSentence, sentenceText } from "./scheduleWords";
export { TIME_CHIPS, howOften, withHowOften, scheduleSentence, sentenceText, readBack, nextInWords } from "./scheduleWords";
export type { HowOften } from "./scheduleWords";

export interface RoutineFormValues {
  // Null for a new routine.
  id: string | null;
  // Never asked for while making one. Empty means main names it from what it does, or keeps the name it has.
  name: string;
  instructions: string;
  kind: RoutineSchedule["kind"];
  time: string;
  date: string;
  days: number[];
  day: number;
  // Who runs it. Null is Berry.
  mascotId: string | null;
  // Only these sites, or anywhere. The sites are kept while it's anywhere, so turning it back on finds them.
  onlySomeSites: boolean;
  // Each as the user added it. Main checks them again when it's saved.
  sites: string[];
  // Runs on its schedule in the cloud, even with the Mac off. Only offered with a runner linked.
  inCloud?: boolean;
  // The suggestion that filled this in, which goes away once it's saved.
  suggestionId?: string;
  // Filled in from what the user showed Berry: what looks like it changes, and whether to ask for it on each run.
  recorded?: RecordedChangeValue[];
}

export interface RecordedChangeValue extends RecordedChange {
  ask: boolean;
  // Where `value` stands in the steps, after any lines asking for values, so it stays marked while it's edited.
  at: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

const dateValue = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

export const blankForm = (name = "", instructions = "", mascotId: string | null = null): RoutineFormValues => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    id: null,
    name,
    instructions,
    kind: "daily",
    time: "09:00",
    date: dateValue(tomorrow),
    days: [tomorrow.getDay()],
    day: tomorrow.getDate(),
    mascotId,
    onlySomeSites: false,
    sites: [],
  };
};

const withSchedule = (blank: RoutineFormValues, schedule: RoutineSchedule): RoutineFormValues => {
  const values: RoutineFormValues = { ...blank, kind: schedule.kind };
  if (schedule.kind === "manual") return values;
  if (schedule.kind === "once") {
    const at = new Date(schedule.at);
    return { ...values, date: dateValue(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
  }
  if (schedule.kind === "weekly") return { ...values, time: schedule.time, days: schedule.days };
  if (schedule.kind === "monthly") return { ...values, time: schedule.time, day: schedule.day };
  return { ...values, time: schedule.time };
};

export const formFor = ({ id, name, instructions, mascotId, sites, inCloud, scheduleSpec }: Routine): RoutineFormValues =>
  withSchedule(
    { ...blankForm(name, instructions, mascotId), id, onlySomeSites: sites.length > 0, sites, inCloud, recorded: askedFor(instructions) },
    scheduleSpec,
  );

// It does nothing by itself until the user gives it a time, and the sites are the ones they used.
export const recordedForm = ({ name, instructions, sites, changes }: RecordedDraft): RoutineFormValues => ({
  ...blankForm(name, instructions),
  kind: "manual",
  onlySomeSites: sites.length > 0,
  sites,
  recorded: placed(
    instructions,
    changes.map((change) => ({ ...change, ask: false, at: wholeValueAt(instructions, change.value) })),
  ),
});

// --- What might change -----------------------------------------------------------------------------------------------

// Each value a run should ask for is a line before the steps, so the instructions say so and a run asks through the same
// question as any other. The lines come from the values, and are never typed.
const askLine = (label: string, value: string) =>
  `Before you start, ask me for the ${label.toLowerCase()} to use. Last time it was ${value}.`;
const ASK_LINE = /^Before you start, ask me for the (.+?) to use\. Last time it was (.+?)\.\n\n/;

export const askingLines = (rows: RecordedChangeValue[]) =>
  rows.filter(({ ask }) => ask).map(({ label, value }) => askLine(label, value.trim()));
const askingText = (rows: RecordedChangeValue[]) =>
  askingLines(rows)
    .map((line) => `${line}\n\n`)
    .join("");

// The steps, after the lines asking for values.
const stepsText = ({ instructions, recorded = [] }: Pick<RoutineFormValues, "instructions" | "recorded">) => {
  const asking = askingText(recorded);
  return instructions.startsWith(asking) ? instructions.slice(asking.length) : instructions;
};

// Only as a whole value: a digit beside a digit or a letter beside a letter is part of something else. So a 3 isn't in
// 13:30, and a 10 is in 10px. An address's path isn't the value either, even where it looks like it, as a value of 1 in
// /product/1, but what it searches for is. Taken as written, whatever's in it. -1 where it isn't there.
const sameKind = (char: string) => (/\p{L}/u.test(char) ? "\\p{L}" : /\p{N}/u.test(char) ? "\\p{N}" : null);
const wholeValueAt = (text: string, value: string): number => {
  if (!value) return -1;
  const before = sameKind(value[0]);
  const after = sameKind(value[value.length - 1]);
  const whole = `${before ? `(?<!${before})` : ""}${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${after ? `(?!${after})` : ""}`;
  if (value.includes("/")) return text.search(new RegExp(whole, "u"));
  for (const found of text.matchAll(new RegExp(`\\S*/[^\\s?]*|${whole}`, "gu"))) if (!found[0].includes("/")) return found.index ?? -1;
  return -1;
};

// Each value where it stands, once: one that isn't there, or overlaps one before it, isn't one.
const placed = (steps: string, rows: RecordedChangeValue[]) =>
  rows.filter(
    (row, index) =>
      row.at >= 0 &&
      steps.slice(row.at, row.at + row.value.length) === row.value &&
      rows.slice(0, index).every((other) => row.at >= other.at + other.value.length || other.at >= row.at + row.value.length),
  );

// A saved routine that asks for values says so before its steps, so changing it marks them again. Only when the lines
// are exactly what they'd be made as, and each value is in the steps.
const askedFor = (instructions: string): RecordedChangeValue[] | undefined => {
  const asked: RecordedChange[] = [];
  let steps = instructions;
  for (let line = ASK_LINE.exec(steps); line; line = ASK_LINE.exec(steps)) {
    asked.push({ label: line[1].charAt(0).toUpperCase() + line[1].slice(1), value: line[2] });
    steps = steps.slice(line[0].length);
  }
  const rows = placed(
    steps,
    asked.map((row) => ({ ...row, ask: true, at: wholeValueAt(steps, row.value) })),
  );
  return asked.length > 0 && rows.length === asked.length && askingText(rows) + steps === instructions ? rows : undefined;
};

// The steps as they're shown: plain text, and each value, with its row, where it stands.
export type StepsPiece = { text: string; row?: number };

export const stepsPieces = (values: Pick<RoutineFormValues, "instructions" | "recorded">): StepsPiece[] => {
  const steps = stepsText(values);
  const marks = placed(steps, values.recorded ?? [])
    .map((row) => ({ ...row, index: values.recorded?.indexOf(row) ?? -1 }))
    .sort((a, b) => a.at - b.at);
  const pieces: StepsPiece[] = [];
  let from = 0;
  for (const { at, value, index } of marks) {
    if (at > from) pieces.push({ text: steps.slice(from, at) });
    pieces.push({ text: value, row: index });
    from = at + value.length;
  }
  if (from < steps.length) pieces.push({ text: steps.slice(from) });
  return pieces;
};

// The box as the user left it: the steps are what it says and each value what its mark holds. A value with nothing left
// in its mark has been edited away, so it isn't one any more, and nor is any line asking for it.
export const withStepsPieces = (values: RoutineFormValues, pieces: StepsPiece[]): RoutineFormValues => {
  const rows = values.recorded ?? [];
  const kept = new Map<number, RecordedChangeValue>();
  let steps = "";
  for (const { text, row } of pieces) {
    if (row !== undefined && rows[row] && !kept.has(row) && text.trim()) kept.set(row, { ...rows[row], value: text, at: steps.length });
    steps += text;
  }
  const recorded = rows.flatMap((_, index) => kept.get(index) ?? []);
  return { ...values, instructions: askingText(recorded) + steps, recorded };
};

// What the box says once [start, end) is replaced with `typed`. Typed over all or part of one value, it's part of that
// value. A line break is never part of one: a value it lands in ends there, and what was after it is plain text.
export const typedInto = (pieces: StepsPiece[], start: number, end: number, typed: string): StepsPiece[] => {
  const text = pieces.map((piece) => piece.text).join("");
  const rows = pieces.flatMap(({ text: said, row }) => Array<number | undefined>(said.length).fill(row));
  const over = rows.slice(start, end);
  const breaks = typed.includes("\n");
  const into = !breaks && over.length > 0 && over.every((row) => row !== undefined && row === over[0]) ? over[0] : undefined;
  const after = rows.slice(end);
  const cut = breaks ? rows[start - 1] : undefined;
  for (let at = 0; cut !== undefined && after[at] === cut; at++) after[at] = undefined;
  const next = text.slice(0, start) + typed + text.slice(end);
  const nextRows = [...rows.slice(0, start), ...Array<number | undefined>(typed.length).fill(into), ...after];
  return nextRows.reduce<StepsPiece[]>((built, row, at) => {
    const last = built.at(-1);
    if (last && last.row === row) last.text += next[at];
    else built.push(row === undefined ? { text: next[at] } : { text: next[at], row });
    return built;
  }, []);
};

// Same each run, or ask me each run.
export const switchAsking = (values: RoutineFormValues, at: number): RoutineFormValues => {
  const recorded = (values.recorded ?? []).map((row, index) => (index === at ? { ...row, ask: !row.ask } : row));
  return { ...values, instructions: askingText(recorded) + stepsText(values), recorded };
};

export const suggestedForm = ({ name, instructions, mascotId, schedule }: RoutineDraft, suggestionId: string): RoutineFormValues =>
  withSchedule({ ...blankForm(name, instructions, mascotId ?? null), suggestionId }, schedule);

export const toDraft = (form: RoutineFormValues): RoutineDraft => {
  const { name, instructions, kind, time, date, days, day, mascotId, onlySomeSites, sites, inCloud } = form;
  const schedule = (): RoutineSchedule => {
    switch (kind) {
      case "manual":
        return { kind };
      case "once":
        return { kind, at: new Date(`${date}T${time}`).getTime() };
      case "daily":
        return { kind, time };
      case "weekly":
        return { kind, days, time };
      case "monthly":
        return { kind, day, time };
    }
  };
  return {
    name,
    instructions,
    schedule: schedule(),
    mascotId,
    sites: onlySomeSites ? sites : [],
    ...(inCloud && kind !== "manual" ? { inCloud } : {}),
  };
};

// What each part of a routine is, among the form's values. The name is its own part, so changing any other sends no
// name, and main keeps the one it has.
const PART_FIELDS = {
  does: ["instructions", "recorded"],
  when: ["kind", "time", "date", "days", "day", "inCloud"],
  who: ["mascotId"],
  where: ["onlySomeSites", "sites"],
  name: ["name"],
} as const satisfies Record<RoutinePart, readonly (keyof RoutineFormValues)[]>;

// The routine as it is now with one part as it was changed, so a part changed on its own never puts back anything
// else from when it was opened.
export const withRoutinePart = (current: RoutineFormValues, changed: RoutineFormValues, part: RoutinePart): RoutineFormValues => ({
  ...current,
  name: "",
  ...Object.fromEntries(PART_FIELDS[part].map((field) => [field, changed[field]])),
});

// Save as routine from a chat: what to do is only what the user asked for, and who does it is the chat's mascot.
export const chatRoutine = (
  title: string,
  messages: Array<{ role: string; content: string }>,
  mascotId: string | null,
): RoutineFormValues =>
  blankForm(
    title,
    messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n\n"),
    mascotId,
  );

// --- The list --------------------------------------------------------------------------------------------------------

// Grouped by what matters, in this order. A one-off that has run waits with those that only run when asked.
export type RoutineGroupKey = "needs-you" | "running" | "scheduled" | "paused" | "manual";

const ROUTINE_GROUPS: { key: RoutineGroupKey; label: string }[] = [
  { key: "needs-you", label: "Needs you" },
  { key: "running", label: "Running" },
  { key: "scheduled", label: "Scheduled" },
  { key: "paused", label: "Paused" },
  { key: "manual", label: "Only when you ask" },
];

const groupOf = (routine: Routine): RoutineGroupKey => {
  if (routine.status === "needs-approval") return "needs-you";
  if (routine.status === "running" || routine.status === "queued") return "running";
  if (routine.paused) return "paused";
  return routine.scheduleSpec.kind !== "manual" && routine.nextRunAt !== null ? "scheduled" : "manual";
};

// Empty groups are left out. Scheduled ones are soonest first, and the rest keep the order they came in.
export const groupRoutines = (routines: Routine[]): { key: RoutineGroupKey; label: string; routines: Routine[] }[] =>
  ROUTINE_GROUPS.map(({ key, label }) => {
    const mine = routines.filter((routine) => groupOf(routine) === key);
    return { key, label, routines: key === "scheduled" ? mine.sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0)) : mine };
  }).filter((group) => group.routines.length > 0);

// A row's second line. One waiting for you says what it wants, in the card's own sentence, and a running one where it
// is. Otherwise it's the schedule, which the group already says for one only run when asked, then how the last run
// went, in `ask` when it went wrong.
export const routineLine = (routine: Routine): { words: string | null; last: { text: string; ask: boolean } | null } => {
  const run = routine.latestRun;
  if (routine.status === "needs-approval")
    return { words: run?.approval ? withSiteNames(run.approval.text) : routine.lastResult, last: null };
  if (routine.status === "running") return { words: run?.statusLine ?? run?.steps.at(-1)?.text ?? "Starting..", last: null };
  const wrong = !routine.cloudNote && (run?.status === "failed" || run?.status === "interrupted");
  return {
    words: routine.scheduleSpec.kind === "manual" ? null : sentenceText(scheduleSentence(formFor(routine))),
    last: { text: routine.cloudNote ?? routine.lastResult, ask: wrong },
  };
};

// --- Where it is -----------------------------------------------------------------------------------------------------

// The Routines page at a place. It moves around itself this way too, so where it is lives in its tab's param, which is
// how Back and a restored session find it.
export const openRoutines = (place: RoutinePlace) => void window.chromeAPI.browser.openPage("routines", { param: routinesParam(place) });

// A new routine started from elsewhere, such as Show Berry how, a suggestion or a mascot's page, with its answers filled
// in. The steps take it when they show, whichever tab they're in.
export const NEW_ROUTINE_EVENT = "blueberry:new-routine";
let started: RoutineFormValues | null = null;

export const startRoutine = (values: RoutineFormValues = blankForm()) => {
  started = values;
  window.dispatchEvent(new Event(NEW_ROUTINE_EVENT));
  openRoutines({ page: "new" });
};

export const takeStartedRoutine = (): RoutineFormValues | null => {
  const values = started;
  started = null;
  return values;
};
