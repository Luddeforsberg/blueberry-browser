import React, { useId } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "../lib/utils";

export type Mood =
  | "rest"
  | "curious"
  | "thinking"
  | "fetching"
  | "asking"
  | "delivered"
  | "oops"
  | "off-duty";

// Every mood has words, so nothing depends on seeing the drawing.
export const MOOD_LABELS: Record<Mood, string> = {
  rest: "at rest",
  curious: "curious",
  thinking: "thinking",
  fetching: "fetching",
  asking: "waiting for your decision",
  delivered: "finished",
  oops: "something went wrong",
  "off-duty": "asleep",
};

interface MascotProps {
  mood?: Mood;
  size: number;
  // Hide Berry: a plain icon stands in, and every feature keeps working.
  hidden?: boolean;
  // Keep Berry still: the pose stays, the motion stops. Reduced motion does the same through CSS.
  still?: boolean;
  className?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
}

// Below this, the full drawing turns to mush, so Berry is just a head, a body and a big eye.
const SIMPLIFIED_BELOW = 32;

const Berry: React.FC<{ x: number; y: number; r: number; gradientId: string }> = ({ x, y, r, gradientId }) => (
  <g>
    <ellipse cx={x} cy={y} rx={r} ry={r * 0.92} fill={`url(#${gradientId})`} />
    <ellipse cx={x - r * 0.35} cy={y - r * 0.35} rx={r * 0.35} ry={r * 0.22} className="fill-berry-fruit-bloom" opacity={0.35} />
    {/* A sunken, uneven crown, set off-centre. Never a star. */}
    <path
      d={`M${x + r * 0.05} ${y - r * 0.62} l${r * 0.22} ${r * 0.1} l${r * 0.12} ${-r * 0.16} l${r * 0.04} ${r * 0.24} l${-r * 0.3} ${r * 0.08} z`}
      className="fill-berry-fruit-crown"
    />
  </g>
);

export const Mascot: React.FC<MascotProps> = ({
  mood = "rest",
  size,
  hidden = false,
  still = false,
  className,
  onContextMenu,
}) => {
  const gradientId = useId().replace(/:/g, "");
  const label = `Berry, ${MOOD_LABELS[mood]}`;

  if (hidden) {
    return (
      <MessageCircle
        role="img"
        aria-label="Assistant"
        onContextMenu={onContextMenu}
        className={cn("text-muted-foreground", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const simplified = size < SIMPLIFIED_BELOW;
  const animate = !still;
  const flying = mood === "fetching";
  const berryInBeak = mood === "fetching" || mood === "asking";
  const berryOnGround = !simplified && (mood === "rest" || mood === "delivered" || mood === "curious" || mood === "thinking");
  const eyeClosed = mood === "off-duty";
  const pupilY = mood === "thinking" ? 14.3 : mood === "oops" ? 16.9 : 15.6;
  const headTilt = mood === "curious" ? -14 : mood === "off-duty" ? 10 : mood === "oops" ? 8 : 0;
  const bodySlump = mood === "oops" ? 4 : 0;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      onContextMenu={onContextMenu}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor="rgb(var(--berry-fruit-light))" />
          <stop offset="55%" stopColor="rgb(var(--berry-fruit-mid))" />
          <stop offset="100%" stopColor="rgb(var(--berry-fruit-dark))" />
        </radialGradient>
      </defs>

      <g
        className={cn(flying && animate && "motion-safe:animate-berry-bob")}
        transform={`translate(0 ${flying ? -4 : bodySlump})`}
      >
        {/* Tail and body */}
        <path
          d={
            simplified
              ? "M26 22 C19 28 15 36 15 43 C15 48 20 51 27 50 C37 49 45 41 46 26 Z"
              : "M27 20 C20 26 15.5 34 13.5 41 L4 53.5 L9.5 54.5 L19 47.5 C23 50 30 50.5 35 47.5 C43 43 46 34 44 24 Z"
          }
          className="fill-berry-ink"
        />

        {/* Wing: folded at rest, raised in flight */}
        {!simplified && (
          <g transform={flying ? "rotate(62 24 34)" : undefined}>
            <path d="M22 30 C28 26.5 35.5 29 37 35 C36 40 31 44 24 46 L9.5 53 C12.5 45 16.5 35.5 22 30 Z" className="fill-berry-wing" />
            <path d="M16 45 C21 42 26 41 31 37.5 M19 39.5 C23 37.5 27 36.5 31 33.5" className="stroke-berry-ink" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.55} />
          </g>
        )}

        {/* Legs, tucked away in flight */}
        {!simplified && !flying && (
          <g className="stroke-berry-ink" strokeWidth={1.8} strokeLinecap="round" fill="none">
            <path d="M27 49 L26.5 59.5 L30 59.5" />
            <path d="M33 48 L33 59.5 L36.5 59.5" />
          </g>
        )}

        {/* Head */}
        <g transform={`rotate(${headTilt} 40 21)`}>
          <circle cx={38.5} cy={17.5} r={simplified ? 12 : 10.5} className="fill-berry-ink" />
          {!simplified && (
            <path d="M32.5 9.6 C28 13 27.5 19 26.2 23 C28.5 27 32.5 29.5 36.5 28.5 C33.5 24 33.2 16 36.2 8.2 C35 8.4 33.6 8.9 32.5 9.6 Z" className="fill-berry-nape" />
          )}
          <path d={simplified ? "M49 13 L60 18 L49 22 Z" : "M47.8 14 L57.5 18.4 L47.8 21 Z"} className="fill-berry-beak" />
          {eyeClosed ? (
            <path d="M39 15.8 Q42.5 17.8 46 15.8" className="stroke-berry-eye" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          ) : (
            <>
              <circle cx={42.3} cy={15.6} r={simplified ? 5 : 3.7} className="fill-berry-eye" />
              <circle cx={43} cy={pupilY} r={simplified ? 2.2 : 1.7} className="fill-berry-ink" />
              {mood === "delivered" && (
                <path d="M38.4 13.2 Q42.3 11.8 46.2 13.2 L46.2 14.6 Q42.3 13.4 38.4 14.6 Z" className="fill-berry-ink" />
              )}
            </>
          )}
          {berryInBeak && !simplified && <Berry x={59} y={20} r={5} gradientId={gradientId} />}
        </g>
      </g>

      {berryOnGround && <Berry x={47} y={55} r={5} gradientId={gradientId} />}

      {mood === "oops" && !simplified && (
        <path
          d="M20 26 q-3 3 -1 7 q3 -3 1 -7 z"
          className={cn("fill-berry-wing", animate && "motion-safe:animate-berry-feather")}
        />
      )}
    </svg>
  );
};
