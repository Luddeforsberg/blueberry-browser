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
  const pupilY = mood === "thinking" ? 16.6 : mood === "oops" ? 19.4 : 18;
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
        {!simplified && <path d="M18 43 L5 52 L20 47 Z" className="fill-berry-ink" />}
        <path
          d="M15 44 C11 33 19 21 32 20 C42 19 48 26 47 35 C46 44 37 50 26 49 C21 48.5 17 47 15 44 Z"
          className="fill-berry-ink"
        />

        {/* Wing: folded at rest, raised in flight */}
        {!simplified && (
          <path
            d="M20 31 C27 27 37 31 37 38 C33 44 23 44 19 40 C18 37 18 34 20 31 Z"
            className="fill-berry-wing"
            transform={flying ? "rotate(-38 26 32)" : undefined}
          />
        )}

        {/* Legs, tucked away in flight */}
        {!simplified && !flying && (
          <g className="stroke-berry-ink" strokeWidth={2.2} strokeLinecap="round">
            <line x1={28} y1={48} x2={27} y2={58} />
            <line x1={34} y1={47} x2={34} y2={58} />
          </g>
        )}

        {/* Head */}
        <g transform={`rotate(${headTilt} 40 21)`}>
          <circle cx={40} cy={20} r={simplified ? 12 : 11} className="fill-berry-ink" />
          {!simplified && (
            <path d="M31.5 13 C29 19 30 26 34.5 30 C33 24 33.5 18 37 11.5 C35 11.6 33 12.2 31.5 13 Z" className="fill-berry-nape" />
          )}
          <path d="M50 18.5 L58.5 21.5 L50 24 Z" className="fill-berry-beak" />
          {eyeClosed ? (
            <path d="M40 18.5 Q43.5 20.5 47 18.5" className="stroke-berry-eye" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          ) : (
            <>
              <circle cx={43.5} cy={18} r={simplified ? 5 : 4} className="fill-berry-eye" />
              <circle cx={44.3} cy={pupilY} r={simplified ? 2.2 : 1.8} className="fill-berry-ink" />
              {mood === "delivered" && (
                <path d="M39.4 15.6 Q43.5 14.2 47.6 15.6 L47.6 17 Q43.5 15.8 39.4 17 Z" className="fill-berry-ink" />
              )}
            </>
          )}
          {berryInBeak && !simplified && <Berry x={60} y={22} r={5} gradientId={gradientId} />}
        </g>
      </g>

      {berryOnGround && <Berry x={50} y={55} r={4.5} gradientId={gradientId} />}

      {mood === "oops" && !simplified && (
        <path
          d="M20 26 q-3 3 -1 7 q3 -3 1 -7 z"
          className={cn("fill-berry-wing", animate && "motion-safe:animate-berry-feather")}
        />
      )}
    </svg>
  );
};
