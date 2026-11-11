import React, { createContext, useContext, useId, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { MascotAccessory, MascotLook } from "@shared/library";
import { cn } from "../lib/utils";
import { useMascotReaction, type Reaction } from "./useMascotReaction";

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
  // Colours and an accessory for one of the flock. Left out, this is Berry.
  look?: MascotLook;
  // What it's called to assistive technology.
  name?: string;
  // Hide Berry: a plain icon stands in, and every feature keeps working.
  hidden?: boolean;
  // Keep Berry still: the pose stays, the motion stops. Reduced motion does the same through CSS.
  still?: boolean;
  // Reacts when clicked. Decoration only: any control it's inside still takes the click as well.
  lively?: boolean;
  // Leaves out the blink where a bird is always on screen and nothing's happening. A click still gets its reaction.
  noBlink?: boolean;
  // The valley's fine grain on the body, following the light. Only in the valley and on a composer, and only at 32px
  // and up: smaller, and on a web page, it's flat colour.
  grain?: boolean;
  className?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
}

// DESIGN.md section 8: under 24px a bird only says who it is, under 32px it's the simplified drawing.
const MOOD_FROM = 24;
const FULL_FROM = 32;

// Animated parts turn and scale around their own box, not the whole drawing's.
const ownBox = (origin: string): React.CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin });

// A round blueberry with its bloom lit from the upper left. On its own it's the mark for work in progress. Never a star.
const Fruit: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 10 }) => {
  const id = useId().replace(/:/g, "");
  return (
    <g transform={`translate(${x} ${y}) scale(${r / 10})`}>
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="rgb(var(--berry-fruit-bloom))" />
          <stop offset="55%" stopColor="rgb(var(--berry-fruit-mid))" />
          <stop offset="100%" stopColor="rgb(var(--berry-fruit-dark))" />
        </radialGradient>
      </defs>
      <circle r={10} fill={`url(#${id})`} />
    </g>
  );
};

// The blueberry on its own, marking something in progress. Always beside words.
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

// The bird is drawn on a 100-unit grid, the painter's, and placed in a 120-unit box so its feet land where every place
// that stands it on something expects them: 57 across and 113 down.
const FRAME = "translate(-2 5) scale(1.15)";
// Where the head turns from, low at the back of the round body.
const NECK = "52 50";
// The body: one round shape, like the fruit, lit from the upper left.
const BODY = { cx: 48, cy: 54, rx: 31, ry: 29 };
const TAIL = "M22 56 L3 49 L7 67 L24 70 Z";
const WING = { cx: 37, cy: 62, rx: 16, ry: 10.5, turn: 20 };
// The blueberry's crown: three points on top. Every bird has it.
const CREST = "M35 29 L32 13 L40.5 22 L45 9 L49.5 22 L58 13 L55 29 Z";
const CREST_FLAT = "M33 31 L24 25 L36 25 L38 19 L46 24 L55 21 L55 30 Z";
const CREST_DROOP = "M35 30 L22 24 L37 23 L36 14 L47 22 L54 17 L55 30 Z";
const BEAK_UPPER = "M76 46 L94 54 L76 54 Z";
const BEAK_LOWER = "M76 54 L94 54 L76 61 Z";
// Two short legs with a foot forward, in the bird's own orange.
const LEGS = "M41 80 L41 94 L48 94 M55 80 L55 94 L62 94";
const LEG_STROKE = { strokeWidth: 4.4, strokeLinecap: "round", strokeLinejoin: "round", fill: "none", className: "stroke-berry-legs" } as const;
// A feather from the wing, for when something went wrong.
const FEATHER = "M14 40 C9 47 9 54 12 60 C17 54 18 47 14 40 Z";
const EYE = { x: 60, y: 45, r: 7.2 };

type Eyes = "open" | "wide" | "smug" | "down" | "up" | "closed";

