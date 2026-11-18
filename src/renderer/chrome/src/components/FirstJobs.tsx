import React from "react";
import { Check, ChevronRight } from "lucide-react";
import { firstJobRows, type FirstJob } from "@shared/firstRun";
import { buttonVariants } from "@common/components/Button";
import { LABEL } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { useShell } from "../contexts/ShellContext";

// DESIGN.md section 10, First run, then the new tab: a few first things to do, where suggestions will be once there's
// something to suggest from. A row is done when main has seen it happen, not when it's pressed, and the group goes once
// every row is done or Hide is pressed.

export const FIRST_JOB_PROMPT = "Find the cheapest USB-C cable, and ask me before buying";

const WORDS: Record<FirstJob, { title: string; why: string; done: string }> = {
  key: {
    title: "Give Berry a key",
    why: "Without one I can’t answer. It’s kept encrypted on this computer.",
    done: "Done. I can think now.",
  },
  history: {
    title: "Bring your history in",
    why: "Then I can suggest things from what you already do.",
    done: "Done. I’ll use it to suggest things.",
  },
  try: { title: FIRST_JOB_PROMPT, why: "A first job. I’ll stop and ask before I click Buy.", done: "Done. That was your first job." },
  meet: {
    title: "Meet a mascot that only reads",
    why: "Plain Words explains the page you’re on, and can’t click or type.",
    done: "Done. You’ve met Plain Words.",
  },
};

const Ring: React.FC<{ done: boolean }> = ({ done }) => (
  <span
    aria-hidden
    className={cn(
      "size-[18px] shrink-0 grid place-items-center rounded-full",
      done ? "bg-ink text-ground" : "shadow-[inset_0_0_0_1.5px_rgb(var(--faint))]",
    )}
  >
    {done && <Check className="size-[11px]" strokeWidth={2.6} />}
  </span>
);

export const FirstJobs: React.FC<{ onPress: (job: FirstJob) => void }> = ({ onPress }) => {
  const { settings, updateSettings } = useShell();
  const rows = firstJobRows(settings.firstJobs, settings.firstJobsDone);
  if (rows.length === 0) return null;
  const done = rows.filter((row) => row.done).length;
  return (
    <section aria-labelledby="new-tab-first-jobs">
      <h2 className="mx-3 mb-1.5 flex items-center gap-2">
        <span id="new-tab-first-jobs" className={LABEL}>
          First jobs
        </span>
        <span className="font-mono text-11.5 text-ink-3 tabular-nums">
          {done} of {rows.length}
        </span>
        <button
          type="button"
          onClick={() => updateSettings({ firstJobs: [] })}
          className="ml-auto h-[22px] -mr-1 px-1.5 rounded-[7px] text-13 text-ink-2 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Hide
        </button>
      </h2>
      <ul className="flex flex-col gap-0.5">
        {rows.map(({ job, done }) => {
          const { title, why, done: doneWords } = WORDS[job];
          const words = (
            <>
              <span className="ml-1 mr-[3px] flex">
                <Ring done={done} />
              </span>
              <span className="flex-1 min-w-0">
                <span className={cn("block truncate text-14 font-medium", done ? "text-ink-3 line-through decoration-ink-3" : "text-ink")}>
                  {title}
                </span>
                <span className="block truncate text-13 text-ink-2">{done ? doneWords : why}</span>
              </span>
            </>
          );
          return (
            <li
              key={job}
              className={cn(
                "bridged group flex rounded-[14px] transition-[background-color,box-shadow]",
                !done && "hover:bg-sheet hover:shadow-chip focus-within:bg-sheet focus-within:shadow-chip",
              )}
            >
              {done ? (
                <div className="flex-1 min-w-0 py-[9px] pl-3 pr-2 flex items-center gap-[13px]">
                  {words}
                  <span className="sr-only">, done</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPress(job)}
                  className="flex-1 min-w-0 py-[9px] pl-3 pr-2 flex items-center gap-[13px] rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {words}
                  {/* What pressing the row does, drawn as a button on the row you're on. The row is the button. */}
                  <span aria-hidden className="shrink-0 grid justify-items-end items-center [&>*]:[grid-area:1/1]">
                    <ChevronRight
                      className="size-3.5 text-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                      strokeWidth={1.75}
                    />
                    <span
                      className={cn(
                        buttonVariants({ variant: "raised", size: "sm" }),
                        "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                      )}
                    >
                      Try it
                    </span>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
