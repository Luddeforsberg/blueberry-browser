import { cn } from "@common/lib/utils";

// A row on the page has 8px inside each end and an 11px radius, so the row you're on fills from edge to edge.
export const ROW = "relative px-2 rounded-[11px]";
// The row you're on, by pointer or by keyboard: it fills with `hover`, and the hairline above it goes. `group/row` lets
// what's on it show (`ON_ROW_SHOW`), and `row-on` the hairline under it go (`LINE_BETWEEN`).
export const ON_ROW =
  "row-on group/row transition-colors hover:bg-hover focus-visible:bg-hover has-[:focus-visible]:bg-hover hover:before:hidden focus-visible:before:hidden has-[:focus-visible]:before:hidden";
// What shows only on the row you're on. It's still there to the keyboard, which is what brings it out.
export const ON_ROW_SHOW = "opacity-0 transition-opacity group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100";
// And what it takes the place of.
export const OFF_ROW_HIDE = "transition-opacity group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0";
// The hairline between two rows starts where the text does, after an icon when the rows have one, so a row that leads
// with something sets `before:left-*` to where its text starts.
export const BETWEEN =
  "relative before:content-[''] before:absolute before:right-0 before:top-0 before:h-px before:bg-line first:before:hidden";
// Between rows of two lines on the page, the hairline stops 8px from the end, as the row's words do, and goes from
// under the row you're on as well as from above it (`ON_ROW`).
export const LINE_BETWEEN = cn(
  BETWEEN,
  "before:right-2 [.row-on:hover+&]:before:hidden [.row-on:focus-visible+&]:before:hidden [.row-on:has(:focus-visible)+&]:before:hidden",
);
