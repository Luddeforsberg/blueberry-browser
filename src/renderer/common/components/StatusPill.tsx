import React from "react";
import { cn } from "../lib/utils";

// DESIGN.md section 8: a state is a pill, never a mono word. `off` is a plain fact in `ink-2`, `on` is `ink` after a dot
// in `focus`, and `ask` needs you, in `ask` after its own dot. `lead` takes the dot's place, such as the pips while work
// is really happening. Its next step, if any, is a raised button beside it.
export type PillTone = "off" | "on" | "ask";

export const StatusPill: React.FC<{
  tone?: PillTone | undefined;
  lead?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = "off", lead, className, children }) => (
  <span
    className={cn(
      "h-6 px-[9px] shrink-0 inline-flex items-center gap-1.5 rounded-full text-12 font-medium whitespace-nowrap",
      tone === "ask" ? "bg-ask-bg text-ask" : "bg-sheet-2 text-ink-2",
      tone === "on" && "text-ink",
      className,
    )}
  >
    {lead ??
      (tone !== "off" && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone === "ask" ? "bg-ask" : "bg-focus")} />)}
    {children}
  </span>
);

// A section label: words with a capital, 12px medium in `ink-2` (DESIGN.md section 8).
export const LABEL = "text-12 font-medium text-ink-2";
