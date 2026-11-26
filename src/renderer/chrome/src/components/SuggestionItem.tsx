import React, { useId } from "react";
import { ChevronRight, X } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import type { Mood } from "@common/components/moods";
import { BERRY } from "@shared/mascots";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { Berry } from "./Berry";
import { finishedWhen, mascotLine } from "../shortWords";
import type { SuggestionRow } from "../newTabSuggestions";
import { Tooltip } from "@common/components/Tooltip";
import { PREVIEW_REST_MS } from "@common/components/tooltipState";
import { useAfterRest } from "@common/lib/timers";
import { SuggestionPeek } from "./SuggestionPeek";

const nameOf = (mascot: MascotProfile) => (mascot.id === BERRY.id ? BERRY.name : mascot.name);

// What a row shows: whose face, its title and a sentence on why it's there.
const looksOf = (
  row: SuggestionRow,
  find: (id: string | null) => MascotProfile,
): { mascot: MascotProfile; mood: Mood; title: string; reason: string } => {
  if (row.kind === "pick-up") {
    const mascot = find(row.chat.mascotId);
    return {
      mascot,
      mood: "delivered",
      title: row.chat.title,
      reason: `${nameOf(mascot)} finished it ${finishedWhen(row.chat.updatedAt)}, and you haven’t looked yet.`,
    };
  }
  if (row.kind === "try") {
    return {
      mascot: row.mascot,
      mood: "rest",
      title: row.prompt,
      reason: `${nameOf(row.mascot)}: ${mascotLine(row.mascot)}`,
    };
  }
  const { suggestion } = row;
  const reason = `${suggestion.why}.`;
  if (suggestion.kind === "prompt") return { mascot: BERRY, mood: "rest", title: suggestion.title, reason };
  if (suggestion.kind === "routine")
    return { mascot: find(suggestion.draft.mascotId ?? null), mood: "rest", title: suggestion.title, reason };
  return {
    mascot: { ...suggestion.draft, id: suggestion.id, deletedAt: null },
    mood: "curious",
    title: suggestion.title,
    reason,
  };
};

// DESIGN.md section 10, New tab: one two-line row under the box. The whole row is the button and does what it says at
// once. Resting on it, or reaching it with the keyboard, shows all of it in a popover to read. Its right end is one slot on
// every row: a faint chevron at rest, and Not now on the row you're on.
export const SuggestionItem: React.FC<{
  row: SuggestionRow;
  used?: boolean;
  onPress: () => void;
  onNotNow: () => void;
}> = ({ row, used = false, onPress, onNotNow }) => {
  const { find } = useMascots();
  const { mascot, mood, title, reason } = looksOf(row, find);
  const peekId = useId();
  const [peek, rest, leave] = useAfterRest(PREVIEW_REST_MS);
  return (
    <li
      onPointerLeave={leave}
      className={cn(
        "bridged group flex items-center rounded-[14px] transition-colors",
        used ? "bg-hover" : "hover:bg-hover focus-within:bg-hover",
      )}
    >
      <button
        type="button"
        onPointerEnter={rest}
        onClick={() => {
          leave();
          onPress();
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) rest();
        }}
        onBlur={leave}
        aria-describedby={peek ? peekId : undefined}
        className="flex-1 min-w-0 py-[9px] pl-3 pr-11 flex items-center gap-[13px] rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span aria-hidden className="flex shrink-0">
          <Berry mood={mood} size={26} mascot={mascot} still />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-14 font-medium text-ink">{title}</span>
          <span className="block truncate text-13 text-ink-2">{reason}</span>
        </span>
      </button>
      {/* One slot for every row: the chevron at rest, Not now on the row you're on. */}
      <ChevronRight
        aria-hidden
        className="pointer-events-none absolute right-[17px] top-1/2 -translate-y-1/2 size-3.5 text-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        strokeWidth={1.75}
      />
      <Tooltip words="Not now">
        <button
          type="button"
          aria-label={`Not now: ${title}`}
          // Its own tooltip shows here, so the popover waits for the pointer to come back to the row.
          onPointerEnter={leave}
          onClick={onNotNow}
          className="press absolute right-1.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-row text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </Tooltip>
      <SuggestionPeek id={peekId} row={row} why={row.kind === "pick-up" ? null : reason} open={peek} />
    </li>
  );
};
