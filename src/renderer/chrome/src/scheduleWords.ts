import type { RoutineSchedule } from "@shared/library";
import type { RoutineFormValues } from "./routinesView";

// Part of routinesView.ts: how often and when, in words.

// How often, as the pills show it. Weekdays is Weekly with Monday to Friday chosen.
export type HowOften = RoutineSchedule["kind"] | "weekdays";

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const TIME_CHIPS = ["07:00", "08:00", "09:00", "12:00", "17:00", "21:00"];

const isWeekdays = (days: number[]) => days.length === WEEKDAYS.length && WEEKDAYS.every((day) => days.includes(day));

export const howOften = ({ kind, days }: Pick<RoutineFormValues, "kind" | "days">): HowOften =>
  kind === "weekly" && isWeekdays(days) ? "weekdays" : kind;

// Weekly from Weekdays starts again on one day, today's, so the two pills never look the same.
export const withHowOften = (values: RoutineFormValues, often: HowOften): Partial<RoutineFormValues> => {
  if (often === "weekdays") return { kind: "weekly", days: WEEKDAYS };
  if (often === "weekly" && (values.kind !== "weekly" || isWeekdays(values.days))) return { kind: "weekly", days: [new Date().getDay()] };
  return { kind: often };
};

// Sunday first, as the schedule counts them.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ordinal = (day: number) => {
  const tens = day % 100;
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${day}${tens >= 11 && tens <= 13 ? "th" : (suffixes[day % 10] ?? "th")}`;
};

const listed = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

// The schedule read back as a sentence, each part that was chosen marked, as in "Every **weekday** at **09:00**".
export type SentencePart = { text: string; chosen?: boolean };

export const scheduleSentence = ({
  kind,
  time,
  date,
  days,
  day,
}: Pick<RoutineFormValues, "kind" | "time" | "date" | "days" | "day">): SentencePart[] => {
  const at: SentencePart[] = [{ text: " at " }, { text: time, chosen: true }];
  switch (kind) {
    case "manual":
      return [{ text: "Only when you " }, { text: "ask", chosen: true }];
    case "once": {
      const on = new Date(`${date}T00:00`);
      const words = Number.isNaN(on.getTime())
        ? date
        : on.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      return [{ text: "Once, on " }, { text: words, chosen: true }, ...at];
    }
    case "daily":
      return [{ text: "Every " }, { text: "day", chosen: true }, ...at];
    case "weekly": {
      if (isWeekdays(days)) return [{ text: "Every " }, { text: "weekday", chosen: true }, ...at];
      if (days.length === 7) return [{ text: "Every " }, { text: "day", chosen: true }, ...at];
      // Monday first, as the week reads.
      const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return [{ text: "Every " }, { text: listed(sorted.map((each) => DAY_NAMES[each])) || "week", chosen: true }, ...at];
    }
    case "monthly":
      return [{ text: "On the " }, { text: ordinal(day), chosen: true }, { text: " of every month" }, ...at];
  }
};

export const sentenceText = (parts: SentencePart[]) => parts.map(({ text }) => text).join("");

// The whole routine as one sentence: "Every weekday at 09:00, Berry will read SVT…". The user's words stay as they
// are, except a capital at the start of an ordinary first word.
export const readBack = (
  values: Pick<RoutineFormValues, "kind" | "time" | "date" | "days" | "day" | "instructions">,
  name: string,
): string => {
  const when = values.kind === "manual" ? "When you ask" : sentenceText(scheduleSentence(values));
  const words = values.instructions.trim().replace(/\s+/g, " ");
  const first = /^[A-Z][a-z]+\b/.exec(words)?.[0];
  const said = first ? words.charAt(0).toLowerCase() + words.slice(1) : words;
  return `${when}, ${name} will ${said}`;
};

// When it's next, in a few words: "today 17:00", "tomorrow 09:00", "Tue 09:00", or the date further off.
export const nextInWords = (at: number, now = Date.now()): string => {
  const time = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${new Date(at).toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
  return `${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
};
