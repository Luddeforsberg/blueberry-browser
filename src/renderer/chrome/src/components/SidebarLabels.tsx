import React from "react";
import { LABEL } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { Tooltip } from "@common/components/Tooltip";
import { FOCUS } from "./sidebarRows";

// Part of the sidebar (Sidebar.tsx): its labels and the rule between groups.

// Section labels: words with a capital, 12px medium in ink-2. `trailing` sits at the right, such as a count in mono or
// an arrow.
export const Label: React.FC<{ id?: string; ask?: boolean; trailing?: React.ReactNode; children: React.ReactNode }> = ({
  id,
  ask,
  trailing,
  children,
}) => (
  <h2 id={id} className={cn("h-7 mt-1.5 mx-2 flex items-center gap-1.5", LABEL, ask && "text-ask")}>
    {children}
    {trailing && <span className="ml-auto flex items-center gap-2 font-mono text-11.5 font-regular text-ink-3">{trailing}</span>}
  </h2>
);

// A small icon button in a label, such as the new tab plus or the arrow that opens a page.
export const LabelButton: React.FC<{ label: string; shortcut?: string; onClick: () => void; children: React.ReactNode }> = ({
  label,
  shortcut,
  onClick,
  children,
}) => (
  <Tooltip words={label} shortcut={shortcut}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "press size-6 -mr-1.5 flex items-center justify-center rounded-[7px] text-faint hover:bg-hover hover:text-ink app-region-no-drag",
        FOCUS,
      )}
    >
      {children}
    </button>
  </Tooltip>
);

export const Rule: React.FC = () => <div aria-hidden className="h-px mx-1.5 my-2 bg-line" />;
