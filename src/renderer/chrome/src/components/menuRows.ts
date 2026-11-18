import type { MenuEntry } from "@shared/ipc";
import { cn } from "@common/lib/utils";

// A row is 40px, or 46px with a second line, and hovering or the keyboard gives it a 14px `sheet-2` fill. One that's
// ruled out stays, in `faint`, and its second line says why.
export const menuRowClass = (twoLines: boolean, off = false) =>
  cn(
    "w-full px-2.5 flex items-center gap-[11px] rounded-[14px] text-left outline-none",
    twoLines ? "h-[46px]" : "h-10",
    "focus-visible:bg-sheet-2",
    off ? "text-faint cursor-default" : "hover:bg-sheet-2",
  );

// With an icon or a check on any row, every row keeps room for one, so the words line up.
export const leadsWithGlyph = (entries: MenuEntry[]) =>
  entries.some((entry) => entry.kind === "row" && (entry.icon !== null || entry.checked !== null));
