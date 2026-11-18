import React from "react";
import { cn } from "../lib/utils";
import { useFrame, useStill } from "./motion";
import { MARKS, MOVING, PIP_OFF, SPEED_MS, strength, type PipMark, type PipPattern } from "./pipPatterns";

// In the colour of the words beside it. Still, as Keep Berry still and reduced motion ask, it holds its first frame.
export const Pips: React.FC<{ pattern: PipPattern | PipMark; still?: boolean; className?: string }> = ({ pattern, still, className }) => {
  const moving = pattern in MOVING ? MOVING[pattern as PipPattern] : null;
  const held = useStill(still);
  const frame = useFrame(moving?.length ?? 1, moving ? SPEED_MS[pattern as PipPattern] : 0, !!moving && !held);
  const shown = moving ? moving[frame] : MARKS[pattern as PipMark];

  return (
    <span
      aria-hidden
      data-pips={pattern}
      className={cn("inline-grid shrink-0 grid-cols-[repeat(3,3px)] gap-[2px] align-middle", className)}
    >
      {shown.map((value, index) => (
        <i
          key={index}
          className="size-[3px] rounded-full bg-current transition-opacity duration-[140ms] ease-linear"
          style={{ opacity: strength(value, PIP_OFF) }}
        />
      ))}
    </span>
  );
};
