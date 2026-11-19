import React, { useEffect, useState } from "react";
import type { ChatStep, SaidOnTheWay } from "@shared/library";
import { ChevronDown, ChevronRight } from "lucide-react";
import { clock, foldedWords, keptWhenFolded, latestEntries, workEntries, type WorkEntry } from "../workLine";
import { trailFor } from "../stepTrail";
import { Pips } from "@common/components/Pips";
import { STEP_PIPS, type PipMark, type PipPattern } from "@common/components/pipPatterns";
import { useStill } from "@common/components/motion";
import { cn } from "@common/lib/utils";
import { FOCUS } from "./chipClass";

// Part of the message layout (ChatMessage.tsx): a reply's steps, while it works and folded once it's done.

// Words for work happening right now: a band of `ink` passes through them. With the pips beside them they're one thing
// moving (DESIGN.md section 7), and they hold still as the pips do, in plain `ink`.
export const LiveWords: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => {
  const still = useStill();
  return (
    <span className={cn(still ? "text-ink" : "bg-shimmer bg-[length:260%_100%] bg-clip-text text-transparent animate-shimmer", className)}>
      {children}
    </span>
  );
};

// One line of what a mascot did or is doing, in its words, after a pip mark. The live one has moving pips and its
// words shimmer, and finished ones are `ink-3`.
export const StepLine: React.FC<{ pips: PipPattern | PipMark; live?: boolean; ask?: boolean; children: React.ReactNode }> = ({
  pips,
  live = false,
  ask = false,
  children,
}) => (
  <span className={cn("flex items-start gap-3 font-mono text-11.5", live ? "text-ink" : "text-ink-3")}>
    <span className={cn("h-4 shrink-0 flex items-center", ask && "text-ask")}>
      <Pips pattern={pips} />
    </span>
    {live ? (
      <LiveWords className="min-w-0 [overflow-wrap:anywhere]">{children}</LiveWords>
    ) : (
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    )}
  </span>
);

const StepItem: React.FC<{ step: ChatStep }> = ({ step }) => {
  const { live, done } = STEP_PIPS[step.kind ?? "plain"];
  return (
    <li>
      <StepLine pips={step.done ? done : live} live={!step.done} ask={!step.done && step.kind === "ask"}>
        {step.shown ?? step.text}
        {!step.done && <span className="sr-only"> (in progress)</span>}
      </StepLine>
    </li>
  );
};

const StepList: React.FC<{ steps: ChatStep[] }> = ({ steps }) => (
  <ol aria-label="Steps" className="flex flex-col gap-[9px]">
    {steps.map((step, index) => (
      <StepItem key={index} step={step} />
    ))}
  </ol>
);

// The quiet line that stands for steps not showing, and opens them.
const FoldLine: React.FC<{ open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ open, onToggle, children }) => (
  <button
    type="button"
    aria-expanded={open}
    onClick={onToggle}
    className={cn(
      "-mx-1.5 px-1.5 h-6 w-fit flex items-center gap-1.5 rounded-row font-mono text-11.5 text-ink-2 transition-colors hover:text-ink",
      FOCUS,
    )}
  >
    <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-fast", !open && "-rotate-90")} strokeWidth={1.75} />
    {children}
  </button>
);

// What a mascot did on the way to a reply, outside a chat: a routine's run keeps this.
export const StepTrail: React.FC<{ steps: ChatStep[]; running?: boolean; cutShort?: boolean }> = ({
  steps,
  running = false,
  cutShort = false,
}) => {
  const [open, setOpen] = useState(false);
  const { shown, line } = trailFor(steps, { running, cutShort, open });
  return (
    <div className="flex flex-col items-start gap-2">
      {line && (
        <FoldLine open={open} onToggle={() => setOpen(!open)}>
          {line}
        </FoldLine>
      )}
      {shown.length > 0 && <StepList steps={shown.map(({ step }) => step)} />}
    </div>
  );
};

// Ticks while a reply works, in mono like the line it's on.
const Elapsed: React.FC<{ since: number }> = ({ since }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="text-ink-3 tabular-nums">{clock(now - since)}</span>;
};

