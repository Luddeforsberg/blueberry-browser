import type { RoutinePart } from "@shared/routinePlaces";
import type { Mood } from "@common/components/moods";
import type { RoutineFormValues } from "../routinesView";

// Part of making a routine (RoutineSteps.tsx): its steps, their questions, and what's wrong with an answer.

export const STEPS: RoutinePart[] = ["does", "when", "who", "where"];

export const QUESTIONS: Record<RoutinePart, { question: string; hint?: string; mood: Mood }> = {
  does: {
    question: "What should I do?",
    hint: "In your own words, as in a chat. I work in tabs of my own, and ask before acting just as a chat does.",
    mood: "curious",
  },
  when: { question: "When?", mood: "rest" },
  who: { question: "Who does it?", hint: "Whoever does it keeps to its own instructions and limits.", mood: "rest" },
  where: {
    question: "Where may I go?",
    hint: "I can only go where I’m let. I still ask before anything risky, and no limit changes that.",
    mood: "rest",
  },
  name: { question: "What’s it called?", hint: "Call it anything you like. A name you choose is never changed for you.", mood: "rest" },
};

// While there's a value marked in the steps, the line under the question says what pressing it does.
export const hintFor = (part: RoutinePart, values: RoutineFormValues) =>
  part === "does" && (values.recorded?.length ?? 0) > 0
    ? "In your own words, as in a chat. Press a marked word to choose whether I ask for it each run."
    : QUESTIONS[part].hint;

const isTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

// What's wrong with the answer to a step, if anything, so its button says why it's off.
export const blocked = (part: RoutinePart, values: RoutineFormValues): string | null => {
  if (part === "does" && !values.instructions.trim()) return "Say what it should do.";
  if (part === "name" && !values.name.trim()) return "Give it a name.";
  if (part === "when" && values.kind !== "manual" && !isTime(values.time)) return "Choose a time.";
  if (part === "when" && values.kind === "weekly" && values.days.length === 0) return "Choose at least one day.";
  if (part === "when" && values.kind === "once" && !values.date) return "Choose a day.";
  if (part === "where" && values.onlySomeSites && values.sites.length === 0) return "Name at least one site, or choose Anywhere.";
  return null;
};

export type Set = (patch: Partial<RoutineFormValues>) => void;
