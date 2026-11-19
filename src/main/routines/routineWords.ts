import type { StoredRoutine } from "./RoutineStore";
import type { RoutineRun } from "../../shared/library";

// What a routine's run is told, and how its last result reads on the Routines page.

const MAX_RESULT_PREVIEW = 80;

export const prompt = (routine: StoredRoutine, now: number): string => routinePrompt(routine, `at ${new Date(now).toString()}`);

// What a run is told. A run in the cloud is written before it's due, so it says where rather than when.
export const routinePrompt = (
  { name, instructions, sites }: Pick<StoredRoutine, "name" | "instructions" | "sites">,
  when: string,
): string =>
  `This is a routine the user set up earlier, running by itself ${when}. ` +
  "Nobody is watching right now, so don't ask questions in words: anything you need from the user goes through ask_user or hand_to_user, which wait for them. Do what it says in your own tabs, " +
  "then end with a short report of what you found and did, and anything you couldn't do.\n\n" +
  (sites.length > 0 ? `It may only use ${sites.join(", ")}, and anything else will be refused.\n\n` : "") +
  `The routine, called “${name}”:\n${instructions}`;

const dayOf = (at: number, now: number): string => {
  const date = new Date(at);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const firstLine = (text: string): string => {
  const line = text.split("\n").find((part) => part.trim()) ?? "";
  const plain = line.replace(/[*_#`>]/g, "").trim();
  return plain.length > MAX_RESULT_PREVIEW ? `${plain.slice(0, MAX_RESULT_PREVIEW - 1).trimEnd()}…` : plain;
};

export const lastResult = (run: RoutineRun | null, now: number): string => {
  if (!run) return "Not run yet";
  const day = dayOf(run.startedAt, now);
  switch (run.status) {
    case "running":
      return "Working on it";
    case "needs-approval":
      return run.approval?.question || run.approval?.handoff ? "Waiting for you" : "Waiting for your OK";
    case "finished":
      return `${day}: ${run.result ? firstLine(run.result) : "nothing to report"}`;
    case "failed":
      return `${day}: couldn’t finish`;
    case "stopped":
      return `${day}: you stopped it`;
    case "interrupted":
      return `${day}: the app closed before it finished`;
  }
};
