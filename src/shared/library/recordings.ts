// What Berry saw while it was being shown something, and the routine it becomes. Part of library.ts, which everything
// imports it from.

// One thing Berry saw the user do while it was being shown something. Only ever in memory, and only in main and the chrome.
export type TrailKind =
  | "went"
  | "searched"
  | "clicked"
  | "typed"
  | "secret"
  | "chose"
  | "ticked"
  | "pressed"
  | "switched"
  | "frame"
  | "file"
  | "copied"
  | "pasted";

export interface TrailStep {
  id: string;
  kind: TrailKind;
  // The note, in plain words. Code writes these, with `label` and `value` the only parts that came from a page or a field.
  text: string;
  site: string;
  // The page's address without its query or fragment, or where a click led. Empty on a page's front door.
  path: string;
  // What the page calls the thing. Untrusted, and a name only.
  label: string;
  // What the user typed, chose or copied. Never set for a secret field.
  value: string;
  // Typed, and then sent with Enter.
  submitted?: boolean;
}

type RecordingStatus = "idle" | "recording" | "review" | "drafting";

export interface RecordingState {
  status: RecordingStatus;
  startedAt: number | null;
  steps: TrailStep[];
  // It stopped by itself, because it had seen as much as it can keep or had run for too long.
  cut: "full" | "time" | null;
  // Why the last try at writing it up failed.
  error: string | null;
}

// Something in the instructions that looks like it should change from run to run. `value` is in the instructions as it stands.
export interface RecordedChange {
  label: string;
  value: string;
}

// What a recording becomes, to fill in the routine form. The sites come from the trail, in code, and never from the model.
export interface RecordedDraft {
  name: string;
  instructions: string;
  sites: string[];
  changes: RecordedChange[];
}

export type RecordedDraftResult = { ok: true; draft: RecordedDraft } | { ok: false; error: string };
