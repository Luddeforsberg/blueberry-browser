import type { Point } from "../lib/dom";
import { elementOf } from "../lib/state";
import type { Core } from "./core";
import type { Line } from "./line";
import { div, type Actor } from "./stage";

const STEPS = 16;

// How the mascot gets from one place to another, and keeps its place as the page moves under it.
export const makeMotion = (a: Actor, { quietMotion, size, place, now, rectOf }: Core, { keepLine }: Line) => {
  const { sky, mascot, body } = a.stage;

  const landed = (): Animation =>
    body.animate([{ transform: "scale(1.1, 0.88)" }, { transform: "scale(0.98, 1.03)", offset: 0.6 }, { transform: "none" }], {
      duration: 170,
      easing: "ease-out",
    });

  const cancelFlight = (): void => {
    if (!a.flight) return;
    const at = now();
    a.flight.cancel();
    a.flight = null;
    place(at);
  };

  // Along a shallow arc, quick off the mark and gently down. The frames are worked out here so the arc and the easing are
  // one curve, and the compositor plays them, so a busy page doesn't make it stutter.
  const flyTo = (to: Point, ms: number, arc: number, onLanded?: () => void): Animation => {
    cancelFlight();
    const from = a.spot ?? now();
    const frames = [];
    for (let at = 0; at <= STEPS; at++) {
      const p = at / STEPS;
      const eased = p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased - arc * Math.sin(Math.PI * p);
      frames.push({ transform: "translate(" + x + "px, " + y + "px)" });
    }
    place(to);
    a.landingPose = null;
    const run = mascot.animate(frames, { duration: ms, easing: "linear" });
    a.flight = run;
    run.onfinish = () => {
      if (a.flight !== run) return;
      a.flight = null;
      onLanded?.();
    };
    return run;
  };

  const fade = (): Animation => mascot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });

  // A page moves under the mascot, so what it's standing on stays under its feet, as far as the screen goes.
  const follow = (): void => {
    if (!a.anchor || a.flight || !a.anchor.el.isConnected) return;
    const rect = rectOf(a.anchor.el);
    if (!rect) return;
    const x = Math.max(4, Math.min(rect.left + a.anchor.dx, innerWidth - 4));
    const y = Math.max(size() * 0.7, Math.min(rect.top + a.anchor.dy, innerHeight - 4));
    place({ x, y });
    keepLine();
  };
  let followQueued = false;
  const queueFollow = (): void => {
    if (followQueued) return;
    followQueued = true;
    requestAnimationFrame(() => {
      followQueued = false;
      follow();
    });
  };

  const anchorTo = (ref: string | undefined): void => {
    const el = ref ? elementOf(ref) : null;
    const rect = el ? rectOf(el) : null;
    a.anchor = el && rect && a.spot ? { el, dx: a.spot.x - rect.left, dy: a.spot.y - rect.top } : null;
  };

  const ripple = ({ x, y }: Point): void => {
    const el = div("ripple", sky);
    el.style.left = x + "px";
    el.style.top = y + "px";
    const scale = 1 / a.look.zoom;
    el.animate(
      [
        { transform: "scale(" + 0.25 * scale + ")", opacity: 1 },
        { transform: "scale(" + 0.9 * scale + ")", opacity: 0.9, offset: 0.45 },
        { transform: "scale(" + 1.35 * scale + ")", opacity: 0 },
      ],
      { duration: quietMotion() ? 240 : 480, easing: "ease-out" },
    ).onfinish = () => el.remove();
  };

  return { landed, cancelFlight, flyTo, fade, queueFollow, anchorTo, ripple };
};

export type Motion = ReturnType<typeof makeMotion>;
