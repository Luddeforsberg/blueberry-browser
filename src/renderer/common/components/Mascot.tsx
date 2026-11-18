import React, { useId, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { MascotAccessory, MascotLook, MascotPalette } from "@shared/library";
import { PALETTES } from "@shared/mascots";
import { cn } from "../lib/utils";
import { mascotDetail, type MascotDetail } from "./mascotDetail";
import { useFrame, useStill } from "./motion";
import { pipFrames } from "./pipPatterns";
import { useMascotReaction, type Reaction } from "./useMascotReaction";
import { MOOD_LABELS, type Mood } from "./moods";

const BERRY_LOOK: MascotLook = { palette: "blueberry", accessory: "none" };

// Colours are the mascots' own tokens, as attributes, so a drawing copied out of the app keeps them without styles.
const c = (token: string) => `var(--berry-${token})`;
const EYE = c("eye");
const ASK = "rgb(var(--ask))";
const WHITE = "#fff";
const one = (value: number) => value.toFixed(1);

// The ids of a drawing's gradients, mask and clips. Many drawings share a document, so each has its own.
interface Ids {
  shade: string;
  fade: string;
  fadeGradient: string;
  clip: (kind: MascotPalette) => string;
}
const url = (id: string) => `url(#${id})`;

// The beaded berries, as rows of beads: each row's height, where its beads are along it, and their radius.
type Bead = [x: number, y: number, r: number];
const beads = (rows: [y: number, xs: number[], r: number][]): Bead[] => rows.flatMap(([y, xs, r]) => xs.map((x): Bead => [x, y, r]));
const CLOUD_BEADS = beads([
  [17.6, [19.6, 28.4], 5.6],
  [23.4, [14.2, 24, 33.8], 6.5],
  [31.4, [11.4, 20, 28, 36.6], 6.3],
  [39.6, [15.6, 24, 32.4], 6.2],
]);
const RASP_BEADS = beads([
  [17.6, [11.6, 17.8, 24, 30.2, 36.4], 4.4],
  [24.4, [11.2, 17.6, 24, 30.4, 36.8], 4.4],
  [31.2, [14.4, 20.8, 27.2, 33.6], 4.3],
  [37.6, [17.6, 24, 30.4], 4.1],
  [42.6, [21, 27], 3.5],
]);
const beadCircles = (list: Bead[]) => list.map(([x, y, r]) => <circle key={`${x} ${y}`} cx={x} cy={y} r={r} />);

// Each berry's outline, with no fill of its own: its body, and the clip that keeps its shade inside it. Shapes only,
// since a clip path takes no groups.
const SHAPE: Record<MascotPalette, React.ReactNode> = {
  blueberry: <ellipse cx={24} cy={30} rx={19} ry={16} />,
  lingon: <circle cx={24} cy={29.6} r={16.4} />,
  cloudberry: (
    <>
      {beadCircles(CLOUD_BEADS)}
      <ellipse cx={24} cy={30} rx={14} ry={12.5} />
    </>
  ),
  gooseberry: <ellipse cx={24} cy={29} rx={15.6} ry={17} />,
  raspberry: (
    <>
      {beadCircles(RASP_BEADS)}
      <path d="M12 18H36L35 31 28 41H20L13 31z" />
    </>
  ),
  currant: <circle cx={24} cy={30} r={16} />,
};

// Beads under the face stay plain, so the eyes and mouth read.
const inFace = (x: number, y: number) => x > 12 && x < 36 && y > 20 && y < 39;

const GOOSE_VEINS = [-0.8, -0.42, 0, 0.42, 0.8];

// What a berry's skin looks like up close, from 48px.
const TEXTURE: Record<MascotPalette, React.ReactNode> = {
  blueberry: <ellipse cx={21} cy={21.5} rx={13} ry={6.5} fill={WHITE} opacity={0.12} />,
  lingon: null,
  cloudberry: CLOUD_BEADS.map(([x, y, r]) => {
    const cx = one(x - r * 0.3);
    const cy = one(y - r * 0.38);
    return (
      <ellipse
        key={`${x} ${y}`}
        cx={cx}
        cy={cy}
        rx={one(r * 0.32)}
        ry={one(r * 0.2)}
        transform={`rotate(-30 ${cx} ${cy})`}
        fill={WHITE}
        opacity={0.38}
      />
    );
  }),
  gooseberry: (
    <>
      <ellipse cx={24} cy={29} rx={11} ry={13.4} fill={WHITE} opacity={0.16} />
      {GOOSE_VEINS.map((k) => (
        <path
          key={k}
          d={`M24 12.4Q${one(24 + k * 19)} 29 24 45.6`}
          stroke={c("gooseberry-stripe")}
          strokeWidth={0.9}
          fill="none"
          opacity={0.7}
        />
      ))}
    </>
  ),
  // A rim under each bead and a glint on it.
  raspberry: RASP_BEADS.filter(([x, y]) => !inFace(x, y)).map(([x, y, r]) => (
    <React.Fragment key={`${x} ${y}`}>
      <path
        d={`M${one(x - r * 0.8)} ${one(y + r * 0.55)}A${one(r - 0.4)} ${one(r - 0.4)} 0 0 0 ${one(x + r * 0.8)} ${one(y + r * 0.55)}`}
        fill="none"
        stroke={c("raspberry-rim")}
        strokeWidth={0.7}
        opacity={0.55}
        strokeLinecap="round"
      />
      <circle cx={one(x - r * 0.38)} cy={one(y - r * 0.4)} r={0.95} fill={WHITE} opacity={0.55} />
    </React.Fragment>
  )),
  currant: <ellipse cx={19} cy={23} rx={11} ry={7.5} fill={c("currant-bloom")} opacity={0.35} />,
};

// Under 48px only the gooseberry keeps two of its veins, as they're part of its outline.
const SMALL_TEXTURE: Partial<Record<MascotPalette, React.ReactNode>> = {
  gooseberry: <path d="M24 12.4Q12.5 29 24 45.6M24 12.4Q35.5 29 24 45.6" stroke={c("gooseberry-stripe")} strokeWidth={1.5} fill="none" />,
};

// A soft shine at the top left. The lingon's is brighter, so it looks glossy.
const SHINE: Record<"lingon" | "other", React.ReactNode> = {
  lingon: (
    <>
      <ellipse cx={15.6} cy={21.4} rx={4.2} ry={2.5} transform="rotate(-38 15.6 21.4)" fill={WHITE} opacity={0.8} />
      <circle cx={20.2} cy={18} r={1.1} fill={WHITE} opacity={0.7} />
    </>
  ),
  other: <ellipse cx={14.6} cy={22.6} rx={3.4} ry={2} transform="rotate(-38 14.6 22.6)" fill={WHITE} opacity={0.5} />,
};

// What grows on top, which with the outline says which berry it is, down to 14px.
const TOP: Record<MascotPalette, React.ReactNode> = {
  blueberry: (
    <>
      <path
        d="M18.2 16.6L18.8 10.8L21.5 13.6L24 9L26.5 13.6L29.2 10.8L29.8 16.6Z"
        fill={c("blueberry-crown")}
        stroke={c("blueberry-crown")}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <ellipse cx={24} cy={15.6} rx={4.2} ry={1.5} fill={c("blueberry-crown-hollow")} />
    </>
  ),
  lingon: (
    <>
      <path d="M24 13.6q-.4-4 2.2-6.6" stroke={c("stem")} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      <ellipse cx={30.2} cy={7.2} rx={4.6} ry={2.3} transform="rotate(-18 30.2 7.2)" fill={c("lingon-leaf")} />
      <ellipse cx={22.6} cy={10} rx={2.5} ry={1.3} transform="rotate(38 22.6 10)" fill={c("lingon-leaf-small")} />
    </>
  ),
  cloudberry: (
    <>
      <ellipse cx={18.6} cy={11.6} rx={4.6} ry={2.1} transform="rotate(-28 18.6 11.6)" fill={c("cloudberry-leaf")} />
      <ellipse cx={29.4} cy={11.6} rx={4.6} ry={2.1} transform="rotate(28 29.4 11.6)" fill={c("cloudberry-leaf")} />
      <ellipse cx={24} cy={9.4} rx={2.1} ry={4.2} fill={c("cloudberry-leaf")} />
    </>
  ),
  gooseberry: <path d="M24 12.8q-.3-3.6 1.8-6.2" stroke={c("gooseberry-tuft")} strokeWidth={1.8} fill="none" strokeLinecap="round" />,
  raspberry: (
    <>
      <path
        d="M24 14.2L15.6 11.6L21 10.8L19.6 6.6L24 9.6L28.4 6.6L27 10.8L32.4 11.6Z"
        fill={c("leaf")}
        stroke={c("leaf")}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path d="M24 10V6.2" stroke={c("leaf")} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  currant: (
    <>
      <path d="M24 14.6q.6-4.2 5.4-6.4" stroke={c("currant-stem")} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <circle cx={31} cy={7.4} r={2.8} fill={c("currant")} />
      <circle cx={30.2} cy={6.6} r={0.75} fill={WHITE} opacity={0.6} />
      <path d="M24 16v-2.6M22.6 14.6l1.4.9 1.4-.9" stroke={c("currant-tuft")} strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </>
  ),
};

// Worn behind what grows on top, so the berry still reads: the cap's crown carries it like a button, and the
// headphones' band goes behind it.
const ACCESSORY_BEHIND: Partial<Record<MascotAccessory, React.ReactNode>> = {
  cap: (
    <>
      <path d="M7.6 18.2a16.4 12.4 0 0 1 32.8 0z" fill={c("cap")} />
      <rect x={30} y={15} width={16} height={3.8} rx={1.9} fill={c("cap")} />
    </>
  ),
  headphones: (
    <>
      <path d="M4.4 30C4.4 6 43.6 6 43.6 30" fill="none" stroke={c("headphones")} strokeWidth={2.8} />
      <rect x={1.2} y={25} width={6.6} height={11.4} rx={3.2} fill={c("headphones")} />
      <rect x={40.2} y={25} width={6.6} height={11.4} rx={3.2} fill={c("headphones")} />
    </>
  ),
};

// The lingon's and the currant's stems lean right, so what they wear beside the top goes on the left.
const leansRight = (kind: MascotPalette) => kind === "lingon" || kind === "currant";

// Worn in front: the crown and the bow small and at an angle beside the top, and the glasses on the eyes, in ink, or
// light on the currant (tokens.css).
const accessoryInFront = (accessory: MascotAccessory, kind: MascotPalette, working: boolean): React.ReactNode => {
  switch (accessory) {
    case "crown": {
      const x = leansRight(kind) ? 12.6 : 34;
      return (
        <g transform={`rotate(${x < 24 ? -16 : 16} ${x} 11)`}>
          <path
            d={`M${one(x - 5.2)} 14.4V7.6l2.9 2.4L${x} 5.6l2.3 4.4 2.9-2.4v6.8z`}
            fill={c("gold")}
            stroke={c("gold")}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
        </g>
      );
    }
    case "bow": {
      const x = leansRight(kind) ? 13.6 : 34.6;
      return (
        <>
          <path
            d={`M${x} 15l-5.6-3.8v7.6zM${x} 15l5.6-3.8v7.6z`}
            fill={c("bow")}
            stroke={c("bow")}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <circle cx={x} cy={15} r={1.7} fill={c("bow-knot")} />
        </>
      );
    }
    // They'd sit on the pips, so they come off while it works.
    case "glasses":
      return working ? null : (
        <>
          <circle cx={18} cy={28} r={5.8} fill="none" stroke={c("glasses")} strokeWidth={1.7} />
          <circle cx={30} cy={28} r={5.8} fill="none" stroke={c("glasses")} strokeWidth={1.7} />
          <path d="M23.5 27.4q.5-.6 1 0" stroke={c("glasses")} strokeWidth={1.7} fill="none" />
        </>
      );
    default:
      return null;
  }
};

// Two upright bars, 12 apart, a little heavier under 28px. Shut, they close to a line, as when one mascot gives way to
// another.
const Bar: React.FC<{
  x: number;
  dx?: number;
  dy?: number;
  shut: boolean;
  small: boolean;
}> = ({ x, dx = 0, dy = 0, shut, small }) => {
  const [width, height] = small ? [4.8, 9.6] : [4, 8.4];
  return (
    <rect
      data-eye
      x={x - width / 2 + dx}
      y={28 - height / 2 + dy}
      width={width}
      height={height}
      rx={width / 2}
      fill={EYE}
      className="[transform-box:fill-box] [transform-origin:center] transition-transform duration-fast"
      style={shut ? { transform: "scaleY(0.12)" } : undefined}
    />
  );
};
const Line: React.FC<{ d: string; width?: number }> = ({ d, width = 2.6 }) => (
  <path d={d} stroke={EYE} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);

// While it works, the two eyes become the pips, one dot chasing round, bigger under 28px. Held still, every dot shows at
// the same strength.
const WORKING_STILL = 0.7;
const WorkingFace: React.FC<{ still: boolean; small: boolean }> = ({ still, small }) => {
  const { frames, ms } = pipFrames("think");
  const frame = useFrame(frames.length, ms, !still);
  const off = small ? 0.4 : 0.22;
  return (
    <>
      {[22, 29, 36].flatMap((cy, row) =>
        [17, 24, 31].map((cx, column) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={small ? 2.6 : 2.1}
            fill={EYE}
            opacity={still ? WORKING_STILL : off + (1 - off) * frames[frame][row * 3 + column]}
          />
        )),
      )}
    </>
  );
};

const Eyes: React.FC<{
  mood: Mood;
  still: boolean;
  shut: boolean;
  small: boolean;
}> = ({ mood, still, shut, small }) => {
  switch (mood) {
    case "curious":
      return (
        <>
          <Bar x={18} dx={1.8} dy={-1.6} shut={shut} small={small} />
          <Bar x={30} dx={1.8} dy={-1.6} shut={shut} small={small} />
        </>
      );
    case "thinking":
    case "fetching":
      return <WorkingFace still={still} small={small} />;
    case "asking":
      return (
        <>
          <circle cx={18} cy={28} r={small ? 4.2 : 3.6} fill={EYE} />
          <circle cx={30} cy={28} r={small ? 4.2 : 3.6} fill={EYE} />
        </>
      );
    case "delivered":
      return <Line d="M14.6 30q3.4-5.4 6.8 0M26.6 30q3.4-5.4 6.8 0" />;
    case "oops":
      return <Line d="M15 30l5-3.6M33 30l-5-3.6" />;
    case "off-duty":
      return <Line d="M15 29h6M27 29h6" />;
    case "rest":
    case "sitting":
      return (
        <>
          <Bar x={18} shut={shut} small={small} />
          <Bar x={30} shut={shut} small={small} />
        </>
      );
  }
};

// From 28px a small mouth carries half the mood. Working has none.
const Mouth: React.FC<{ mood: Mood }> = ({ mood }) => {
  switch (mood) {
    case "rest":
    case "sitting":
      return <Line d="M21.8 35q2.2 2.2 4.4 0" width={1.7} />;
    case "curious":
      return <circle cx={25.8} cy={35} r={1.35} fill={EYE} />;
    case "asking":
      return <Line d="M22.6 36h2.8" width={1.7} />;
    case "delivered":
      return <path d="M20.6 34.2q3.4 4.8 6.8 0z" fill={EYE} stroke={EYE} strokeWidth={1} strokeLinejoin="round" />;
    case "oops":
      return <Line d="M20.8 37q1.6-1.6 3.2 0t3.2 0" width={1.6} />;
    case "off-duty":
      return <Line d="M22.8 36h2.4" width={1.6} />;
    case "thinking":
    case "fetching":
      return null;
  }
};

// The shade, the face fade and each berry's clip, by the ids this drawing was given.
const Defs: React.FC<{ ids: Ids; kinds: MascotPalette[] }> = ({ ids, kinds }) => (
  <defs>
    <radialGradient id={ids.shade}>
      <stop offset={0} stopColor="#000" stopOpacity={0.2} />
      <stop offset={0.55} stopColor="#000" stopOpacity={0.1} />
      <stop offset={1} stopColor="#000" stopOpacity={0} />
    </radialGradient>
    {/* A mask goes by brightness, so the texture fades to about a third over the face. */}
    <radialGradient id={ids.fadeGradient}>
      <stop offset={0} stopColor="#4d4d4d" />
      <stop offset={0.55} stopColor="#4d4d4d" />
      <stop offset={1} stopColor={WHITE} />
    </radialGradient>
    <mask id={ids.fade} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={-10} y={-10} width={68} height={68}>
      <rect x={-10} y={-10} width={68} height={68} fill={WHITE} />
      <ellipse cx={24} cy={30} rx={15} ry={11.5} fill={url(ids.fadeGradient)} />
    </mask>
    {kinds.map((kind) => (
      <clipPath key={kind} id={ids.clip(kind)}>
        {SHAPE[kind]}
      </clipPath>
    ))}
  </defs>
);

// The body in its colour and what's on its skin: a shade underneath, its texture faded over the face, and a shine. A
// plain body, while it works or on the address field, is the outline alone, so the pips are the one thing on it.
const Body: React.FC<{
  kind: MascotPalette;
  fill: string;
  plain: boolean;
  detail: MascotDetail;
  ids: Ids;
}> = ({ kind, fill, plain, detail, ids }) => {
  const texture = detail === "full" ? TEXTURE[kind] : SMALL_TEXTURE[kind];
  return (
    <>
      <g fill={fill}>{SHAPE[kind]}</g>
      {!plain && (
        <>
          <g clipPath={url(ids.clip(kind))}>
            <ellipse cx={30} cy={47} rx={27} ry={15} fill={url(ids.shade)} />
          </g>
          {/* Marked, so a page that draws one drawing at many sizes can leave it out below 48px (site/app/app.css). */}
          {texture && (
            <g mask={url(ids.fade)} data-texture>
              {texture}
            </g>
          )}
          {detail !== "small" && SHINE[kind === "lingon" ? "lingon" : "other"]}
        </>
      )}
    </>
  );
};

// What grows on top, raised under a cap so it sits on the cap's crown, then what's worn in front.
const Top: React.FC<{
  kind: MascotPalette;
  accessory: MascotAccessory;
  working: boolean;
}> = ({ kind, accessory, working }) => (
  <>
    {accessory === "cap" ? <g transform="translate(0 -5)">{TOP[kind]}</g> : TOP[kind]}
    {accessoryInFront(accessory, kind, working)}
  </>
);

const KINDS = PALETTES.map(({ id }) => id);

// The two reactions that are moods, and only from at rest, so a mood that means something is never covered up.
const POSE_FOR: Partial<Record<Reaction, Mood>> = {
  look: "curious",
  toss: "delivered",
};

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
  // On the address field while a mascot works, which is `ink`: the body takes the ground's colour, so it shows there,
  // and goes plain, as it does while it works.
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
  const id = useId();
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

  const kind = look.palette;
  const kinds = anyLook ? KINDS : [kind];
  const ids: Ids = {
    shade: `${id}shade`,
    fade: `${id}fade`,
    fadeGradient: `${id}fade-g`,
    clip: (each) => `${id}clip-${each}`,
  };
  const detail = mascotDetail(size);
  const working = drawn === "thinking" || drawn === "fetching";
  const plain = working || inverted;
  // Of every berry's layers, only its own mascot's show where the drawing carries them all.
  const each = (draw: (kind: MascotPalette) => React.ReactNode) =>
    anyLook
      ? kinds.map((berry) => (
          <g key={berry} data-berry={berry}>
            {draw(berry)}
          </g>
        ))
      : draw(kind);
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
      {!plain && <Defs ids={ids} kinds={kinds} />}
      <g transform={drawn === "curious" ? "rotate(-10 24 29)" : undefined}>
        {each((berry) => (
          <Body kind={berry} fill={c(inverted ? "inverted-body" : berry)} plain={plain} detail={detail} ids={ids} />
        ))}
        <Eyes mood={drawn} still={held} shut={shut} small={detail === "small"} />
        {detail !== "small" && <Mouth mood={drawn} />}
        {ACCESSORY_BEHIND[look.accessory]}
        {each((berry) => (
          <Top kind={berry} accessory={look.accessory} working={working} />
        ))}
      </g>
      {drawn === "asking" && <circle cx={41.5} cy={12} r={5} fill={ASK} />}
    </svg>
  );
};
