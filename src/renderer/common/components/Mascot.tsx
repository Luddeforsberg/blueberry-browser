import React, { createContext, useContext, useId } from "react";
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

// A dusty blueberry in the same flat style as the bird, with its crown facing us. Never a star.
const Fruit: React.FC<{ x: number; y: number; r?: number; className?: string; style?: React.CSSProperties }> = ({
  x,
  y,
  r = 7,
  className,
  style,
}) => (
  <g transform={`translate(${x} ${y}) scale(${r / 7})`}>
    <g className={className} style={style}>
      <ellipse rx={7} ry={6.6} className="fill-berry-fruit-mid" />
      <path d="M-5.6 3.8 C-2.4 6.4 3.4 6.2 5.8 2.6 C6.8 1 7 -0.6 6.8 -2 C5.4 1.6 0.8 4.6 -5.6 3.8 Z" className="fill-berry-fruit-dark" />
      <ellipse cx={-2.8} cy={-2.6} rx={3} ry={1.9} transform="rotate(-32 -2.8 -2.6)" className="fill-berry-fruit-bloom" />
      <path
        d="M1 -3.5 L2.1 -4.2 L3 -3.7 L4 -3.6 L3.6 -2.7 L4.2 -1.9 L3 -1.9 L2.3 -1.1 L1.7 -2 L0.7 -2.4 Z"
        strokeWidth={0.8}
        strokeLinejoin="round"
        className="fill-berry-fruit-crown stroke-berry-fruit-crown"
      />
    </g>
  </g>
);

type Eyes = "open" | "wide" | "smug" | "down" | "up" | "closed";

// Big pupils and a soft catchlight: a friendly look rather than a pale stare.
const PUPIL: Record<Exclude<Eyes, "closed">, { x: number; y: number; r: number }> = {
  open: { x: 0.3, y: 0.3, r: 4 },
  wide: { x: 0.3, y: 0.3, r: 3.7 },
  smug: { x: 0.6, y: 0.5, r: 3.6 },
  down: { x: 0.3, y: 1, r: 3.9 },
  up: { x: 0.5, y: -0.9, r: 3.8 },
};

const Eye: React.FC<{ x: number; y: number; rx: number; ry: number; look: Eyes }> = ({ x, y, rx, ry, look }) => {
  if (look === "closed") {
    return (
      <path
        d={`M${x - rx} ${y} Q${x} ${y + ry * 0.75} ${x + rx} ${y}`}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        className="stroke-berry-eye"
      />
    );
  }

  // Pupils shrink evenly with the eye, so they stay round however narrow it is.
  const pupil = PUPIL[look];
  const scale = rx / 5;
  const r = pupil.r * scale;
  const px = x + pupil.x * scale;

  // Heavy-lidded: only the lower half of the eye shows.
  if (look === "smug") {
    return (
      <g>
        <path d={`M${x - rx} ${y} A${rx} ${ry} 0 0 0 ${x + rx} ${y} Z`} className="fill-berry-eye" />
        <path d={`M${px - r} ${y} A${r} ${r} 0 0 0 ${px + r} ${y} Z`} className="fill-berry-pupil" />
      </g>
    );
  }

  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} className="fill-berry-eye" />
      <circle cx={px} cy={y + pupil.y * scale} r={r} className="fill-berry-pupil" />
      <circle cx={px - 1.3 * scale} cy={y + (pupil.y - 1.5) * scale} r={1.2 * scale} className="fill-berry-eye" />
    </g>
  );
};

// A small soft crest on the crown.
const Crest: React.FC = () => (
  <path d="M-3.4 -12.8 C-3.2 -15 -1.4 -16.4 1 -16.4 C0.4 -15.4 0.8 -14.2 2.4 -13 Z" className="fill-berry-ink" />
);

interface HeadProps {
  x: number;
  y: number;
  tilt?: number;
  scale?: number;
  eyes?: Eyes;
  berry?: boolean;
  open?: boolean;
  blink?: boolean;
  // At icon sizes the far eye is noise, so the near one grows to carry the face.
  icon?: boolean;
}

