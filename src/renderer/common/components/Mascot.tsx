import React, { useId } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "../lib/utils";

export type Mood =
  | "rest"
  | "sitting"
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
  sitting: "sitting",
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

// Below this, the full drawing turns to mush, so Berry is just its head and the berry it carries.
const SIMPLIFIED_BELOW = 32;

// Animated parts turn and scale around their own box, not the whole drawing's.
// How far a walking bird's legs swing either way, in degrees.
const LEG_SWING = 30;

const ownBox = (origin: string): React.CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin });

// A dusty blueberry, lit from the upper left, with its crown off-centre. Never a star.
const Fruit: React.FC<{ x: number; y: number; r?: number; className?: string; style?: React.CSSProperties }> = ({
  x,
  y,
  r = 11,
  className,
  style,
}) => {
  const id = useId().replace(/:/g, "");

  return (
    <g transform={`translate(${x} ${y}) scale(${r / 10})`}>
      <g className={className} style={style}>
        <defs>
          <radialGradient id={id} cx="36%" cy="30%" r="80%">
            <stop offset="0%" stopColor="rgb(var(--berry-fruit-bloom))" />
            <stop offset="42%" stopColor="rgb(var(--berry-fruit-mid))" />
            <stop offset="100%" stopColor="rgb(var(--berry-fruit-dark))" />
          </radialGradient>
        </defs>
        <ellipse rx={10} ry={9.4} fill={`url(#${id})`} />
        <path
          d="M1.6 -5.2 L3.2 -6.2 L4.6 -5.4 L6 -5.3 L5.4 -3.9 L6.2 -2.8 L4.5 -2.7 L3.4 -1.5 L2.6 -2.9 L1.1 -3.5 Z"
          strokeWidth={1}
          strokeLinejoin="round"
          className="fill-berry-fruit-crown stroke-berry-fruit-crown"
        />
      </g>
    </g>
  );
};

// The blueberry on its own, marking something as new or in progress. Always beside words.
export const BerryDot: React.FC<{ size?: number; working?: boolean; className?: string }> = ({
  size = 10,
  working = false,
  className,
}) => (
  <svg
    aria-hidden
    viewBox="-11 -11 22 22"
    width={size}
    height={size}
    className={cn("shrink-0", working && "motion-safe:animate-pulse", className)}
  >
    <Fruit x={0} y={0} r={10} />
  </svg>
);

// Where the head turns from, at the base of the neck.
const NECK = "60 50";

// The parts of Berry in profile. Head and torso share a colour, so together they read as one outline.
const HEAD = "M86 40 C84 24 68 15 54 19 C43 22 37 32 37 44 C37 56 48 64 62 64 C76 64 88 54 86 40 Z";
const NAPE = "M54 19 C43 22 37 32 37 44 C42 52 52 52 57 45 C52 37 52 27 60 18 C58 18 56 18 54 19 Z";
const TORSO = "M40 40 C28 52 23 65 22 78 L5 103 C3 107 6 111 11 109 L35 93 C46 101 65 100 75 87 C85 74 86 60 82 51 C72 38 52 34 40 40 Z";
const WING = "M43 54 C55 47 68 53 66 66 C64 79 47 90 29 89 C30 75 34 62 43 54 Z";
const BEAK = "M84 35 C89 36 94 39 98 44 C94 46 89 47 84 47 C86 43 86 39 84 35 Z";
const BEAK_OPEN = "M84 33 C90 32 96 34 100 38 C95 41 89 42 84 42 C85 39 85 36 84 33 Z M84 43 C88 45 92 47 95 50 C91 51 87 50 83 48 Z";

type Eyes = "open" | "wide" | "smug" | "down" | "up" | "closed";