// One white eye with a big dark pupil and a catchlight, which carries most of the expression.
const Eye: React.FC<{ x?: number; y?: number; r?: number; look: Eyes; facing?: boolean }> = ({ x = EYE.x, y = EYE.y, r = EYE.r, look, facing = false }) => {
  const s = r / EYE.r;
  if (look === "closed") {
    return <path d={`M${x - r} ${y} Q${x} ${y + r * 0.75} ${x + r} ${y}`} strokeWidth={2.4} strokeLinecap="round" fill="none" className="stroke-berry-pupil" />;
  }
  const along = facing ? 0 : 2 * s;
  const shift = { open: [along, 0.5], wide: [along, 0], smug: [along, 1.2], down: [along * 0.6, 2.2], up: [along * 0.8, -2.4] }[look];
  const pr = (look === "wide" ? 4.4 : 3.8) * s;
  const px = x + shift[0];
  const py = y + shift[1] * s;
  return (
    <g>
      <circle cx={x} cy={y} r={r} className="fill-berry-eye" />
      <circle cx={px} cy={py} r={pr} className="fill-berry-pupil" />
      <circle cx={px + 1.4 * s} cy={py - 1.5 * s} r={1.2 * s} className="fill-berry-eye" />
      {/* Heavy-lidded: the body's own colour comes down over the top half. */}
      {look === "smug" && <path d={`M${x - r - 0.6} ${y + 0.4} A${r + 0.6} ${r + 0.6} 0 0 1 ${x + r + 0.6} ${y + 0.4} Z`} className="fill-berry-ink" />}
    </g>
  );
};

