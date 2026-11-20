import type { MascotProfile } from "@shared/library";
import type { MascotPart } from "@shared/mascotsPlaces";
import { BERRY } from "@shared/mascots";
import type { Mood } from "@common/components/moods";
import { sitesFrom, type MascotFormValues } from "../mascotsView";

// Part of making a mascot (MascotSteps.tsx): its steps, their questions, and what's wrong with an answer.

export const api = () => window.chromeAPI.mascots;

export const STEPS: MascotPart[] = ["look", "name", "purpose", "limits"];

export const QUESTIONS: Record<MascotPart, { question: string; hint: string; label: string; mood: Mood }> = {
  look: { question: "What do I look like?", hint: "Pick a berry, and something to wear if you like.", label: "Look", mood: "curious" },
  name: { question: "What’s my name?", hint: "It’s what you’ll see in the prompt box and beside my replies.", label: "Name", mood: "rest" },
  purpose: {
    question: "What should I do for you?",
    hint: "In your own words, as you’d tell a colleague. I read it before every job.",
    label: "What it’s for",
    mood: "curious",
  },
  limits: {
    question: "Where can I go, and what can I do there?",
    hint: "I can always read the pages I’m allowed on. I still ask before anything risky, and no limit changes that.",
    label: "Limits",
    mood: "rest",
  },
};

// The mascot as it's being made, to draw.
export const asProfile = (values: MascotFormValues): MascotProfile => ({
  ...BERRY,
  id: values.id ?? "new",
  name: values.name.trim() || "New mascot",
  look: { palette: values.palette, accessory: values.accessory },
  instructions: values.instructions,
  sites: sitesFrom(values),
  tools: values.tools,
});

// What's wrong with the answer to a step, if anything, so its button says why it's off.
export const blocked = (part: MascotPart, values: MascotFormValues): string | null => {
  if (part === "name" && !values.name.trim()) return "Give it a name.";
  if (part === "purpose" && !values.instructions.trim()) return "Say what it’s for.";
  if (part === "limits" && values.onlySomeSites && values.sites.length === 0) return "Name at least one site, or choose Any site.";
  return null;
};

export type Set = (patch: Partial<MascotFormValues>) => void;
