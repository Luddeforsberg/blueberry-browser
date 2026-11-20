import React from "react";
import { useFrame } from "./motion";
import { pipFrames } from "./pipPatterns";
import type { Mood } from "./moods";
import { EYE } from "./mascotColours";
import { missing } from "@shared/missing";

// Part of the mascot's drawing (Mascot.tsx): its eyes and mouth in each mood.

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
            opacity={
              still
                ? WORKING_STILL
                : off + (1 - off) * (frames[frame]?.[row * 3 + column] ?? missing(`pip ${row * 3 + column} of frame ${frame}`))
            }
          />
        )),
      )}
    </>
  );
};

export const Eyes: React.FC<{
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
export const Mouth: React.FC<{ mood: Mood }> = ({ mood }) => {
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
