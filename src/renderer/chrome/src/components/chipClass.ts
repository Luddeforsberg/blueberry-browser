import { cn } from "@common/lib/utils";

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";

// A chip, as under a finished reply and under the working view's picture. `bare` ones are outlined, for actions. A
// `tray` one keeps its fill and takes `hover` over it, so it darkens on a sheet as it does on the ground.
export const chipClass = (bare = false) =>
  cn(
    "h-7 max-w-full pl-[7px] pr-2.5 shrink-0 inline-flex items-center gap-[7px] rounded-row text-13 whitespace-nowrap transition-[background-color,color,transform] duration-fast active:scale-[.96]",
    bare
      ? "shadow-[inset_0_0_0_1px_var(--line)] text-ink-2 hover:bg-hover hover:text-ink active:bg-press"
      : "relative bg-tray text-ink-2 hover:text-ink after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-hover after:opacity-0 hover:after:opacity-100 active:after:bg-press",
    FOCUS,
  );