// A big pupil and one catchlight: calm and friendly, not a stare.
const PUPIL: Record<Exclude<Eyes, "closed">, { x: number; y: number; r: number }> = {
  open: { x: 2, y: 0.6, r: 5.6 },
  wide: { x: 2, y: 0.4, r: 5 },
  smug: { x: 2.4, y: 0.4, r: 5.4 },
  down: { x: 1.6, y: 2.2, r: 5.4 },
  up: { x: 1.8, y: -2.2, r: 5.4 },
};

const Eye: React.FC<{ x: number; y: number; r?: number; look: Eyes }> = ({ x, y, r = 8.6, look }) => {
  if (look === "closed") {
    return (
      <path
        d={`M${x - r} ${y} Q${x} ${y + r * 0.8} ${x + r} ${y}`}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
        className="stroke-berry-eye"
      />
    );
  }

  const pupil = PUPIL[look];
  const scale = r / 8.6;
  const px = x + pupil.x * scale;
  const pr = pupil.r * scale;

  // Heavy-lidded: only the lower half of the eye shows.
  if (look === "smug") {
    return (
      <g>
        <path d={`M${x - r} ${y} A${r} ${r} 0 0 0 ${x + r} ${y} Z`} className="fill-berry-eye" />
        <path d={`M${px - pr} ${y} A${pr} ${pr} 0 0 0 ${px + pr} ${y} Z`} className="fill-berry-pupil" />
      </g>
    );
  }

  return (
    <g>
      <circle cx={x} cy={y} r={r} className="fill-berry-eye" />
      <circle cx={px} cy={y + pupil.y * scale} r={pr} className="fill-berry-pupil" />
      <circle cx={px - 2.4 * scale} cy={y + (pupil.y - 2.6) * scale} r={1.9 * scale} className="fill-berry-eye" />
    </g>
  );
};

const Head: React.FC<{ turn?: number; eyes?: Eyes; berry?: boolean; open?: boolean; blink?: boolean }> = ({
  turn = 0,
  eyes = "open",
  berry = false,
  open = false,
  blink = false,
}) => (
  <g transform={`rotate(${turn} ${NECK})`}>
    <path d={HEAD} className="fill-berry-ink" />
    <path d={NAPE} className="fill-berry-nape" />
    <g className={cn(blink && "motion-safe:animate-berry-blink")} style={blink ? ownBox("center") : undefined}>
      <Eye x={69} y={35} look={eyes} />
    </g>
    {berry && <Fruit x={97} y={53} />}
    <path d={open ? BEAK_OPEN : BEAK} className="fill-berry-beak" />
  </g>
);

const Torso: React.FC = () => (
  <>
    <path d={TORSO} className="fill-berry-ink" />
    <path d={WING} className="fill-berry-wing" />
  </>
);

