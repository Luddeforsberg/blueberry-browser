import type { Kit } from "./moves";
import type { Actor } from "./stage";

const FRAME_TAGS = "iframe,frame";

interface Stop {
  left: number;
  top: number;
}

// What's in view that someone would read, top to bottom, at most four of them far enough apart to hop between.
const stopsInView = (margin: number): Stop[] => {
  const blocks = [...document.querySelectorAll<HTMLElement>("h1,h2,h3,p,li,td,dt,dd,blockquote,figcaption,label")]
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(
      ({ el, box }) =>
        box.width > 40 &&
        box.height > 8 &&
        box.top >= margin * 0.8 &&
        box.bottom <= innerHeight &&
        box.left >= 0 &&
        box.left < innerWidth - 60 &&
        (el.innerText?.trim().length ?? 0) > 2,
    )
    .sort((a, b) => a.box.top - b.box.top);
  const stops: Stop[] = [];
  for (const { box } of blocks) {
    if (stops.length < 4 && (stops.length === 0 || box.top - stops[stops.length - 1].top > margin * 1.6)) stops.push(box);
  }
  if (stops.length === 0)
    stops.push({ left: innerWidth - margin * 2, top: margin * 1.5 }, { left: innerWidth - margin * 2, top: innerHeight / 2 });
  return stops;
};

export interface FrameSpot {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
}

// Sits on the edge of a frame it can't reach into, or stays where it is if it can't tell which one that is.
export const frameSpot = ({ origin }: { origin: string }): FrameSpot | null => {
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(FRAME_TAGS)) {
    let from = "";
    try {
      from = new URL(frame.src).origin;
    } catch {
      continue;
    }
    const box = frame.getBoundingClientRect();
    if (from === origin && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight) {
      return {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        x: box.left + box.width / 2,
        y: box.top + Math.min(box.height / 2, 20),
        viewWidth: innerWidth,
        viewHeight: innerHeight,
      };
    }
  }
  return null;
};

// Hops down what's in view, stopping to look at each thing it reads. It never scrolls the page: that would be doing
// something, and all it's doing is reading. Runs by itself, and anything else coming along ends it.
export const makeRead = (a: Actor, kit: Kit) => {
  const { quietMotion, size, setPose, setFacing, place, placeLine, say, landed, flyTo, fade, begin, entering, offStage } = kit;

  return ({ words }: { words?: string }): boolean => {
    if (!begin()) return false;
    a.anchor = null;
    a.target = null;
    say(words);
    const margin = size();
    const stops = stopsInView(margin);
    const onLeft = (box: Stop): { x: number; y: number } => ({
      x: Math.max(margin * 0.6, box.left - margin * 0.35),
      y: Math.min(box.top + margin * 0.2, innerHeight - 4),
    });
    if (quietMotion()) {
      setPose("looking");
      place(onLeft(stops[0]));
      setFacing(1);
      placeLine();
      fade();
      return true;
    }
    if (entering()) place(offStage());
    const job = a.reading;
    let at = 0;
    const next = (): void => {
      if (job !== a.reading || at >= stops.length) return;
      const to = onLeft(stops[at++]);
      const far = Math.hypot(to.x - (a.spot?.x ?? to.x), to.y - (a.spot?.y ?? to.y));
      setPose(far > margin * 4 ? "flying" : "looking");
      setFacing(far > margin * 4 && to.x < (a.spot?.x ?? 0) ? -1 : 1);
      flyTo(to, far > margin * 4 ? Math.min(240 + far * 0.3, 480) : 230, Math.min(margin * 0.5, 10 + far * 0.2), () => {
        if (job !== a.reading) return;
        setPose("looking");
        setFacing(1);
        landed();
        setTimeout(next, 420);
      });
      placeLine();
    };
    next();
    return true;
  };
};
