import React, { useId } from "react";
import { Check } from "lucide-react";
import type { GalleryMascot, MascotProfile } from "@shared/library";
import type { Mood } from "@common/components/moods";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { useShell } from "../contexts/useShell";
import { Berry } from "../components/Berry";
import { addsLine, fromPeople } from "../galleryView";

// Part of the Gallery (MascotGalleryPage.tsx): a mascot's tile, its face, and the labels both views use.

const asMascot = (entry: GalleryMascot): MascotProfile => ({ ...entry.draft, id: entry.id, deletedAt: null });

// Its face, or with mascots hidden the pips glyph, so a tile or the stage still holds something.
export const Face: React.FC<{ entry: GalleryMascot; size: number; copy?: MascotProfile | null; mood?: Mood; className?: string }> = ({
  entry,
  size,
  copy,
  mood = "rest",
  className,
}) => {
  const { showBerry } = useShell().settings;
  if (!showBerry) {
    return (
      <span
        role="img"
        aria-label={entry.draft.name}
        className={cn("shrink-0 grid place-items-center text-ink-2", className)}
        style={{ width: size, height: size }}
      >
        <span className="grid place-items-center" style={{ transform: `scale(${Math.min(3, Math.max(1, size / 26))})` }}>
          <Pips pattern="think" still />
        </span>
      </span>
    );
  }
  return <Berry mood={mood} size={size} mascot={copy ?? asMascot(entry)} className={className} />;
};

const Yours: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn("flex items-center gap-1 whitespace-nowrap", className)}>
    <Check aria-hidden className="size-3" strokeWidth={1.75} />
    Yours
  </span>
);

export const GroupLabel: React.FC<{ label: string; count?: number | undefined; note?: string | undefined; className?: string }> = ({
  label,
  count,
  note,
  className,
}) => (
  <h2 className={cn("flex items-baseline gap-2 text-13 font-medium text-ink-2", className)}>
    {label}
    {count !== undefined && <span className="font-mono text-11 font-regular text-faint">{count}</span>}
    {note && <span className="ml-auto text-[12.5px] font-regular text-ink-3">{note}</span>}
  </h2>
);

// A tile in the whole Gallery: a grey stage with the mascot, and under it its name, its line and, for a person's, who
// and how many adds. Pointed at, only the stage steps up a shade, so a tile is only ever a way into its page. With no
// `onPick` it's only a picture of one, as publishing shows.
export const GalleryTile: React.FC<{ entry: GalleryMascot; yours?: boolean; onPick?: () => void }> = ({ entry, yours, onPick }) => {
  const line = useId();
  const body = (
    <>
      <span className="relative aspect-[4/3] rounded-[14px] bg-sheet-2 grid place-items-center transition-colors duration-fast group-hover:bg-[color-mix(in_srgb,rgb(var(--sheet-2)),rgb(var(--ink))_4%)] group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-sheet">
        <Face entry={entry} size={64} />
        {yours && <Yours className="absolute left-2.5 top-2.5 font-mono text-11 text-ink-3" />}
      </span>
      <span className="block mx-0.5 mt-2.5 text-[13.5px] font-medium [overflow-wrap:anywhere]">{entry.draft.name}</span>
      <span id={line} className="block mx-0.5 mt-0.5 text-[12.5px] leading-[1.4] text-ink-2 line-clamp-2">
        {entry.description}
      </span>
      {fromPeople(entry) && <span className="block mx-0.5 mt-1.5 font-mono text-11 text-faint truncate">{addsLine(entry)}</span>}
    </>
  );
  if (!onPick) return <div className="group">{body}</div>;
  return (
    <button
      type="button"
      data-gallery-tile={entry.id}
      aria-label={yours ? `${entry.draft.name}, yours` : entry.draft.name}
      aria-describedby={line}
      onClick={onPick}
      className="group block w-full text-left outline-none"
    >
      {body}
    </button>
  );
};
