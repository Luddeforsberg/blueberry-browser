import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RunRecord {
  job: string;
  ability: string;
  run: number;
  endedBy: "finished" | "timeout" | "budget" | "error";
  error: string | null;
  // Set when the job hit the step limit and was told to keep going.
  firstError?: string | null;
  model: string;
  modelCalls: number;
  toolCalls: number;
  tools: string[];
  lastToolResults: string[];
  peakInputTokens: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  answer: string;
  steps: string[];
  endUrl: string | null;
  endState: unknown;
  rendering: unknown;
  refused: string[];
  screenshot: string | null;
}

// Written by a person or agent who has looked at the end state, keyed by `job#run`.
interface Score {
  outcome: "Done" | "Partly" | "Failed" | "Blocked";
  reason: string;
  // The answer sounded sure of itself and was wrong.
  confidentlyWrong?: boolean;
}

const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|");
const clip = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

export const writeReport = (results: string, date: string) => {
  const runsFile = join(results, `${date}.runs.json`);
  if (!existsSync(runsFile)) return;
  const runs: RunRecord[] = JSON.parse(readFileSync(runsFile, "utf8"));
  const scoresFile = join(results, `${date}.scores.json`);
  const scores: Record<string, Score> = existsSync(scoresFile)
    ? JSON.parse(readFileSync(scoresFile, "utf8"))
    : {};
  const notesFile = join(results, `${date}.notes.md`);
  const notes = existsSync(notesFile) ? readFileSync(notesFile, "utf8") : "";

  const scoreOf = (run: RunRecord) => scores[`${run.job}#${run.run}`];
  const count = (outcome: Score["outcome"]) =>
    runs.filter((run) => scoreOf(run)?.outcome === outcome).length;
  const total = runs.reduce((sum, run) => sum + run.costUsd, 0);

  const lines = [
    `# Berry on real websites, ${date}`,
    "",
    `${runs.length} runs: ${count("Done")} Done, ${count("Partly")} Partly, ${count("Failed")} Failed, ${count("Blocked")} blocked by the site. Estimated cost $${total.toFixed(2)}.`,
    "",
    notes,
    "",
    "## Runs",
    "",
    "| Job | Run | Score | Why | Model calls | Tool calls | Peak input tokens | Seconds | Est. cost |",
    "|---|---|---|---|---|---|---|---|---|",
    ...runs.map((run) => {
      const score = scoreOf(run);
      const outcome = `${score?.outcome ?? "Unscored"}${score?.confidentlyWrong ? " ⚠️ confidently wrong" : ""}`;
      return `| ${run.job} | ${run.run} | ${outcome} | ${cell(score?.reason ?? "")} | ${run.modelCalls} | ${run.toolCalls} | ${run.peakInputTokens} | ${Math.round(run.durationMs / 1000)} | $${run.costUsd.toFixed(3)} |`;
    }),
    "",
    "## Answers and end states",
    "",
    ...runs.flatMap((run) => [
      `### ${run.job}, run ${run.run}`,
      "",
      `Ability: ${run.ability}. Ended by: ${run.endedBy}${run.error ? ` (${run.error})` : ""}. End address: ${run.endUrl ?? "none"}.`,
      "",
      `End state read from the page: \`${cell(clip(JSON.stringify(run.endState ?? null), 400))}\``,
      "",
      ...(run.refused.length
        ? [`Refused by the safety guard: ${run.refused.join(", ")}`, ""]
        : []),
      `Answer: ${clip(run.answer.trim(), 1200) || "(none)"}`,
      "",
      `Tools: ${run.tools.map((call) => `\`${cell(clip(call, 90))}\``).join(", ") || "none"}`,
      "",
      ...(run.screenshot
        ? [`![End state of ${run.job}](${run.screenshot})`, ""]
        : []),
    ]),
  ];
  writeFileSync(join(results, `${date}.md`), lines.join("\n") + "\n");
};
