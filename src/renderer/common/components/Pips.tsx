import React from "react";
import { cn } from "../lib/utils";
import { useFrame, useStill } from "./motion";

// DESIGN.md section 6: one 3×3 grid of dots says what a mascot is doing, always beside words that say the same.
// Each frame is nine strengths, left to right and top to bottom, from off (0) to on (1).
type Frame = number[];

const RING = [0, 1, 2, 5, 8, 7, 6, 3];
const lit = (dots: number[]): Frame => Array.from({ length: 9 }, (_, index) => (dots.includes(index) ? 1 : 0));

const MOVING = {
  // One dot chases round the ring: thinking, and a tab loading.
  think: RING.map((_, step) => {
    const frame = Array<number>(9).fill(0);
    frame[RING[step]] = 1;
    frame[RING[(step + 7) % 8]] = 0.55;
    frame[RING[(step + 6) % 8]] = 0.3;
    return frame;
  }),
  reading: Array.from({ length: 10 }, (_, step) => Array.from({ length: 9 }, (_, index) => (index < step ? 1 : index === step ? 0.55 : 0))),
  scanning: [0, 1, 2, 1].map((column) =>
    Array.from({ length: 9 }, (_, index) => (index % 3 === column ? 1 : Math.abs((index % 3) - column) === 1 ? 0.3 : 0)),
  ),
  clicking: [[4], [1, 3, 4, 5, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8], [1, 3, 4, 5, 7], [4], []].map(lit),
  typing: [[], [6], [6, 7], [6, 7, 8], [6, 7, 8], []].map(lit),
  searching: [[0], [1, 3], [2, 4, 6], [5, 7], [8], []].map(lit),
  // All on, dimming and returning round a steady centre. Drawn in `ask` by whoever shows it.
  waiting: [1, 1, 1, 0.35].map((strength) => Array.from({ length: 9 }, (_, index) => (index === 4 ? 1 : strength * 0.9))),
} satisfies Record<string, Frame[]>;

const SPEED_MS: Record<keyof typeof MOVING, number> = {
  think: 90,
  reading: 110,
  scanning: 170,
  clicking: 150,
  typing: 200,
  searching: 130,
  waiting: 420,
};

// A finished step keeps one still mark for its kind.
const MARKS = {
  opened: lit([2, 4, 6]),
  read: lit([0, 1, 2, 3, 4, 5]),
  typed: lit([6, 7, 8]),
  clicked: lit([1, 3, 4, 5, 7]),
  done: lit([2, 3, 5, 7]),
} satisfies Record<string, Frame>;

export type PipPattern = keyof typeof MOVING;
export type PipMark = keyof typeof MARKS;
export const PIP_PATTERNS = Object.keys(MOVING) as PipPattern[];
export const PIP_MARKS = Object.keys(MARKS) as PipMark[];

// An off dot still shows, faintly, so the grid keeps its shape.
const PIP_OFF = 0.16;

// The frames of a pattern, and how long each shows. Mascot's working face runs on the same ones.
export const pipFrames = (pattern: PipPattern): { frames: Frame[]; ms: number } => ({ frames: MOVING[pattern], ms: SPEED_MS[pattern] });

const strength = (value: number, off: number) => off + (1 - off) * value;

// In the colour of the words beside it. Still, as Keep Berry still and reduced motion ask, it holds its first frame.
export const Pips: React.FC<{ pattern: PipPattern | PipMark; still?: boolean; className?: string }> = ({ pattern, still, className }) => {
  const moving = pattern in MOVING ? MOVING[pattern as PipPattern] : null;
  const held = useStill(still);
  const frame = useFrame(moving?.length ?? 1, moving ? SPEED_MS[pattern as PipPattern] : 0, !!moving && !held);
  const shown = moving ? moving[frame] : MARKS[pattern as PipMark];

  return (
    <span aria-hidden data-pips={pattern} className={cn("inline-grid shrink-0 grid-cols-[repeat(3,3px)] gap-[2px] align-middle", className)}>
      {shown.map((value, index) => (
        <i key={index} className="size-[3px] rounded-full bg-current transition-opacity duration-[140ms] ease-linear" style={{ opacity: strength(value, PIP_OFF) }} />
      ))}
    </span>
  );
};
