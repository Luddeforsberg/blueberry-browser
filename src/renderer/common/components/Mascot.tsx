import React, { useId, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { MascotAccessory, MascotLook, MascotPalette } from "@shared/library";
import { PALETTES } from "@shared/mascots";
import { cn } from "../lib/utils";
import { mascotDetail, type MascotDetail } from "./mascotDetail";
import { useStill } from "./motion";
import { useMascotReaction, type Reaction } from "./useMascotReaction";
import { MOOD_LABELS, type Mood } from "./moods";
import { c, WHITE, type Ids, url } from "./mascotColours";
import { SHAPE, TEXTURE, SMALL_TEXTURE, SHINE, TOP, ACCESSORY_BEHIND, accessoryInFront } from "./mascotShapes";
import { Eyes, Mouth } from "./MascotFace";

const BERRY_LOOK: MascotLook = { palette: "blueberry", accessory: "none" };

const ASK = "rgb(var(--ask))";

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