// Short legs with three-toed feet. The hind toe points back along the bird.
const LEGS = "M52 97 L51 112 M45 114 L51 112 L58 114 M63 95 L63 110 M57 112 L63 110 L70 112";
const LEG_PROPS = { strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none", className: "stroke-berry-ink" } as const;
const Legs: React.FC = () => <path d={LEGS} {...LEG_PROPS} />;

// The seat is at 86 of 120, so the belly rests on the edge and the legs hang over it.
const SEAT_LIFT = -11;
const Sitting: React.FC<{ animate: boolean }> = ({ animate }) => (
  <g transform={`translate(0 ${SEAT_LIFT})`}>
    <g {...LEG_PROPS}>
      <path d="M52 97 L50 117 M46 119 L50 117 L55 119" className={cn("stroke-berry-ink", animate && "motion-safe:animate-berry-swing")} style={ownBox("50% 0%")} />
      <path d="M63 95 L63 115 M59 117 L63 115 L68 117" className={cn("stroke-berry-ink", animate && "motion-safe:animate-berry-swing-back")} style={ownBox("50% 0%")} />
    </g>
    <Torso />
    <Head berry blink={animate} />
  </g>
);

// One drawing per mood, so each is recognisable from its outline alone.
const Pose: React.FC<{ mood: Mood; animate: boolean }> = ({ mood, animate }) => {
  switch (mood) {
    case "rest":
      return (
        <>
          <Legs />
          <Torso />
          <Head berry blink={animate} />
        </>
      );

    case "sitting":
      return <Sitting animate={animate} />;

    case "curious":
      // Leans in with the head cocked hard over.
      return (
        <>
          <Legs />
          <g transform="rotate(9 58 112)">
            <Torso />
          </g>
          <g transform="translate(9 2)">
            <Head turn={-20} eyes="wide" berry blink={animate} />
          </g>
        </>
      );

    case "thinking":
      // Head back, eyes up, tossing the berry while working it out.
      return (
        <>
          <Legs />
          <Torso />
          <Head turn={-22} eyes="up" open />
          <Fruit x={102} y={10} r={10} className={cn(animate && "motion-safe:animate-berry-toss")} />
        </>
      );

    case "fetching":
      // Stretched out level, wings beating, feet tucked.
      return (
        <g className={cn(animate && "motion-safe:animate-berry-bob")}>
          <g className={cn(animate && "motion-safe:animate-berry-flap")} style={ownBox("70% 100%")}>
            <path d="M54 50 C52 34 58 14 74 3 C78 1 80 5 79 8 C82 8 84 12 82 15 C85 17 85 21 83 23 C85 26 84 30 80 32 C78 41 74 50 68 56 Z" className="fill-berry-ink" />
          </g>
          <g transform="rotate(24 50 70)">
            <path d={TORSO} className="fill-berry-ink" />
            <path d="M52 97 L50 102 M63 95 L61 100" {...LEG_PROPS} />
          </g>
          <g className={cn(animate && "motion-safe:animate-berry-flap")} style={ownBox("70% 100%")}>
            <path d="M64 62 C52 46 40 24 22 6 C18 3 15 7 16 11 C12 11 10 16 13 19 C9 21 9 26 13 27 C11 31 13 35 18 36 C17 39 20 42 24 42 C26 49 34 62 41 69 C49 72 57 70 64 62 Z" className="fill-berry-wing" />
          </g>
          <g transform="translate(14 8) rotate(6 60 50)">
            <Head berry />
          </g>
        </g>
      );

    case "asking":
      // Square on, looking right at you, berry held out.
      return (
        <>
          <path d="M50 96 L49 112 M43 114 L49 112 L55 114 M70 96 L71 112 M65 114 L71 112 L77 114" {...LEG_PROPS} />
          <ellipse cx={60} cy={74} rx={29} ry={30} className="fill-berry-ink" />
          <path d="M34 56 C26 66 25 84 30 94 C37 90 41 76 39 62 Z" className="fill-berry-wing" />
          <path d="M86 56 C94 66 95 84 90 94 C83 90 79 76 81 62 Z" className="fill-berry-wing" />
          <g transform="rotate(-5 60 36)">
            <circle cx={60} cy={36} r={26} className="fill-berry-nape" />
            <path d="M42 17 C51 8 69 8 78 17 C82 27 80 42 74 52 C69 60 51 60 46 52 C40 42 38 27 42 17 Z" className="fill-berry-ink" />
            <Fruit x={60} y={66} />
            <path d="M54 38 C57 36 63 36 66 38 C65.6 43 63 49 61 51 C60.4 52 59.6 52 59 51 C57 49 54.4 43 54 38 Z" className="fill-berry-beak" />
            <Eye x={50} y={30} r={6.8} look="wide" />
            <Eye x={70} y={30} r={6.8} look="wide" />
          </g>
        </>
      );

    case "delivered":
      // Chest out, chin up, the job set down in front of it.
      return (
        <>
          <g transform="translate(-10 0)">
            <Legs />
            <Torso />
            <Head turn={-12} eyes="smug" />
          </g>
          <Fruit x={92} y={104} className={cn(animate && "motion-safe:animate-berry-settle")} />
        </>
      );

    case "oops":
      // Slumped, head hanging, berry rolled out of reach.
      return (
        <>
          <g transform="translate(-8 4)">
            <Legs />
            <g transform="rotate(8 50 80) translate(0 3)">
              <Torso />
            </g>
            <g transform="translate(-2 12)">
              <Head turn={22} eyes="down" />
            </g>
          </g>
          <Fruit x={104} y={106} r={9} />
          <path
            d="M16 30 C10 38 10 46 14 54 C20 46 21 38 16 30 Z"
            className={cn("fill-berry-wing", animate && "motion-safe:animate-berry-feather")}
            style={ownBox("center")}
          />
        </>
      );

    case "off-duty":
      // A fluffed-up ball with the head sunk in and the berry safe beside it.
      return (
        <>
          <path d="M26 88 L8 106 C5 110 9 114 14 112 L38 100 Z" className="fill-berry-ink" />
          <ellipse cx={52} cy={80} rx={36} ry={32} className="fill-berry-ink" />
          <path d="M30 66 C42 58 58 64 58 78 C58 92 44 104 26 102 C22 90 22 76 30 66 Z" className="fill-berry-wing" />
          <g transform="translate(4 22)">
            <Head turn={16} eyes="closed" />
          </g>
          <Fruit x={102} y={104} r={10} />
        </>
      );
  }
};

// Just the head and the berry, so Berry is still Berry at icon sizes. Pose and eye carry the mood.
const SimplifiedPose: React.FC<{ mood: Mood }> = ({ mood }) => {
  const eyes: Eyes =
    mood === "off-duty" ? "closed" : mood === "oops" ? "down" : mood === "thinking" ? "up" : mood === "delivered" ? "smug" : mood === "asking" ? "wide" : "open";
  const turn = mood === "curious" ? -18 : mood === "thinking" ? -12 : mood === "oops" || mood === "off-duty" ? 12 : 0;

  return (
    <g transform="translate(-34 0) scale(1.42)">
      <Head turn={turn} eyes={eyes} berry />
    </g>
  );
};

// One of the small birds that walk behind the new tab page. Purely decoration, so it has no label.
// Its legs are posed by the walk itself, so they swing exactly in time with its steps.
export const WalkingBird: React.FC<{ size: number; foot: -1 | 0 | 1; stepMs: number; pecking?: boolean }> = ({
  size,
  foot,
  stepMs,
  pecking = false,
}) => {
  const leg = (turn: number): React.CSSProperties => ({
    ...ownBox("50% 0%"),
    transform: `rotate(${turn}deg)`,
    transition: `transform ${stepMs}ms linear`,
  });

  return (
    <svg aria-hidden viewBox="0 0 120 120" width={size} height={size} className="overflow-visible">
      <g {...LEG_PROPS}>
        <path d="M52 96 L52 112 L59 112" className="stroke-berry-ink" style={leg(foot * LEG_SWING)} />
        <path d="M63 94 L63 112 L70 112" className="stroke-berry-ink" style={leg(foot * -LEG_SWING)} />
      </g>
      <Torso />
      <g className={cn(pecking && "motion-safe:animate-berry-peck")} style={{ transformOrigin: "60px 50px" }}>
        <Head />
      </g>
    </svg>
  );
};

export const Mascot: React.FC<MascotProps> = ({
  mood = "rest",
  size,
  hidden = false,
  still = false,
  className,
  onContextMenu,
}) => {
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

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      onContextMenu={onContextMenu}
      className={cn("shrink-0 overflow-visible", className)}
    >
      {/* Remounts on every mood, so poses change with a quick fade rather than a jump. */}
      <g key={mood} className={cn(!still && "animate-berry-pose")}>
        {size < SIMPLIFIED_BELOW ? <SimplifiedPose mood={mood} /> : <Pose mood={mood} animate={!still} />}
      </g>
    </svg>
  );
};