// Turned three-quarters towards us. A dark cap and throat with a grey hood behind them is what makes a jackdaw.
const Head: React.FC<HeadProps> = ({ x, y, tilt = 0, scale = 1, eyes = "open", berry = false, open = false, blink = false, icon = false }) => (
  <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
    <circle r={13.5} className="fill-berry-nape" />
    {!icon && <Crest />}
    <path d="M-5.4 -12.4 C0 -15.2 9 -14.6 12.4 -6.6 C15 0 13 8.6 6.4 12.2 C2.6 14.2 -1.6 13.4 -3.6 11.6 C-1.6 7 -2.8 2 -5 -2 C-7 -5.8 -8 -10 -5.4 -12.4 Z" className="fill-berry-ink" />
    {berry && <Fruit x={15.6} y={10} />}
    <path d={open ? "M6.8 1 C10 -0.6 14 -0.2 17 2.6 C17.4 3.2 17 3.8 16.4 3.8 C13 4.8 9.6 5.2 7 5 C5.8 4 5.8 2 6.8 1 Z" : "M6.8 1.2 C10 -0.2 14 0.8 16.6 4.4 C17 5 16.6 5.6 16 5.6 C13 6.2 9.6 6.6 7 6 C5.6 4.8 5.6 2.4 6.8 1.2 Z"} className="fill-berry-beak" />
    {open && <path d="M7 6 C9.6 6.8 12 8 13.6 9.6 C14 10.2 13.6 10.6 13 10.6 C10.6 10.6 8.4 10 6.6 8.8 Z" className="fill-berry-beak" />}
    <g className={cn(blink && "motion-safe:animate-berry-blink")} style={blink ? ownBox("center") : undefined}>
      {icon ? (
        <Eye x={4} y={-3.4} rx={6.4} ry={6.6} look={eyes} />
      ) : (
        <>
          <Eye x={0.8} y={-3.2} rx={eyes === "closed" ? 4 : 5} ry={5.4} look={eyes} />
          <Eye x={9.6} y={-3.2} rx={eyes === "closed" ? 2.2 : 3.3} ry={4.8} look={eyes} />
        </>
      )}
    </g>
  </g>
);

