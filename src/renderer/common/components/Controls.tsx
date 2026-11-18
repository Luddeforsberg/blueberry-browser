import React, { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

// DESIGN.md section 10, Settings: 34 by 20px. On is `focus` with a white knob, off is `sheet-2` with a hairline. The knob
// takes the light sheet in either mode, which is white.
export const Switch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string;
  label?: string;
  describedBy?: string;
}> = ({ checked, onChange, labelledBy, label, describedBy }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    aria-label={label}
    aria-describedby={describedBy}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative w-[34px] h-5 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
      checked ? "bg-focus" : "bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)]",
    )}
  >
    <span
      className={cn(
        "absolute top-0.5 left-0.5 size-4 rounded-full transition-transform",
        checked ? "light bg-sheet translate-x-3.5 shadow-[0_1px_2px_rgb(0_0_0/.25)]" : "bg-sheet shadow-rim dark:bg-ink-3",
      )}
    />
  </button>
);

// The chosen side's sheet in a segmented control, which travels to the side that's pressed (DESIGN.md section 7). It
// goes where the chosen one of the group's `[data-side]` children is, with its corners. Where the sides change size as
// they're chosen, `ruler` is a copy of them laid out as they'll end, so the sheet heads straight for where it stops.
// It appears in place the first time. The group is `relative`, with its sides above the sheet.
export const SwitchSheet: React.FC<{
  group: React.RefObject<HTMLElement | null>;
  chosen: number;
  ruler?: React.RefObject<HTMLElement | null>;
  className?: string;
}> = ({ group, chosen, ruler, className }) => {
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const [moves, setMoves] = useState(false);
  const measure = useRef(() => {});
  measure.current = () => {
    const side = (ruler?.current ?? group.current)?.querySelectorAll<HTMLElement>(":scope > [data-side]")[chosen];
    if (!side || side.offsetWidth === 0) return setPlace(null);
    const next = {
      left: side.offsetLeft,
      top: side.offsetTop,
      width: side.offsetWidth,
      height: side.offsetHeight,
      borderRadius: getComputedStyle(side).borderRadius,
    };
    setPlace((was) => (was && Object.entries(next).every(([key, value]) => was[key as keyof typeof next] === value) ? was : next));
  };
  // After every render, since what's around it may have moved it, and whenever the group changes size by itself.
  useLayoutEffect(() => measure.current());
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => measure.current());
    if (group.current) observer.observe(group.current);
    return () => observer.disconnect();
  }, [group]);
  // Only once it has been drawn where it starts, so it never flies in from the corner.
  useLayoutEffect(() => {
    if (!place || moves) return;
    const frame = requestAnimationFrame(() => setMoves(true));
    return () => cancelAnimationFrame(frame);
  }, [place, moves]);
  if (!place) return null;
  return (
    <span
      aria-hidden
      data-sheet
      style={place}
      className={cn("absolute pointer-events-none", moves && "transition-[left,top,width,height] duration-slide ease-crisp", className)}
    />
  );
};

// A segmented control (DESIGN.md section 8). The left and right arrows move the choice along, as in any group of radio
// buttons, and only the chosen one is a stop for Tab. `fill` shares the width out evenly, and an option can carry an icon.
// With a `picture` for each option, it's a row of small drawings with the name under each instead, as Settings' Theme.
// `pictureClassName` sizes and shapes the drawings when they aren't the window's 86 by 56, as the app icon's aren't.
export const Choice = <T extends string>({
  label,
  value,
  options,
  onChange,
  fill = false,
  describedBy,
  className,
  pictureClassName = "w-full h-14 rounded-[10px]",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; Icon?: LucideIcon; picture?: React.ReactNode }[];
  onChange: (value: T) => void;
  fill?: boolean;
  describedBy?: string;
  className?: string;
  pictureClassName?: string;
}) => {
  const group = useRef<HTMLDivElement>(null);
  const pictures = options.every((option) => option.picture);
  const anyChosen = options.some((option) => option.value === value);
  const step = (by: number) => {
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + by + options.length) % options.length];
    onChange(next.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)]?.focus();
  };
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      onKeyDown={(event) => {
        const by = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!by) return;
        event.preventDefault();
        event.stopPropagation();
        step(by);
      }}
      className={cn(
        pictures ? "flex shrink-0 gap-2.5" : "relative p-0.5 rounded-full bg-sheet-2",
        !pictures && (fill ? "grid grid-flow-col auto-cols-fr" : "inline-flex shrink-0"),
        className,
      )}
    >
      {/* The row of pictures isn't a sliding switch: the chosen one is ringed where it is. */}
      {!pictures && (
        <SwitchSheet group={group} chosen={options.findIndex((option) => option.value === value)} className="bg-sheet shadow-chip" />
      )}
      {options.map((option, index) => {
        const chosen = value === option.value;
        const tabIndex = chosen || (!anyChosen && index === 0) ? 0 : -1;
        if (pictures) {
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={tabIndex}
              onClick={() => onChange(option.value)}
              className={cn(
                "group w-[86px] flex flex-col items-center gap-[7px] text-13 outline-none",
                chosen ? "text-ink font-medium" : "text-ink-2 hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative block overflow-hidden group-focus-visible:ring-2 group-focus-visible:ring-focus",
                  pictureClassName,
                  chosen ? "shadow-[0_0_0_2px_rgb(var(--sheet)),0_0_0_3.5px_rgb(var(--ink))]" : "shadow-[inset_0_0_0_1px_var(--line)]",
                )}
              >
                {option.picture}
              </span>
              <span className="max-w-full truncate">{option.label}</span>
            </button>
          );
        }
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={tabIndex}
            data-side
            onClick={() => onChange(option.value)}
            className={cn(
              "press relative h-7 flex items-center justify-center rounded-full text-13 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-focus",
              fill ? "px-1 gap-[5px]" : "px-2.5 gap-1.5",
              chosen ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {option.Icon && <option.Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

// Words in a row, with the chosen one underlined. Quieter than a segmented control, for a row of filters.
export const QuietChoice = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-4">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "h-7 text-14 outline-none rounded-row underline-offset-[6px] decoration-[1.5px] transition-colors focus-visible:ring-2 focus-visible:ring-focus",
          value === option.value ? "underline" : "text-ink-2 hover:text-ink",
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);
