import React from "react";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { SHELL } from "./cardShell";

// Exactly what will happen, set apart from the sentence above it, because this is what's being allowed. Never cut.
export const ExactWords: React.FC<{ children: string; className?: string }> = ({ children, className }) => (
  <p className={cn("rounded-row bg-sheet-2 px-2.5 py-2 font-mono text-11.5 text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>{children}</p>
);

// Anything you have to answer is a card in a tray-coloured shell, 4px larger all round, with a line of words in the shell
// under it where there's something to say (DESIGN.md section 3). The card is `card`, as the chat's prompt box is, so in
// dark it's a step up from the page it's on.
export const CardInShell: React.FC<{ label: string; note?: React.ReactNode; children: React.ReactNode }> = ({ label, note, children }) => (
  <section aria-label={label} className={cn(SHELL, "rounded-card-shell [overflow-wrap:anywhere] animate-fade-in")}>
    <div className="rounded-sheet bg-card p-3.5 shadow-card-lift">{children}</div>
    {note && <p className="min-h-9 pl-3 pr-2.5 py-2 flex items-center gap-2.5 text-13 text-ink-2">{note}</p>}
  </section>
);

// What a mascot asks before anything that matters: what it would like to do, then exactly what will happen. With no
// `exactly`, the question already says it word for word. Allow, filled, then Don't allow, in that order everywhere.
export const ApprovalCard: React.FC<{
  question: React.ReactNode;
  exactly?: string;
  onConfirm: () => void;
  onDeny: () => void;
}> = ({ question, exactly, onConfirm, onDeny }) => (
  <CardInShell label="Approval needed">
    <h3 className="mb-[9px] text-15 font-medium text-ink">{question}</h3>
    {exactly && <ExactWords className="mb-3 bg-card-2">{exactly}</ExactWords>}
    <div className="flex flex-wrap items-center gap-1.5">
      <Button onClick={onConfirm}>Allow</Button>
      <Button variant="raised" onClick={onDeny}>
        Don’t allow
      </Button>
    </div>
  </CardInShell>
);