// Facing us, for when Berry is waiting on you and looking right at you.
const FrontHead: React.FC<{ x: number; y: number; tilt?: number }> = ({ x, y, tilt = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
    <circle r={14} className="fill-berry-nape" />
    <Crest />
    <path d="M-9.4 -10.6 C-4.8 -15.6 4.8 -15.6 9.4 -10.6 C11.6 -5 10.6 3.6 7.4 8.6 C4.6 13.6 -4.6 13.6 -7.4 8.6 C-10.6 3.6 -11.6 -5 -9.4 -10.6 Z" className="fill-berry-ink" />
    <Fruit x={0} y={13.4} />
    <path d="M-3 1.4 C-1.4 0.4 1.4 0.4 3 1.4 C2.8 4 1.4 7 0.5 8.2 C0.2 8.6 -0.2 8.6 -0.5 8.2 C-1.4 7 -2.8 4 -3 1.4 Z" className="fill-berry-beak" />
    <Eye x={-5} y={-3.6} rx={4} ry={4.6} look="wide" />
    <Eye x={5} y={-3.6} rx={4} ry={4.6} look="wide" />
  </g>
);

// Stubby legs and soft three-toed feet.
const Feet: React.FC<{ legs: Array<[number, number]>; ground?: number }> = ({ legs, ground = 59 }) => (
  <g strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" className="stroke-berry-ink">
    {legs.map(([x, top]) => (
      <path key={x} d={`M${x} ${top} L${x} ${ground} M${x - 1.8} ${ground + 0.4} L${x} ${ground} L${x + 3.4} ${ground + 0.4} M${x} ${ground} L${x + 1.4} ${ground + 1}`} />
    ))}
  </g>
);

const Tail: React.FC<{ x: number; y: number; turn?: number }> = ({ x, y, turn = 0 }) => (
  <path
    transform={`translate(${x} ${y}) rotate(${turn})`}
    d="M2 -2 C-4 2 -10 7 -13.4 12 C-14.6 14.4 -11.8 16 -10 14 C-10 16.4 -7 17.4 -5.8 15.2 C-5 16.6 -2.8 16.6 -1.8 14.8 C1.4 11 5 7 7 3 Z"
    className="fill-berry-ink"
  />
);

// A rounded wing with soft feather tips, drawn from the shoulder.
const Wing: React.FC<{ x: number; y: number; turn?: number; scale?: number }> = ({ x, y, turn = 0, scale = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${scale})`}>
    <path d="M0 0 C6 -4 14 -2 16 4 C17.4 8 15 11.6 11.4 13.4 C11.8 16.4 8.4 18.6 5.4 17.2 C4.8 20.4 0.4 21.6 -2 18.8 C-5.6 14.4 -4.6 4.6 0 0 Z" className="fill-berry-wing" />
    <path d="M2.6 8.4 C5 10 8 10.2 11 9 M0.4 12.4 C2 14 4.6 14.6 6.4 14" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.7} className="stroke-berry-ink" />
  </g>
);

const GlowId = createContext("");

// Soft light on the chest, which is what gives the flat body some plush.
const Glow: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <radialGradient id={id}>
      <stop offset="0%" stopColor="rgb(var(--berry-wing))" stopOpacity={0.95} />
      <stop offset="100%" stopColor="rgb(var(--berry-wing))" stopOpacity={0} />
    </radialGradient>
  </defs>
);

const Tuft: React.FC<{ x: number; y: number; turn: number }> = ({ x, y, turn }) => (
  <path transform={`translate(${x} ${y}) rotate(${turn})`} d="M-3 -2.4 C0 -2.2 3 -0.4 4.4 2.6 C1.6 2.8 -1.2 2.2 -3 1 Z" className="fill-berry-ink" />
);

// A plump, smooth body with a few deliberate feathers breaking the outline.
const Body: React.FC<{ x: number; y: number; rx?: number; ry?: number; tufts?: boolean }> = ({ x, y, rx = 16.5, ry = 17.5, tufts = true }) => {
  const glow = useContext(GlowId);

  return (
    <>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} className="fill-berry-ink" />
      {tufts && (
        <>
          <Tuft x={x + rx * 0.9} y={y + ry * 0.3} turn={40} />
          <Tuft x={x + rx * 0.62} y={y + ry * 0.76} turn={62} />
        </>
      )}
      <ellipse cx={x + rx * 0.3} cy={y + ry * 0.22} rx={rx * 0.68} ry={ry * 0.72} fill={`url(#${glow})`} />
    </>
  );
};

const Perched: React.FC<{ blink: boolean }> = ({ blink }) => (
  <>
    <Tail x={18} y={44} />
    <Feet legs={[[24, 52], [33, 52]]} />
    <Body x={28} y={38} />
    <Wing x={16} y={30} />
    <Head x={37} y={21} berry blink={blink} />
  </>
);

// One drawing per mood, so each is recognisable from its outline alone.
const Pose: React.FC<{ mood: Mood; animate: boolean }> = ({ mood, animate }) => {
  switch (mood) {
    case "rest":
      return <Perched blink={animate} />;

    case "sitting":
      // On the edge of something, legs hanging over it and swinging.
      return (
        <>
          <Tail x={17} y={36} turn={12} />
          <Body x={29} y={31} rx={15.5} ry={15} tufts={false} />
          <Wing x={17} y={24} scale={0.85} />
          <g strokeWidth={2} strokeLinecap="round" fill="none" className="stroke-berry-ink">
            <path d="M26 44 L25 56 M23 57 L25 56 L28 57" className={cn(animate && "motion-safe:animate-berry-swing")} style={ownBox("50% 0%")} />
            <path d="M35 44 L35 56 M33 57 L35 56 L38 57" className={cn(animate && "motion-safe:animate-berry-swing-back")} style={ownBox("50% 0%")} />
          </g>
          <Head x={36} y={15} berry blink={animate} />
        </>
      );

    case "curious":
      // Leans in with the head cocked hard over.
      return (
        <>
          <g transform="rotate(9 26 58)">
            <Tail x={18} y={45} />
            <Body x={28} y={39} />
            <Wing x={16} y={31} />
          </g>
          <Feet legs={[[24, 54], [33, 54]]} />
          <Head x={43} y={22} tilt={-22} eyes="wide" berry blink={animate} />
        </>
      );

    case "thinking":
      // Head back, eyes up, tossing the berry while working it out.
      return (
        <>
          <Tail x={18} y={44} />
          <Feet legs={[[24, 52], [33, 52]]} />
          <Body x={28} y={38} />
          <Wing x={16} y={30} />
          <Head x={35} y={22} tilt={-24} eyes="up" open />
          <Fruit x={55} y={2} r={6} className={cn(animate && "motion-safe:animate-berry-toss")} />
        </>
      );

    case "fetching":
      // Stretched out flat, wings up, feet tucked.
      return (
        <g className={cn(animate && "motion-safe:animate-berry-bob")}>
          <g className={cn(animate && "motion-safe:animate-berry-flap")} style={ownBox("70% 100%")}>
            <path d="M29 28 C29 18 32 8 40 1 C42 0 43 2 42.4 4 C44 4 45 6 44 8 C45.6 9 45.6 11 44.4 12.4 C45.4 14 44.8 16 43 17 C42 22 40 27 37 31 Z" className="fill-berry-ink" />
          </g>
          <Tail x={15} y={32} turn={60} />
          <Body x={28} y={35} rx={17} ry={11.5} tufts={false} />
          <path d="M26 45.6 L25 49 M33 45.6 L32 49" strokeWidth={2} strokeLinecap="round" className="stroke-berry-ink" />
          <g className={cn(animate && "motion-safe:animate-berry-flap")} style={ownBox("70% 100%")}>
            <path d="M35 34 C28 25 22 13 12 3 C9.6 1.4 8 3.6 8.6 6 C6.6 6 5.6 8.4 7 10 C5 11 5 13.6 7 14.6 C6 16.6 7 18.6 9.4 19 C9 21 10.4 22.6 12.6 22.6 C14 26 18 33 22 37 C26 38.6 31 37.6 35 34 Z" className="fill-berry-wing" />
            <path d="M15 12 C19 19 24 26 28 32 M11 18 C15 24 20 30 24 35" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.7} className="stroke-berry-ink" />
          </g>
          <Head x={46} y={24} scale={0.84} tilt={4} berry />
        </g>
      );

    case "asking":
      // Square on, looking right at you, berry held out.
      return (
        <>
          <Feet legs={[[26, 54], [36, 54]]} />
          <Body x={32} y={40} rx={16} ry={17} tufts={false} />
          <path d="M18.6 30 C14 36 13 46 16 52 C20 50 22.6 42 21.6 33 Z" className="fill-berry-wing" />
          <path d="M45.4 30 C50 36 51 46 48 52 C44 50 41.4 42 42.4 33 Z" className="fill-berry-wing" />
          <FrontHead x={32} y={20} tilt={-5} />
        </>
      );

    case "delivered":
      // Chest out, chin up, the job set down in front of it.
      return (
        <>
          <Tail x={13} y={42} />
          <Feet legs={[[20, 52], [29, 52]]} />
          <Body x={24} y={37} />
          <Wing x={12} y={29} />
          <Head x={32} y={18} tilt={-14} eyes="smug" />
          <Fruit x={50} y={53.4} className={cn(animate && "motion-safe:animate-berry-settle")} />
        </>
      );

    case "oops":
      // Slumped, head hanging, berry rolled out of reach.
      return (
        <>
          <Tail x={14} y={49} turn={8} />
          <Feet legs={[[23, 54], [32, 54]]} />
          <Body x={25} y={43} rx={16} ry={14.5} />
          <Wing x={13} y={37} turn={14} />
          <Head x={34} y={30} tilt={22} eyes="down" />
          <Fruit x={56} y={55} r={5.6} />
          <path
            d="M9 20 C6 24 6 28 8 32 C11 28 11.6 24 9 20 Z"
            className={cn("fill-berry-wing", animate && "motion-safe:animate-berry-feather")}
            style={ownBox("center")}
          />
        </>
      );

    case "off-duty":
      // A fluffed-up ball with the head sunk in and the berry safe beside it.
      return (
        <>
          <Tail x={14} y={49} turn={22} />
          <Body x={29} y={42} rx={19} ry={17} tufts={false} />
          <Wing x={15} y={36} scale={1.1} turn={8} />
          <Head x={35} y={28} tilt={18} scale={0.92} eyes="closed" />
          <Fruit x={54} y={54} r={6} />
        </>
      );
  }
};

