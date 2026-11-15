import React, { useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { MascotAccessory, MascotLook, MascotPalette } from "@shared/library";
import { cn } from "../lib/utils";
import { useFrame, useStill } from "./motion";
import { pipFrames } from "./Pips";
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

// DESIGN.md section 9: the six berries. Each is drawn on a 48-unit square, body bottom at 46.
export type BerryKind = "blueberry" | "lingon" | "cloudberry" | "gooseberry" | "raspberry" | "currant";

// A look is saved by its old palette id, in files, published rows and the phone's flock, so the ids stay and each
// draws as the berry nearest the colour its owner chose. Berry is the blueberry.
export const BERRY_KIND: Record<MascotPalette, BerryKind> = {
  kingfisher: "blueberry",
  robin: "lingon",
  canary: "cloudberry",
  parakeet: "gooseberry",
  flamingo: "raspberry",
  jackdaw: "currant",
};

const BERRY_LOOK: MascotLook = { palette: "kingfisher", accessory: "none" };

// Colours are the mascots' own tokens, as attributes, so a drawing copied out of the app keeps them without styles.
const c = (token: string) => `var(--berry-${token})`;
const EYE = c("eye");
const ASK = "rgb(var(--ask))";

// Round bumps on an oval, for the bumpy berries.
const bumps = (count: number, rx: number, ry: number, r: number, fill: string) => (
  <>
    {Array.from({ length: count }, (_, step) => {
      const angle = (step / count) * Math.PI * 2 - Math.PI / 2;
      return <circle key={step} cx={(24 + rx * Math.cos(angle)).toFixed(1)} cy={(29 + ry * Math.sin(angle)).toFixed(1)} r={r} fill={fill} />;
    })}
    <ellipse cx={24} cy={29} rx={rx + 3} ry={ry + 3} fill={fill} />
  </>
);
const leafStar = (fill: string) => <path d="M24 14l-7-5.5 5.6.6L24 3.5l1.4 5.6 5.6-.6z" fill={fill} />;
const tuft = (stroke: string) => (
  <path d="M24 13.5V8.5M20.8 9.2l3.2 2.6 3.2-2.6" stroke={stroke} strokeWidth={2.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);

// Each body in its colour, then whatever grows on top of it.
const BODIES: Record<BerryKind, (fill: string) => React.ReactNode> = {
  blueberry: (fill) => (
    <>
      <rect x={5} y={12} width={38} height={34} rx={16.5} fill={fill} />
      <path d="M17 15.5l1.7-7.2 2.9 3.6L24 6.5l2.4 5.4 2.9-3.6 1.7 7.2z" fill={c("blueberry-crown")} />
    </>
  ),
  lingon: (fill) => (
    <>
      <rect x={5} y={12} width={38} height={34} rx={17} fill={fill} />
      <path d="M24 13q0-5 3.2-7.5" stroke={c("stem")} strokeWidth={2.1} fill="none" strokeLinecap="round" />
      <path d="M26.8 5.8q7-3.6 10.6 1.6-6.4 4.4-10.6-1.6z" fill={c("leaf")} />
    </>
  ),
  cloudberry: (fill) => (
    <>
      {bumps(7, 10.5, 8.6, 8.6, fill)}
      {leafStar(c("cloudberry-leaf"))}
    </>
  ),
  gooseberry: (fill) => (
    <>
      <ellipse cx={24} cy={29.5} rx={16.5} ry={16.5} fill={fill} />
      <path d="M14.5 17.5q-5.5 12 0 24M33.5 17.5q5.5 12 0 24" stroke={c("gooseberry-stripe")} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      {tuft(c("gooseberry-tuft"))}
    </>
  ),
  raspberry: (fill) => (
    <>
      {bumps(10, 12, 9.8, 6.6, fill)}
      {leafStar(c("leaf"))}
    </>
  ),
  currant: (fill) => (
    <>
      <rect x={6} y={13} width={36} height={33} rx={16.5} fill={fill} />
      {tuft(c("currant-tuft"))}
    </>
  ),
};

// Sits on the body and covers what grows there. They read down to 14px.
const ACCESSORY: Record<MascotAccessory, React.ReactNode> = {
  none: null,
  crown: <path d="M14.5 14V6l4.8 3.8L24 4l4.7 5.8L33.5 6v8z" fill={c("gold")} />,
  cap: (
    <>
      <path d="M8.5 16a15.5 13 0 0 1 31 0z" fill={c("cap")} />
      <rect x={29} y={12.6} width={17} height={3.8} rx={1.9} fill={c("cap")} />
    </>
  ),
  glasses: (
    <>
      <circle cx={18} cy={28} r={5.6} fill="none" stroke={EYE} strokeWidth={1.8} />
      <circle cx={30} cy={28} r={5.6} fill="none" stroke={EYE} strokeWidth={1.8} />
      <path d="M23.4 27.5h1.2" stroke={EYE} strokeWidth={1.8} />
    </>
  ),
  headphones: (
    <>
      <path d="M4 30C4 4 44 4 44 30" fill="none" stroke={c("headphones")} strokeWidth={3} />
      <rect x={1} y={24} width={6.5} height={12} rx={3.2} fill={c("headphones")} />
      <rect x={40.5} y={24} width={6.5} height={12} rx={3.2} fill={c("headphones")} />
    </>
  ),
  bow: (
    <>
      <path d="M31 12l-7-4.5v9zM31 12l7-4.5v9z" fill={c("blueberry")} />
      <circle cx={31} cy={12} r={2} fill={c("blueberry-crown")} />
    </>
  ),
};

// Two upright bars, 12 apart. Shut, they close to a line, as when one mascot gives way to another.
const Bar: React.FC<{ x: number; dx?: number; dy?: number; shut: boolean }> = ({ x, dx = 0, dy = 0, shut }) => (
  <rect
    data-eye
    x={x - 1.9 + dx}
    y={23.5 + dy}
    width={3.8}
    height={9}
    rx={1.9}
    fill={EYE}
    className="[transform-box:fill-box] [transform-origin:center] transition-transform duration-fast"
    style={shut ? { transform: "scaleY(0.12)" } : undefined}
  />
);
const Lines: React.FC<{ d: string }> = ({ d }) => <path d={d} stroke={EYE} strokeWidth={2.7} fill="none" strokeLinecap="round" />;

// While it works, the two eyes become the pips, one dot chasing round. Held still, every dot shows at the same strength.
const WORKING_OFF = 0.22;
const WORKING_STILL = 0.7;
const WorkingFace: React.FC<{ still: boolean }> = ({ still }) => {
  const { frames, ms } = pipFrames("think");
  const frame = useFrame(frames.length, ms, !still);
  return (
    <>
      {[22, 29, 36].flatMap((cy, row) =>
        [17, 24, 31].map((cx, column) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={2.1}
            fill={EYE}
            opacity={still ? WORKING_STILL : WORKING_OFF + (1 - WORKING_OFF) * frames[frame][row * 3 + column]}
          />
        )),
      )}
    </>
  );
};

const Face: React.FC<{ mood: Mood; still: boolean; shut: boolean }> = ({ mood, still, shut }) => {
  switch (mood) {
    case "curious":
      return (
        <>
          <Bar x={18} dx={1.8} dy={-1.6} shut={shut} />
          <Bar x={30} dx={1.8} dy={-1.6} shut={shut} />
        </>
      );
    case "thinking":
    case "fetching":
      return <WorkingFace still={still} />;
    case "asking":
      return (
        <>
          <circle cx={18} cy={28} r={3.5} fill={EYE} />
          <circle cx={30} cy={28} r={3.5} fill={EYE} />
        </>
      );
    case "delivered":
      return <Lines d="M14.5 30q3.5-5.5 7 0M26.5 30q3.5-5.5 7 0" />;
    case "oops":
      return <Lines d="M15 30l5-3.6M33 30l-5-3.6" />;
    case "off-duty":
      return <Lines d="M15 29h6M27 29h6" />;
    case "rest":
    case "sitting":
      return (
        <>
          <Bar x={18} shut={shut} />
          <Bar x={30} shut={shut} />
        </>
      );
  }
};

// The two reactions that are moods, and only from at rest, so a mood that means something is never covered up.
const POSE_FOR: Partial<Record<Reaction, Mood>> = { look: "curious", toss: "delivered" };

interface MascotProps {
  mood?: Mood;
  size: number;
  // Which berry and what it wears. Left out, this is Berry.
  look?: MascotLook;
  // What it's called to assistive technology.
  name?: string;
  // Hide Berry: a plain icon stands in, and every feature keeps working.
  hidden?: boolean;
  // Keep Berry still: the face stays, the motion stops. Left out, the setting and reduced motion decide.
  still?: boolean;
  // Reacts when clicked. Decoration only: any control it's inside still takes the click as well.
  lively?: boolean;
  // On the address field while a mascot works, which is `ink`: the body takes the ground's colour, so it shows there.
  inverted?: boolean;
  // Eyes shut, as the old one does when another takes its place.
  shut?: boolean;
  // Every berry's body, for a drawing made once and shown as any mascot by the `data-mascot` it's given where it's
  // shown (scripts/buildSite.mjs). The app never needs this.
  anyLook?: boolean;
  className?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export const Mascot: React.FC<MascotProps> = ({
  mood = "rest",
  size,
  look = BERRY_LOOK,
  name = "Berry",
  hidden = false,
  still,
  lively = false,
  inverted = false,
  shut = false,
  anyLook = false,
  className,
  onContextMenu,
}) => {
  const held = useStill(still);
  const label = `${name}, ${MOOD_LABELS[mood]}`;
  const drawing = useRef<SVGSVGElement>(null);
  const { reaction, react } = useMascotReaction(drawing, mood, lively && !held);
  const drawn = (mood === "rest" && reaction && POSE_FOR[reaction]) || mood;

  if (hidden) {
    return (
      <MessageCircle
        role="img"
        aria-label="Assistant"
        onContextMenu={onContextMenu}
        className={cn("text-ink-3", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const kind = BERRY_KIND[look.palette];
  return (
    <svg
      ref={drawing}
      role="img"
      aria-label={label}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      onClick={lively ? react : undefined}
      onContextMenu={onContextMenu}
      data-reaction={reaction ?? undefined}
      data-mascot={look.palette}
      data-inverted={inverted || undefined}
      opacity={drawn === "off-duty" ? 0.5 : undefined}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <g transform={drawn === "curious" ? "rotate(-10 24 29)" : undefined}>
        {anyLook
          ? Object.entries(BODIES).map(([each, draw]) => (
              <g key={each} data-berry={each}>
                {draw(c(each))}
              </g>
            ))
          : BODIES[kind](c(inverted ? "inverted-body" : kind))}
        <Face mood={drawn} still={held} shut={shut} />
        {ACCESSORY[look.accessory]}
      </g>
      {drawn === "asking" && <circle cx={41.5} cy={12} r={5} fill={ASK} />}
    </svg>
  );
};
