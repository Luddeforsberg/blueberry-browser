import { useCallback, useEffect, useRef, useState } from "react";

// `look` and `toss` are poses, drawn by Mascot. The rest are movement, played on the drawing as a whole.
export type Reaction = "hop" | "look" | "toss" | "ruffle" | "turn" | "nudge";

const MS: Record<Reaction, number> = { hop: 420, look: 900, toss: 1400, ruffle: 1200, turn: 1500, nudge: 220 };

// At its feet, so its weight goes down through them.
const FEET = "48% 94%";

const MOVES: Partial<Record<Reaction, { frames: string[]; offsets?: number[]; ms: number }>> = {
  hop: {
    frames: ["none", "translateY(0) scale(1.06, 0.92)", "translateY(-16%) scale(0.97, 1.04)", "translateY(0) scale(1.04, 0.96)", "none"],
    offsets: [0, 0.2, 0.55, 0.85, 1],
    ms: MS.hop,
  },
  ruffle: {
    frames: ["none", "rotate(-5deg) scale(1.05, 0.97)", "rotate(5deg) scale(1.07, 0.96)", "rotate(-4deg) scale(1.05, 0.97)", "rotate(3deg) scale(1.02, 0.99)", "none"],
    ms: 460,
  },
  // Round to face away, a moment with its back to you, and back again.
  turn: {
    frames: ["none", "scaleX(-1)", "scaleX(-1)", "none"],
    offsets: [0, 0.14, 0.86, 1],
    ms: MS.turn,
  },
  nudge: { frames: ["none", "scale(1.04, 0.94)", "none"], ms: MS.nudge },
};

// What a click gets next. Only a bird with nothing to say swaps pose, so a mood that means something stays on screen.
const CYCLES: Record<string, Reaction[]> = {
  rest: ["hop", "look", "toss", "ruffle"],
  sitting: ["hop", "ruffle"],
  curious: ["hop", "ruffle"],
};

// This many clicks this close together, and it's had enough.
const TURN_AFTER = 5;
const TURN_WITHIN_MS = 2500;

// A small reaction to being clicked. It says nothing and changes no state: Mascot's label stays the real mood.
export const useMascotReaction = (element: React.RefObject<SVGSVGElement | null>, mood: string, enabled: boolean) => {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const clicks = useRef<number[]>([]);
  const next = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const move = useRef<Animation | null>(null);
  const turned = useRef(false);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    move.current?.cancel();
    move.current = null;
    turned.current = false;
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (chosen: Reaction) => {
      stop();
      setReaction(chosen);
      turned.current = chosen === "turn";
      timer.current = setTimeout(() => {
        turned.current = false;
        setReaction(null);
      }, MS[chosen]);
      const planned = MOVES[chosen];
      if (planned) {
        move.current =
          element.current?.animate(
            planned.frames.map((transform, index) => ({ transform, transformOrigin: FEET, ...(planned.offsets && { offset: planned.offsets[index] }) })),
            { duration: planned.ms, easing: "ease-out" },
          ) ?? null;
      }
    },
    [element, stop],
  );

  const react = useCallback(() => {
    if (!enabled || turned.current) return;
    const cycle = CYCLES[mood];

    // Movement becomes a change of pose, and only where there's one to change to.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (mood === "rest") play("look");
      return;
    }
    if (!cycle) return play("nudge");

    const now = Date.now();
    clicks.current = [...clicks.current.filter((at) => now - at < TURN_WITHIN_MS), now];
    if (clicks.current.length >= TURN_AFTER) {
      clicks.current = [];
      return play("turn");
    }
    play(cycle[next.current++ % cycle.length]);
  }, [enabled, mood, play]);

  return { reaction, react };
};
