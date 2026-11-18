import React, { useState } from "react";
import { ChevronLeft, Plus, X } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import { normaliseSite } from "@shared/mascots";
import type { Mood } from "@common/components/Mascot";
import { Button } from "@common/components/Button";
import { BIG_CARD, BIG_SHELL } from "@common/components/cardShell";
import { useStill } from "@common/components/motion";
import { LABEL } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { BerrySpot } from "./Berry";
import { Tooltip } from "@common/components/Tooltip";

// DESIGN.md section 10, Your mascots and Routines: making one is questions asked one at a time, each a card set into a
// shell like the prompt box, with the mascot standing on it. Changing one part later is the same card, alone. Making a
// mascot and making a routine both use these.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";
// The card is like the prompt box, so as there, the caret marks focus in a field (DESIGN.md section 8).
export const FIELD = "w-full rounded-sheet bg-card-2 text-ink caret-ink outline-none placeholder:text-faint";

// The card in its shell, with the mascot standing on its top edge. `motionKey` changes when the contents do, so they
// slide in from the side they came from, or fade with the motion held still. The first run's mascot stands at 64px, and
// `aside` makes the card 680px with a picture beside the answers, as Make it yours has.
export const StepCard: React.FC<{
  mascot: MascotProfile | null;
  mood: Mood;
  label: string;
  action?: React.ReactNode;
  question: string;
  hint?: string;
  motionKey?: string;
  from?: "next" | "back";
  nav: React.ReactNode;
  mascotSize?: number;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ mascot, mood, label, action, question, hint, motionKey, from = "next", nav, mascotSize = 72, aside, children }) => {
  const still = useStill();
  return (
    <section aria-label={question} className={cn(aside ? "w-[680px]" : "w-[520px]", "max-w-full mx-auto flex flex-col items-center")}>
      {mascot && (
        <div className="relative z-[1] -mb-1">
          <BerrySpot size={mascotSize} mascot={mascot} mood={mood} />
        </div>
      )}
      <div className={cn(BIG_SHELL, "w-full")}>
        <div className={cn(BIG_CARD, "bg-card overflow-hidden", aside ? "flex" : "px-5 pt-4 pb-5")}>
          <div
            key={motionKey}
            className={cn(
              still ? "animate-step-fade" : from === "next" ? "animate-step-next" : "animate-step-back",
              aside && "flex-1 min-w-0 px-5 pt-4 pb-5",
            )}
          >
            <div className="h-7 flex items-center justify-between">
              {/* The step as a count in mono, or the part being changed in words. */}
              <span className={/^\d/.test(label) ? "font-mono text-11.5 text-ink-3" : LABEL}>{label}</span>
              {action}
            </div>
            <h2 className={cn("mt-0.5 mb-1 text-20 font-semibold", !aside && "text-center")}>{question}</h2>
            {hint && <p className={cn("mb-4 max-w-[380px] text-13 leading-[1.45] text-ink-2", !aside && "mx-auto text-center")}>{hint}</p>}
            {children}
          </div>
          {aside}
        </div>
        {nav}
      </div>
    </section>
  );
};

// Under the card, in the shell: a round Back on the left, where the steps are in the middle, and the button on the right.
export const StepNav: React.FC<{ step: number; steps: number; onBack?: () => void; children: React.ReactNode }> = ({
  step,
  steps,
  onBack,
  children,
}) => (
  <div className="relative h-[46px] px-1.5 flex items-center justify-between">
    <button
      type="button"
      aria-label="Back a step"
      onClick={onBack}
      className={cn(
        "size-[30px] grid place-items-center rounded-full bg-sheet text-ink-2 shadow-rim transition-[background-color,transform] duration-fast hover:text-ink active:scale-[.96]",
        FOCUS,
        !onBack && "invisible",
      )}
    >
      <ChevronLeft aria-hidden className="size-[13px]" strokeWidth={1.75} />
    </button>
    <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-[5px]">
      {Array.from({ length: steps }, (_, index) => (
        <i
          key={index}
          className={cn(
            "h-1.5 rounded-[3px] transition-[width] duration-fast",
            index === step ? "w-[18px] bg-ink" : index < step ? "w-1.5 bg-ink-3" : "w-1.5 bg-dot",
          )}
        />
      ))}
    </span>
    {children}
  </div>
);

