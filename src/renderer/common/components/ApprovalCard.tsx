import React from "react";
import { Info } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { SHELL } from "./cardShell";
import { useCardKeys, type CardRegion } from "./cardKeys";

// Exactly what will happen, set apart from the sentence above it in an inset well, because this is what's being
// allowed. 12px mono, and never cut. `mark` is the piece the card's reason is about, on `ask-bg`, and only ever a piece
// that's in the words as they are.
export const ExactWords: React.FC<{ children: string; mark?: string; className?: string }> = ({ children, mark, className }) => {
  const at = mark ? children.indexOf(mark) : -1;
  return (
    <p className={cn("rounded-[10px] bg-sheet-2 px-[11px] py-2 shadow-[inset_0_0_0_1px_var(--line)] font-mono text-12 leading-[19px] text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>
      {mark && at >= 0 ? (
        <>
          {children.slice(0, at)}
          <mark className="rounded-[4px] bg-ask-bg px-[3px] text-ask [box-decoration-break:clone]">{mark}</mark>
          {children.slice(at + mark.length)}
        </>
      ) : (
        children
      )}
    </p>
  );
};

// A key on a button, shown only while pressing it would do what it says. On the filled button it takes the button's
// own colours.
export const Keycap: React.FC<{ children: string; label: string; onInk?: boolean }> = ({ children, label, onInk = false }) => (
  <kbd
    aria-label={label}
    className={cn(
      "-mr-[3px] h-[18px] min-w-[18px] px-1 inline-grid place-items-center rounded-[5px] font-mono text-11 font-medium leading-none",
      onInk ? "bg-ground/15 text-ground/80" : "bg-sheet-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
    )}
  >
    {children}
  </kbd>
);

// Anything you have to answer is a card in a tray-coloured shell, 4px larger all round, with a line of words in the shell
// under it where there's something to say (DESIGN.md section 3). The card is `card`, as the chat's prompt box is, so in
// dark it's a step up from the page it's on. `region` makes the whole shell a place the keyboard can be, for its keys.
export const CardInShell: React.FC<{ label: string; note?: React.ReactNode; region?: CardRegion; className?: string; children: React.ReactNode }> = ({ label, note, region, className, children }) => (
  <section
    aria-label={label}
    {...region}
    className={cn(SHELL, "rounded-card-shell [overflow-wrap:anywhere] animate-fade-in", region && "outline-none focus-visible:ring-2 focus-visible:ring-focus", className)}
  >
    <div className="rounded-sheet bg-card px-4 pt-4 pb-3.5 shadow-card-lift">{children}</div>
    {note && <div className="min-h-9 pl-3 pr-2.5 py-2 flex items-center gap-2.5 text-13 text-ink-2">{note}</div>}
  </section>
);

// Why a card asks, in the shell under it, after a small mark that it's an explanation.
export const WhyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="min-w-0 flex items-center gap-2">
    <Info aria-hidden className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
    <span className="min-w-0">{children}</span>
  </span>
);

// What a mascot asks before anything that matters: what it would like to do, then exactly what will happen. With no
// `exactly`, the question already says it word for word. Allow, filled, then Don't allow, in that order everywhere.
// `head` goes over the words, as on Needs you, and `note` under the card, such as why it asks.
export const ApprovalCard: React.FC<{
  question: React.ReactNode;
  exactly?: string;
  mark?: string;
  head?: React.ReactNode;
  note?: React.ReactNode;
  onConfirm: () => void;
  onDeny: () => void;
  // Only on Needs you, where the open card has the keyboard.
  focusOnShow?: boolean;
}> = ({ question, exactly, mark, head, note, onConfirm, onDeny, focusOnShow = false }) => {
  const { region, on } = useCardKeys({ onEnter: onConfirm, onEscape: onDeny, focusOnShow });
  const enterAllows = on === "card" || on === "allow";
  return (
    <CardInShell label="Approval needed" note={note} region={region}>
      {head}
      <h3 className="mb-2.5 text-15 font-medium text-ink">{question}</h3>
      {exactly && <ExactWords mark={mark} className="mb-3.5 bg-card-2">{exactly}</ExactWords>}
      <div className="flex flex-wrap items-center gap-2">
        <Button data-card-key="allow" onClick={onConfirm}>
          Allow
          {enterAllows && <Keycap label="Enter" onInk>↵</Keycap>}
        </Button>
        <Button variant="raised" onClick={onDeny}>
          Don’t allow
          {on !== "none" && <Keycap label="Escape">esc</Keycap>}
        </Button>
      </div>
    </CardInShell>
  );
};
