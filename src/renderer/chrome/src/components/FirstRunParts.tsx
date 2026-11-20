import React from "react";
import { Button } from "@common/components/Button";
import { LABEL, StatusPill } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";
import { FIELD } from "./StepCard";

// Part of the first run (FirstRun.tsx): the pieces each step's card is built from.

export const LINK =
  "text-ink underline decoration-line underline-offset-[3px] rounded-row outline-none hover:decoration-ink-3 focus-visible:ring-2 focus-visible:ring-focus";

// The filled button names its key while Enter presses it.
export const Primary: React.FC<{ disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  disabled,
  onClick,
  children,
}) => (
  <Button disabled={disabled} onClick={onClick}>
    {children}
    {!disabled && (
      <kbd
        aria-hidden
        className="h-4 min-w-4 px-1 grid place-items-center rounded-[5px] bg-ground/15 font-mono text-[10.5px] font-medium text-ground/80"
      >
        ↵
      </kbd>
    )}
  </Button>
);

// A link on one side of the shell and the filled button on the other, for the steps that have no Back.
export const LinkNav: React.FC<{ link?: React.ReactNode; children: React.ReactNode }> = ({ link, children }) => (
  <div className="h-[46px] pl-3 pr-1.5 flex items-center justify-between text-13">
    <span>{link}</span>
    {children}
  </div>
);

// Under the card, outside its shell: a way past the step, and what that means.
export const Under: React.FC<{ onPress: () => void; label: string; children: React.ReactNode }> = ({ onPress, label, children }) => (
  <p className="w-[520px] max-w-full mx-auto mt-2.5 px-2 flex justify-between gap-3.5 text-13 text-ink-3">
    <button type="button" onClick={onPress} className={LINK}>
      {label}
    </button>
    <span className="text-right">{children}</span>
  </p>
);

// Berry saying how something went, with a pill.
export const Says: React.FC<{ pill?: string; children: React.ReactNode }> = ({ pill, children }) => (
  <p role="status" className="my-1 mx-0.5 flex items-center gap-2.5 text-14 text-left">
    <span aria-hidden className="flex shrink-0">
      <Berry size={20} mood="delivered" still />
    </span>
    <span className="flex-1">{children}</span>
    {pill && <StatusPill tone="on">{pill}</StatusPill>}
  </p>
);

export const Field: React.FC<{ label: string; problem?: string | null; hint?: string; children: React.ReactNode }> = ({
  label,
  problem,
  hint,
  children,
}) => (
  <div className="mt-3 text-left">
    <label className="block">
      <span className={cn("block mb-[5px] mx-0.5", LABEL)}>{label}</span>
      {children}
    </label>
    {problem ? (
      <p role="alert" className="mt-[7px] mx-0.5 text-13 text-ask">
        {problem}
      </p>
    ) : (
      hint && <p className="mt-[7px] mx-0.5 text-13 text-ink-3">{hint}</p>
    )}
  </div>
);

export const INPUT = cn(FIELD, "h-10 px-3 text-14 shadow-[inset_0_0_0_1px_var(--line)]");