// A dark edge, so an accessory stands off any body colour and any background.
const GEAR_EDGE = { strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round", className: "fill-berry-gear stroke-berry-pupil" } as const;

const GearContext = createContext<MascotAccessory>("none");

// In the head's own coordinates, so it moves with the head in every pose. Big shapes in their own colour, so one can
// tell mascots apart at icon size. `front` is for the one pose that faces you.
const Gear: React.FC<{ front?: boolean }> = ({ front = false }) => {
  const accessory = useContext(GearContext);
  switch (accessory) {
    case "none":
      return null;
    case "crown":
      return front ? (
        <path d="M40 22 L37 9 L44 15 L50 6 L56 15 L63 9 L60 22 Q50 19 40 22 Z" {...GEAR_EDGE} />
      ) : (
        <g transform="rotate(12 64 24)">
          <path d="M55 31 L52 17 L59 23 L65 13 L71 23 L78 17 L75 31 Q65 28 55 31 Z" {...GEAR_EDGE} />
        </g>
      );
    case "cap":
      return front ? (
        <>
          <path d="M28 30 C28 10 72 10 72 30 C60 25 40 25 28 30 Z" {...GEAR_EDGE} />
          <path d="M32 29 C44 24 56 24 68 29 C62 34 38 34 32 29 Z" {...GEAR_EDGE} className="fill-berry-gear-shade stroke-berry-pupil" />
        </>
      ) : (
        <>
          <path d="M70 31 C80 30 89 32 95 37 C94 40 90 40 86 38 C80 36 75 35 70 35 Z" {...GEAR_EDGE} className="fill-berry-gear-shade stroke-berry-pupil" />
          <path d="M44 35 C46 17 70 13 80 33 C68 30 56 31 44 35 Z" {...GEAR_EDGE} />
        </>
      );
    case "glasses":
      return front ? (
        <g fill="none" strokeLinecap="round">
          {["M31 44 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M51 44 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M49 43 L51 43"].map((d) => (
            <React.Fragment key={d}>
              <path d={d} strokeWidth={4.4} className="stroke-berry-pupil" />
              <path d={d} strokeWidth={2.6} className="stroke-berry-gear" />
            </React.Fragment>
          ))}
        </g>
      ) : (
        <g fill="none" strokeLinecap="round">
          {["M50.5 45 a9.5 9.5 0 1 0 19 0 a9.5 9.5 0 1 0 -19 0 M50.5 44 L38 40"].map((d) => (
            <React.Fragment key={d}>
              <path d={d} strokeWidth={4.4} className="stroke-berry-pupil" />
              <path d={d} strokeWidth={2.6} className="stroke-berry-gear" />
            </React.Fragment>
          ))}
        </g>
      );
    case "headphones":
      return front ? (
        <>
          <path d="M22 50 C18 12 82 12 78 50" fill="none" strokeWidth={6} strokeLinecap="round" className="stroke-berry-pupil" />
          <path d="M22 50 C18 12 82 12 78 50" fill="none" strokeWidth={3.4} strokeLinecap="round" className="stroke-berry-gear" />
          <rect x={14} y={42} width={12} height={20} rx={5.5} {...GEAR_EDGE} />
          <rect x={74} y={42} width={12} height={20} rx={5.5} {...GEAR_EDGE} />
        </>
      ) : (
        <>
          <path d="M43 44 C38 22 62 12 74 30" fill="none" strokeWidth={6} strokeLinecap="round" className="stroke-berry-pupil" />
          <path d="M43 44 C38 22 62 12 74 30" fill="none" strokeWidth={3.4} strokeLinecap="round" className="stroke-berry-gear" />
          <ellipse cx={44} cy={48} rx={8} ry={10.5} {...GEAR_EDGE} />
          <ellipse cx={44} cy={48} rx={3.6} ry={5.6} className="fill-berry-gear-shade" />
        </>
      );
    case "bow":
      return (
        <g transform={front ? "translate(-12 -4)" : "translate(10 -2)"}>
          <path d="M62 22 L48 13 C45 18 45 26 48 31 Z" {...GEAR_EDGE} />
          <path d="M62 22 L76 13 C79 18 79 26 76 31 Z" {...GEAR_EDGE} />
          <circle cx={62} cy={22} r={4} {...GEAR_EDGE} className="fill-berry-gear-shade stroke-berry-pupil" />
        </g>
      );
  }
};

// The body's light, from the lit side at the upper left through the body to its far side at the lower right, and the
// grain that follows it. Defined once per drawing. Only masks, in white and black, so drawings that end up sharing an id,
// such as the site's, which are rendered one at a time, still each take their own colours.
const Shading: React.FC<{ id: string; grain: number | null }> = ({ id, grain }) => (
  <defs>
    <radialGradient id={`${id}-fall`} gradientUnits="userSpaceOnUse" cx={38} cy={40} r={50}>
      <stop offset="0.35" stopColor="#fff" />
      <stop offset="1" stopColor="#000" />
    </radialGradient>
    <radialGradient id={`${id}-glow`} gradientUnits="userSpaceOnUse" cx={36} cy={38} r={30}>
      <stop offset="0" stopColor="#fff" />
      <stop offset="1" stopColor="#000" />
    </radialGradient>
    <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x={-20} y={-20} width={160} height={160}>
      <rect x={-20} y={-20} width={160} height={160} fill={`url(#${id}-fall)`} />
    </mask>
    <mask id={`${id}-lit`} maskUnits="userSpaceOnUse" x={-20} y={-20} width={160} height={160}>
      <rect x={-20} y={-20} width={160} height={160} fill={`url(#${id}-glow)`} />
    </mask>
    {grain && (
      // Cells two screen pixels wide, scattered by a fixed hash, so the grain is the same on every bird and every run.
      <pattern id={`${id}-grain`} patternUnits="userSpaceOnUse" width={grain * GRAIN_TILE} height={grain * GRAIN_TILE}>
        {GRAIN_CELLS.map(([i, j, light]) => (
          <rect key={`${i}-${j}`} x={i * grain} y={j * grain} width={grain} height={grain} fill={light ? "#fff" : "#000"} fillOpacity={light ? 0.13 : 0.16} />
        ))}
      </pattern>
    )}
  </defs>
);

const GRAIN_TILE = 14;
const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const GRAIN_CELLS: Array<[number, number, boolean]> = Array.from({ length: GRAIN_TILE * GRAIN_TILE }, (_, k): [number, number, number] => [
  k % GRAIN_TILE,
  Math.floor(k / GRAIN_TILE),
  hash(k % GRAIN_TILE, Math.floor(k / GRAIN_TILE)),
])
  .filter(([, , h]) => h < 0.22 || h > 0.74)
  .map(([i, j, h]) => [i, j, h < 0.22]);

const ShadeContext = createContext<{ id: string; grain: boolean }>({ id: "", grain: false });

// The round body with its light, and the grain over it where there is any.
const Body: React.FC<{ cx?: number; cy?: number; rx?: number; ry?: number }> = ({ cx = BODY.cx, cy = BODY.cy, rx = BODY.rx, ry = BODY.ry }) => {
  const { id, grain } = useContext(ShadeContext);
  const shape = { cx, cy, rx, ry };
  return (
    <>
      <ellipse {...shape} className="fill-berry-shade" />
      <ellipse {...shape} className="fill-berry-ink" mask={`url(#${id}-body)`} />
      <ellipse {...shape} className="fill-berry-nape" mask={`url(#${id}-lit)`} />
      {grain && <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-grain)`} />}
    </>
  );
};

const Wing: React.FC<{ dx?: number; dy?: number; turn?: number }> = ({ dx = 0, dy = 0, turn = WING.turn }) => {
  const { id, grain } = useContext(ShadeContext);
  const shape = { cx: WING.cx + dx, cy: WING.cy + dy, rx: WING.rx, ry: WING.ry, transform: `rotate(${turn} ${WING.cx + dx} ${WING.cy + dy})` };
  return (
    <>
      <ellipse {...shape} className="fill-berry-wing" />
      {grain && <ellipse {...shape} fill={`url(#${id}-grain)`} />}
    </>
  );
};

const Tail: React.FC = () => <path d={TAIL} className="fill-berry-crest" />;
const Legs: React.FC = () => <path d={LEGS} {...LEG_STROKE} />;

// The head's parts. They share the body's round shape, so they turn together around the neck. `data-part` is how the
// bird drawn on web pages finds the head it pecks and nods with.
const Head: React.FC<{ turn?: number; eyes?: Eyes; crest?: string; blink?: boolean; twitch?: boolean; note?: boolean }> = ({
  turn = 0,
  eyes = "open",
  crest = CREST,
  blink = false,
  twitch = false,
  note = false,
}) => (
  <g data-part="head" transform={`rotate(${turn} ${NECK})`}>
    <path d={crest} className={cn("fill-berry-crest", twitch && "motion-safe:animate-berry-twitch")} style={twitch ? ownBox("50% 100%") : undefined} />
    <path d={BEAK_UPPER} className="fill-berry-beak" />
    <path d={BEAK_LOWER} className="fill-berry-beak-lower" />
    {note && <Note />}
    <g className={cn(blink && "motion-safe:animate-berry-blink")} style={blink ? ownBox("center") : undefined}>
      <Eye look={eyes} />
    </g>
    <Gear />
  </g>
);

// The folded note a bird brings home in its beak: the only thing a bird carries.
const Note: React.FC = () => (
  <g transform="translate(90 57) rotate(12)">
    <rect x={-3} y={-8} width={20} height={14} rx={1} strokeWidth={1.4} className="fill-berry-note stroke-berry-note-edge" />
    <path d="M-3 -8 L7 -1 L17 -8" fill="none" strokeWidth={1.4} strokeLinejoin="round" className="stroke-berry-note-edge" />
  </g>
);

// Perched: tail, legs, the round body, the wing low on its side, and the head.
const Standing: React.FC<{ head: React.ReactNode; lean?: number; legs?: React.ReactNode }> = ({ head, lean = 0, legs = <Legs /> }) => (
  <g transform={lean ? `rotate(${lean} 51 94)` : undefined}>
    <Tail />
    {legs}
    <Body />
    <Wing />
    {head}
  </g>
);

// One drawing per mood, so each is recognisable from its outline alone.
const Pose: React.FC<{ mood: Mood; animate: boolean; noBlink?: boolean }> = ({ mood, animate, noBlink = false }) => {
  switch (mood) {
    case "rest":
      return <Standing head={<Head blink={animate && !noBlink} />} />;

    case "sitting":
      // Settled on an edge with its legs hanging over it and swinging. The seat, the body's bottom, is 86 down.
      return (
        <g transform="translate(0 -12.6)">
          <Tail />
          <g {...LEG_STROKE}>
            <path d="M42 78 L40 96 L46 98" className={cn("stroke-berry-legs", animate && "motion-safe:animate-berry-swing")} style={ownBox("50% 0%")} />
            <path d="M55 78 L55 96 L61 98" className={cn("stroke-berry-legs", animate && "motion-safe:animate-berry-swing-back")} style={ownBox("50% 0%")} />
          </g>
          <Body />
          <Wing />
          <Head blink={animate} />
        </g>
      );

    case "curious":
      // Leans in, head cocked, eye on it.
      return <Standing lean={8} head={<Head turn={-14} eyes="wide" />} />;

    case "thinking":
      // Head back, eye up, crest twitching.
      return <Standing lean={-4} head={<Head turn={-16} eyes="up" twitch={animate} />} />;

    case "fetching":
      // In flight: stretched forward, feet tucked, wings beating.
      return (
        <g className={cn(animate && "motion-safe:animate-berry-bob")}>
          <g transform="rotate(14 50 56) translate(0 -6)">
            <Tail />
            <path d="M44 80 L50 86 M54 80 L60 85" {...LEG_STROKE} />
            <g className={cn(animate && "motion-safe:animate-berry-flap")} style={ownBox("85% 95%")}>
              <path d="M52 46 C44 30 30 18 12 14 C18 22 20 30 30 40 C22 38 16 40 10 44 C22 50 34 52 48 54 Z" className="fill-berry-wing" />
            </g>
            <Body />
            <Head />
          </g>
        </g>
      );

    case "asking":
      // Square on, two eyes, head a little to one side.
      return (
        <g transform="rotate(-5 50 54)">
          <path d="M42 80 L42 94 L37 95 M42 94 L46 96 M58 80 L58 94 L54 96 M58 94 L63 95" {...LEG_STROKE} />
          <ellipse cx={22} cy={64} rx={7} ry={12} transform="rotate(14 22 64)" className="fill-berry-wing" />
          <ellipse cx={78} cy={64} rx={7} ry={12} transform="rotate(-14 78 64)" className="fill-berry-wing" />
          <Body cx={50} cy={54} rx={30} ry={29} />
          <g data-part="head">
            <path d="M38 30 L36 13 L44 23 L50 9 L56 23 L64 13 L62 30 Z" className="fill-berry-crest" />
            <Eye x={40} y={45} r={6.6} look="wide" facing />
            <Eye x={60} y={45} r={6.6} look="wide" facing />
            <path d="M44 52 L56 52 L50 59 Z" className="fill-berry-beak" />
            <path d="M46 56 L54 56 L50 62 Z" className="fill-berry-beak-lower" />
            <Gear front />
          </g>
        </g>
      );

    case "delivered":
      // Chest out, the folded note in its beak, heavy-lidded and a bit smug.
      return <Standing lean={-6} head={<Head turn={-8} eyes="smug" note />} />;

    case "oops":
      // Slumped, crest drooping, a feather falls.
      return (
        <>
          <g transform="translate(0 4)">
            <Standing
              lean={6}
              legs={<path d="M40 76 L38 90 L45 90 M54 76 L54 90 L61 90" {...LEG_STROKE} />}
              head={<Head turn={20} eyes="down" crest={CREST_DROOP} />}
            />
          </g>
          <path d={FEATHER} className={cn("fill-berry-wing", animate && "motion-safe:animate-berry-feather")} style={ownBox("center")} />
        </>
      );

    case "off-duty":
      // Fluffed up asleep, crest flat.
      return (
        <>
          <Tail />
          <Body cx={47} cy={64} rx={35} ry={30} />
          <Wing dy={8} turn={12} />
          <g transform="translate(-2 14)">
            <Head turn={14} eyes="closed" crest={CREST_FLAT} />
          </g>
        </>
      );
  }
};

// The two reactions that are poses, and only from at rest, so a mood that means something is never covered up.
const POSE_FOR: Partial<Record<Reaction, Mood>> = { look: "curious", toss: "thinking" };

// Body, crest, beak and one larger eye, in flat colour: at icon sizes that's what tells birds apart. From 24px the wing
// is added and head tilt and the eye carry the mood. Under that it only shows who it is.
const SimplifiedPose: React.FC<{ mood: Mood; wing: boolean }> = ({ mood, wing }) => {
  const eyes: Eyes =
    mood === "off-duty" ? "closed" : mood === "oops" ? "down" : mood === "thinking" ? "up" : mood === "delivered" ? "smug" : mood === "asking" || mood === "curious" ? "wide" : "open";
  const tilt = mood === "curious" ? -10 : mood === "thinking" ? -12 : mood === "oops" ? 12 : mood === "off-duty" ? 8 : 0;
  return (
    <g transform={`rotate(${tilt} 50 60)`}>
      <Tail />
      <ellipse cx={BODY.cx} cy={BODY.cy + 4} rx={BODY.rx + 3} ry={BODY.ry + 3} className="fill-berry-ink" />
      {wing && <ellipse cx={WING.cx} cy={WING.cy + 4} rx={WING.rx} ry={WING.ry} transform={`rotate(${WING.turn} ${WING.cx} ${WING.cy + 4})`} className="fill-berry-wing" />}
      <path d={mood === "off-duty" ? CREST_FLAT : CREST} transform="translate(0 2)" className="fill-berry-crest" />
      <path d="M76 46 L96 55 L76 63 Z" className="fill-berry-beak" />
      <Eye x={60} y={46} r={9.5} look={eyes} />
      <Gear />
    </g>
  );
};

export const Mascot: React.FC<MascotProps> = ({
  mood = "rest",
  size,
  look,
  name = "Berry",
  hidden = false,
  still = false,
  lively = false,
  noBlink = false,
  grain = false,
  className,
  onContextMenu,
}) => {
  const label = `${name}, ${MOOD_LABELS[mood]}`;
  const drawing = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, "");
  const { reaction, react } = useMascotReaction(drawing, mood, lively && !still);
  // Under 24px a bird shows identity only, so it's always at rest there.
  const shown = size < MOOD_FROM ? "rest" : mood;
  const drawn = (shown === "rest" && reaction && POSE_FOR[reaction]) || shown;
  const full = size >= FULL_FROM;
  // Two screen pixels in the drawing's own units, which are 1.15 of the 120-unit box.
  const grainCell = grain && full ? (2 * 120) / (size * 1.15) : null;

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
      ref={drawing}
      role="img"
      aria-label={label}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      onClick={lively ? react : undefined}
      onContextMenu={onContextMenu}
      data-reaction={reaction ?? undefined}
      data-mascot={look?.palette ?? "jackdaw"}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <GearContext.Provider value={look?.accessory ?? "none"}>
        <ShadeContext.Provider value={{ id, grain: grainCell !== null }}>
          <Shading id={id} grain={grainCell} />
          {/* Remounts on every mood, so poses change with a quick fade rather than a jump. */}
          <g transform={FRAME}>
            <g key={drawn} className={cn(!still && "animate-berry-pose")}>
              {full ? <Pose mood={drawn} animate={!still} noBlink={noBlink} /> : <SimplifiedPose mood={drawn} wing={size >= MOOD_FROM} />}
            </g>
            {reaction === "ruffle" && full && (
              <path d={FEATHER} className="fill-berry-wing motion-safe:animate-berry-feather" style={ownBox("center")} />
            )}
          </g>
        </ShadeContext.Provider>
      </GearContext.Provider>
    </svg>
  );
};
