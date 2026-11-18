import React from "react";
import type { DesktopEdge, DesktopFace } from "@shared/ipc";
import { DESKTOP_FILLET } from "@shared/desktopSizes";
import { Mascot } from "@common/components/Mascot";
import { Pips, type PipMark, type PipPattern } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { EASE, SIZE_MS, dropRadius, intoEdge } from "./desktopShape";

// DESIGN.md, On your desktop. The drop is the tooltip's near-black in light and dark alike. The prompt box is the same
// shape grown, drawn by the panel's window over this one, so both draw it with this.

// A soft shadow, and a faint light rim so it shows on a dark wallpaper. A filter, so the fillets cast it too.
const SHADOW = "drop-shadow(0 6px 14px rgb(0 0 0 / .34)) drop-shadow(0 0 .6px rgb(255 255 255 / .5))";
const TIP = "rgb(var(--tip))";

// Each fillet is a square at the edge, beside the shape, filled but for a circle from its far corner.
const fillet = (corner: string): string =>
  `radial-gradient(circle at ${corner}, transparent ${DESKTOP_FILLET - 0.5}px, ${TIP} ${DESKTOP_FILLET}px)`;
const FILLETS: Record<DesktopEdge, [React.CSSProperties, React.CSSProperties]> = {
  right: [
    { right: 0, top: -DESKTOP_FILLET, background: fillet("0 0") },
    { right: 0, bottom: -DESKTOP_FILLET, background: fillet("0 100%") },
  ],
  left: [
    { left: 0, top: -DESKTOP_FILLET, background: fillet("100% 0") },
    { left: 0, bottom: -DESKTOP_FILLET, background: fillet("100% 100%") },
  ],
  bottom: [
    { left: -DESKTOP_FILLET, bottom: 0, background: fillet("0 0") },
    { right: -DESKTOP_FILLET, bottom: 0, background: fillet("100% 0") },
  ],
  top: [
    { left: -DESKTOP_FILLET, top: 0, background: fillet("0 100%") },
    { right: -DESKTOP_FILLET, top: 0, background: fillet("100% 100%") },
  ],
};

// One near-black shape against the edge at `x`, `y` in its window. `loose` is while it's dragged: a round drop with no
// edge to meet. `out` false flattens it back into the edge. Everything changes size and place as transforms and sizes
// in here, never by moving a window.
export const DropShape: React.FC<
  {
    edge: DesktopEdge;
    x: number;
    y: number;
    width: number;
    height: number;
    still: boolean;
    out?: boolean;
    loose?: boolean;
    className?: string;
    children?: React.ReactNode;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, "title">
> = ({ edge, x, y, width, height, still, out = true, loose = false, className, children, style, ...rest }) => {
  const { origin, flat } = intoEdge(edge);
  const moving = still
    ? undefined
    : `transform ${SIZE_MS}ms ${EASE}, width ${SIZE_MS}ms ${EASE}, height ${SIZE_MS}ms ${EASE}, opacity ${SIZE_MS}ms ${EASE}`;
  return (
    <div
      {...rest}
      className={cn("absolute left-0 top-0 select-none", className)}
      style={{
        width,
        height,
        transform: `translate3d(${x}px, ${y}px, 0)${out ? "" : ` ${flat}`}`,
        transformOrigin: origin,
        opacity: out ? 1 : 0,
        transition: moving,
        filter: SHADOW,
        ...style,
      }}
    >
      <div
        className="absolute inset-0 bg-tip overflow-hidden"
        style={{
          borderRadius: loose ? "9999px" : dropRadius(edge, height),
          transition: still ? undefined : `border-radius ${SIZE_MS}ms ${EASE}`,
        }}
      >
        {children}
      </div>
      {!loose &&
        FILLETS[edge].map((place, index) => (
          <span
            key={index}
            aria-hidden
            className="absolute pointer-events-none"
            style={{ width: DESKTOP_FILLET, height: DESKTOP_FILLET, ...place }}
          />
        ))}
    </div>
  );
};

// With mascots hidden, the pips stand in for a face, and they still say what it's doing.
const GLYPH: Record<DesktopFace["mood"], { pattern: PipPattern | PipMark; ask?: boolean }> = {
  rest: { pattern: "think" },
  fetching: { pattern: "think" },
  asking: { pattern: "waiting", ask: true },
  delivered: { pattern: "done" },
  oops: { pattern: "done", ask: true },
};

// A face in the drop. Faces here never move: what moves is the pips beside them, while work is really happening.
export const DropFace: React.FC<{ face: DesktopFace; size: number; showBerry: boolean; still: boolean; className?: string }> = ({
  face,
  size,
  showBerry,
  still,
  className,
}) => {
  if (!showBerry) {
    const { pattern, ask } = GLYPH[face.mood];
    return (
      <span
        role="img"
        aria-label={`${face.name}, ${face.mood === "asking" ? "waiting for your decision" : face.mood === "fetching" ? "working" : face.mood === "rest" ? "at rest" : "finished"}`}
        className={cn("shrink-0 grid place-items-center", className)}
        style={{ width: size, height: size }}
      >
        <Pips
          pattern={pattern}
          still={still || (face.mood !== "fetching" && face.mood !== "asking")}
          className={ask ? "text-ask" : "text-tip-ink"}
        />
      </span>
    );
  }
  return <Mascot mood={face.mood} size={size} look={face.look} name={face.name} still className={className} />;
};

// Up to three faces stacked, the first in front.
export const DropFaces: React.FC<{ faces: DesktopFace[]; showBerry: boolean; still: boolean }> = ({ faces, showBerry, still }) => {
  const size = faces.length > 1 ? 18 : 20;
  return (
    <span className="shrink-0 flex items-center">
      {faces.map((face, index) => (
        <span
          key={index}
          className={cn("relative flex", index > 0 && "-ml-1.5")}
          style={{ zIndex: faces.length - index, filter: index < faces.length - 1 ? `drop-shadow(1.5px 0 0 ${TIP})` : undefined }}
        >
          <DropFace face={face} size={size} showBerry={showBerry} still={still} />
        </span>
      ))}
    </span>
  );
};