// Changing one part: Cancel and Save in the shell. Save says why it's off, if it is.
export const PartNav: React.FC<{ off: string | null; saving: boolean; onCancel: () => void; onSave: () => void }> = ({
  off,
  saving,
  onCancel,
  onSave,
}) => (
  <div className="h-[46px] px-1.5 flex items-center justify-between">
    <Button variant="raised" onClick={onCancel}>
      Cancel
    </Button>
    <Tooltip words={off}>
      <Button disabled={!!off || saving} onClick={onSave}>
        Save
      </Button>
    </Tooltip>
  </div>
);

// A site as a chip with its ×, and Add a site, which becomes a field. One that isn't a site stays in the field and is
// said under the chips, and so is `problem`, such as no site at all where one is needed.
export const SiteChips: React.FC<{ sites: string[]; onChange: (sites: string[]) => void; problem?: string | null }> = ({
  sites,
  onChange,
  problem,
}) => {
  const [adding, setAdding] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const add = (text: string): boolean => {
    if (!text.trim()) {
      setAdding(null);
      setBad(null);
      return true;
    }
    const site = normaliseSite(text);
    if (!site) {
      setBad(text.trim());
      return false;
    }
    if (!sites.includes(site)) onChange([...sites, site]);
    setAdding(null);
    setBad(null);
    return true;
  };
  const said = bad ? `“${bad}” doesn’t look like a site. Try something like example.com.` : problem;
  return (
    <>
      <ul aria-label="Sites it may use" className="flex flex-wrap justify-center items-center gap-1.5">
        {sites.map((site) => (
          <li
            key={site}
            className="h-[26px] pl-[9px] pr-[3px] inline-flex items-center gap-1 rounded-row bg-card-2 font-mono text-11.5 text-ink"
          >
            {site}
            <button
              type="button"
              aria-label={`Remove ${site}`}
              onClick={() => onChange(sites.filter((each) => each !== site))}
              className={cn("size-5 grid place-items-center rounded-[6px] text-ink-3 hover:bg-hover hover:text-ink", FOCUS)}
            >
              <X aria-hidden className="size-[11px]" strokeWidth={1.75} />
            </button>
          </li>
        ))}
        <li>
          {adding === null ? (
            <button
              type="button"
              onClick={() => setAdding("")}
              className={cn(
                "h-[26px] pl-[9px] pr-3 inline-flex items-center gap-1.5 rounded-row shadow-[inset_0_0_0_1px_var(--line)] text-13 text-ink-2 hover:bg-hover hover:text-ink",
                FOCUS,
              )}
            >
              <Plus aria-hidden className="size-[11px]" strokeWidth={1.75} />
              Add a site
            </button>
          ) : (
            <input
              autoFocus
              aria-label="Add a site"
              aria-invalid={!!bad}
              value={adding}
              spellCheck={false}
              placeholder="example.com"
              onChange={(event) => {
                setAdding(event.target.value);
                setBad(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  if (add(adding) && event.key === ",") setAdding("");
                } else if (event.key === "Escape") {
                  setAdding(null);
                  setBad(null);
                }
              }}
              onBlur={() => add(adding)}
              className="h-[26px] w-40 px-[9px] rounded-row bg-card-2 font-mono text-11.5 text-ink caret-ink outline-none placeholder:text-faint"
            />
          )}
        </li>
      </ul>
      {said && (
        <p role="alert" className="mt-2 text-center text-13 text-ask">
          {said}
        </p>
      )}
    </>
  );
};