// Steps of one kind in a row on one site, as one line that opens to show them.
const GroupItem: React.FC<{ entry: Extract<WorkEntry, { kind: "group" }> }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn("-mx-1 px-1 max-w-full flex items-center gap-1 rounded-row text-left transition-colors hover:bg-hover", FOCUS)}
      >
        <StepLine pips={STEP_PIPS[entry.stepKind].done}>{entry.words}</StepLine>
        <ChevronRight
          aria-hidden
          className={cn("size-3 shrink-0 text-faint transition-transform duration-fast", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <ol aria-label={entry.words} className="mt-2 pl-[22px] flex flex-col gap-2">
          {entry.steps.map((step, index) => (
            <StepItem key={index} step={step} />
          ))}
        </ol>
      )}
    </li>
  );
};

// The steps and what the mascot said between them, where it said it, in its own voice at 15px.
const Entries: React.FC<{ entries: WorkEntry[]; status?: React.ReactNode }> = ({ entries, status }) => (
  <ol aria-label="Steps" className="flex flex-col gap-2">
    {entries.map((entry, index) =>
      entry.kind === "said" ? (
        <li key={index} className="py-0.5 text-15 leading-[1.55] text-ink-2 [overflow-wrap:anywhere]">
          {entry.text}
        </li>
      ) : entry.kind === "group" ? (
        <GroupItem key={index} entry={entry} />
      ) : (
        <StepItem key={index} step={entry.step} />
      ),
    )}
    {status && <li>{status}</li>}
  </ol>
);

// The line that leads a reply for its job's whole life (DESIGN.md section 10, Main chat). While it works: the moving
// pips, Working and how long, then its latest steps, and the line opens the rest.
export const WorkingLine: React.FC<{
  steps: ChatStep[];
  said: SaidOnTheWay[];
  status: React.ReactNode;
  startedAt?: number | undefined;
  onShowWork?: (() => void) | undefined;
}> = ({ steps, said, status, startedAt, onShowWork }) => {
  const [open, setOpen] = useState(false);
  const entries = workEntries(steps, said);
  const { shown, hidden } = latestEntries(entries);
  const head = (
    <>
      <span className="h-4 shrink-0 flex items-center">
        <Pips pattern="think" />
      </span>
      <span className="flex items-center gap-2">
        Working
        {startedAt !== undefined && <Elapsed since={startedAt} />}
      </span>
    </>
  );
  return (
    <section aria-label="Working" className="flex flex-col gap-2">
      <div className="h-6 flex items-center gap-2">
        {hidden ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Working, showing every step" : "Working, show the earlier steps"}
            onClick={() => setOpen(!open)}
            className={cn(
              "-mx-1 px-1 h-6 min-w-0 flex items-center gap-3 rounded-row font-mono text-11.5 text-ink transition-colors hover:bg-hover",
              FOCUS,
            )}
          >
            {head}
            <ChevronRight
              aria-hidden
              className={cn("size-3 text-faint transition-transform duration-fast", open && "rotate-90")}
              strokeWidth={1.75}
            />
          </button>
        ) : (
          <p className="h-6 min-w-0 flex items-center gap-3 font-mono text-11.5 text-ink">{head}</p>
        )}
        {/* Brings back the working view after Hide work. */}
        {onShowWork && (
          <button
            type="button"
            onClick={onShowWork}
            className={cn(
              "ml-auto -mr-1.5 h-6 px-1.5 shrink-0 rounded-row text-13 text-ink-3 transition-colors hover:bg-hover hover:text-ink",
              FOCUS,
            )}
          >
            Show work
          </button>
        )}
      </div>
      <div role="status">
        <Entries entries={open ? entries : shown} status={status} />
      </div>
    </section>
  );
};

// When it ends, the line folds where it is: "Worked 0:48", then "7 steps on klm.com" and a faint arrow, in `ink-3`.
// Pressing it opens the steps in place, above the answer. Folded, the steps worth seeing on any trail still show.
export const FoldedLine: React.FC<{ steps: ChatStep[]; said: SaidOnTheWay[]; took?: number | undefined }> = ({ steps, said, took }) => {
  const [open, setOpen] = useState(false);
  const words = foldedWords(steps, took);
  const kept = keptWhenFolded(steps);
  return (
    <section aria-label="How it got there" className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-1 px-1 h-6 w-fit max-w-full flex items-center gap-2 rounded-row font-mono text-11.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink-2",
          FOCUS,
        )}
      >
        {words.worked && <span className="shrink-0 tabular-nums">{words.worked}</span>}
        <span className="min-w-0 truncate">{words.steps}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3 shrink-0 text-faint transition-transform duration-fast", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open ? <Entries entries={workEntries(steps, said)} /> : kept.length > 0 && <StepList steps={kept} />}
    </section>
  );
};