// Just the head and the berry, so Berry is still Berry at icon sizes. Pose and eye carry the mood.
const SimplifiedPose: React.FC<{ mood: Mood }> = ({ mood }) => {
  const eyes: Eyes =
    mood === "off-duty" ? "closed" : mood === "oops" ? "down" : mood === "thinking" ? "up" : mood === "delivered" ? "smug" : mood === "asking" ? "wide" : "open";
  const tilt = mood === "curious" ? -18 : mood === "thinking" ? -12 : mood === "oops" || mood === "off-duty" ? 12 : 0;

  return <Head x={25} y={27} scale={1.6} tilt={tilt} eyes={eyes} berry icon />;
};

// One of the small birds that walk behind the new tab page. Purely decoration, so it has no label.
// Its legs are posed by the walk itself, so they swing exactly in time with its steps.
export const WalkingBird: React.FC<{ size: number; foot: -1 | 0 | 1; stepMs: number; pecking?: boolean }> = ({
  size,
  foot,
  stepMs,
  pecking = false,
}) => {
  const glow = useId().replace(/:/g, "");
  const leg = (turn: number): React.CSSProperties => ({
    ...ownBox("50% 0%"),
    transform: `rotate(${turn}deg)`,
    transition: `transform ${stepMs}ms linear`,
  });

  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className="overflow-visible">
      <Glow id={glow} />
      <GlowId.Provider value={glow}>
        <Tail x={19} y={44} />
        <g strokeWidth={2.2} strokeLinecap="round" fill="none" className="stroke-berry-ink">
          <path d="M26 50 L26 60 L29.6 60" style={leg(foot * LEG_SWING)} />
          <path d="M34 50 L34 60 L37.6 60" style={leg(foot * -LEG_SWING)} />
        </g>
        <Body x={29} y={39} rx={15} ry={14.5} tufts={false} />
        <Wing x={18} y={33} scale={0.8} />
        <g className={cn(pecking && "motion-safe:animate-berry-peck")} style={{ transformOrigin: "30px 34px" }}>
          <Head x={38} y={24} scale={0.9} />
        </g>
      </GlowId.Provider>
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
  const glow = useId().replace(/:/g, "");

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
      viewBox="0 0 64 64"
      width={size}
      height={size}
      onContextMenu={onContextMenu}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <Glow id={glow} />
      <GlowId.Provider value={glow}>
        {/* Remounts on every mood, so poses change with a quick fade rather than a jump. */}
        <g key={mood} className={cn(!still && "animate-berry-pose")}>
          {size < SIMPLIFIED_BELOW ? <SimplifiedPose mood={mood} /> : <Pose mood={mood} animate={!still} />}
        </g>
      </GlowId.Provider>
    </svg>
  );
};
