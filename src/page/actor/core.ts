import type { Point } from "../lib/dom";
import { poseOf, type Actor } from "./stage";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Where the mascot is and what it looks like, which everything else that moves it goes through.
export const makeCore = (a: Actor) => {
  const { flip, mascot } = a.stage;
  const quietMotion = (): boolean => a.look.still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const size = (): number => (quietMotion() ? Math.min(a.look.size, 28) : a.look.size) / a.look.zoom;
  // What each moment looks like once the settings have had their say.
  const poseFor = (name: string): string => (a.look.plain ? "pointer" : quietMotion() ? "marker" : name);

  const setPose = (name: string): void => {
    const next = poseFor(name);
    a.nod?.cancel();
    a.nod = null;
    if (next === a.pose) return;
    if (a.pose) poseOf(a.stage, a.pose).classList.remove("shown");
    poseOf(a.stage, next).classList.add("shown");
    a.pose = next;
  };
  const setFacing = (next: number): void => {
    a.facing = next;
    flip.style.transform = "scaleX(" + next + ")";
  };
  const place = ({ x, y }: Point): void => {
    a.spot = { x, y };
    mascot.style.transform = "translate(" + x + "px, " + y + "px)";
  };
  const now = (): Point => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(mascot).transform);
    return { x: matrix.e, y: matrix.f };
  };

  const rectOf = (el: Element): Rect | null => {
    const box = el.getBoundingClientRect();
    let left = box.left;
    let top = box.top;
    for (let win: Window | null = el.ownerDocument.defaultView; win && win !== window; win = win.parent) {
      const owner = win.frameElement;
      if (!owner) return null;
      const outer = owner.getBoundingClientRect();
      left += outer.left + owner.clientLeft;
      top += outer.top + owner.clientTop;
    }
    return { left, top, width: box.width, height: box.height };
  };

  return { quietMotion, size, setPose, setFacing, place, now, rectOf };
};

export type Core = ReturnType<typeof makeCore>;
