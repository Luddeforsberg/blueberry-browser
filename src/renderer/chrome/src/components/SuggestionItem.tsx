import React from "react";
import { ChevronRight, X } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import type { Mood } from "@common/components/moods";
import { BERRY } from "@shared/mascots";
import { buttonVariants } from "@common/components/buttonVariants";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { Berry } from "./Berry";
import { finishedWhen, firstSentence } from "../shortWords";
import type { SuggestionRow } from "../newTabSuggestions";
import { Tooltip } from "@common/components/Tooltip";

const nameOf = (mascot: MascotProfile) => (mascot.id === BERRY.id ? BERRY.name : mascot.name);

// What a row shows: whose face, its title, a sentence on why it's there, and what pressing it does.
const looksOf = (
  row: SuggestionRow,
  find: (id: string | null) => MascotProfile,
): { mascot: MascotProfile; mood: Mood; title: string; reason: string; action: string } => {
  if (row.kind === "pick-up") {
    const mascot = find(row.chat.mascotId);
    return {
      mascot,
      mood: "delivered",
      title: row.chat.title,
      reason: `${nameOf(mascot)} finished it ${finishedWhen(row.chat.updatedAt)}. Pick up where it stopped.`,
      action: "Pick up",
    };
  }
  if (row.kind === "try") {
    return {
      mascot: row.mascot,
      mood: "rest",
      title: row.prompt,
      reason: `${nameOf(row.mascot)}: ${firstSentence(row.mascot.instructions)}`,
      action: "Try",
    };
  }
  const { suggestion } = row;
  const reason = `${suggestion.why}.`;
  if (suggestion.kind === "prompt") return { mascot: BERRY, mood: "rest", title: suggestion.title, reason, action: "Use" };
  if (suggestion.kind === "routine")
    return { mascot: find(suggestion.draft.mascotId ?? null), mood: "rest", title: suggestion.title, reason, action: "Set up" };
  return {
    mascot: { ...suggestion.draft, id: suggestion.id, deletedAt: null },
    mood: "curious",
    title: suggestion.title,
    reason,
    action: "Make it",
  };
};

// DESIGN.md section 10, New tab: one two-line row under the box. The whole row is the button, so what it does shows as a
// raised button on the row you're on, with a faint arrow at rest. A suggestion has a × beside it, a button of its own,
// which shows on hover and while the row has the keyboard.
export const SuggestionItem: React.FC<{
  row: SuggestionRow;
  used?: boolean;
  onPress: () => void;
  onDismiss?: (() => void) | undefined;
}> = ({ row, used = false, onPress, onDismiss }) => {
  const { find } = useMascots();
  const { mascot, mood, title, reason, action } = looksOf(row, find);
  return (
    <li
      className={cn(
        "bridged group flex items-center rounded-[14px] transition-[background-color,box-shadow]",
        used ? "bg-sheet shadow-chip" : "hover:bg-sheet hover:shadow-chip focus-within:bg-sheet focus-within:shadow-chip",
      )}
    >
      <button
        type="button"
        onClick={onPress}
        className="flex-1 min-w-0 py-[9px] pl-3 pr-2 flex items-center gap-[13px] rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span aria-hidden className="flex shrink-0">
          <Berry mood={mood} size={26} mascot={mascot} still />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-14 font-medium text-ink">{title}</span>
          <span className="block truncate text-13 text-ink-2">{reason}</span>
        </span>
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
            {action}
          </span>
        </span>
      </button>
      {onDismiss && (
        <Tooltip words="Dismiss">
          <button
            type="button"
            aria-label={`Dismiss: ${title}`}
            onClick={onDismiss}
            className="press hidden group-hover:flex group-focus-within:flex size-7 mr-1.5 shrink-0 items-center justify-center rounded-row text-ink-3 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </Tooltip>
      )}
    </li>
  );
};
