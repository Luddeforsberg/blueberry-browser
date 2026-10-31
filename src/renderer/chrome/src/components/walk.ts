export interface Bounds {
  width: number;
  height: number;
}

export interface Walker {
  x: number;
  y: number;
  // Radians. Birds mostly walk across the page, so this stays close to level.
  heading: number;
  foot: -1 | 1;
  pecksLeft: number;
}

export interface Print {
  x: number;
  y: number;
  turn: number;
}

// In pixels, for a bird of BIRD_SIZE: a stride is what its legs really cover, so its feet don't slide.
export const BIRD_SIZE = 40;
export const STRIDE = 6;
export const FOOT_OFFSET = 3;
const MARGIN = 24;
const MAX_LEAN = Math.PI / 5;
const PECK_CHANCE = 0.05;
const PECK_STEPS = 7;

const clamp = (value: number, min: number, max: number) =>
  max < min ? (min + max) / 2 : Math.min(Math.max(value, min), max);

export const facesLeft = (heading: number) => Math.cos(heading) < 0;

export const placeWalker = (bounds: Bounds, random: () => number): Walker => ({
  x: clamp(random() * bounds.width, MARGIN, bounds.width - MARGIN),
  y: clamp(random() * bounds.height, MARGIN, bounds.height - MARGIN),
  heading: random() < 0.5 ? 0 : Math.PI,
  foot: 1,
  pecksLeft: 0,
});

// One tick of a bird's walk: it pauses to peck now and then, otherwise takes a step. The print goes
// where its foot is planted as the step begins, under the bird. At an edge it turns back, so it never
// leaves the page.
export function stepWalker(
  walker: Walker,
  bounds: Bounds,
  random: () => number
): { walker: Walker; print: Print | null } {
  if (walker.pecksLeft > 0) {
    return { walker: { ...walker, pecksLeft: walker.pecksLeft - 1 }, print: null };
  }
  if (random() < PECK_CHANCE) {
    return { walker: { ...walker, pecksLeft: PECK_STEPS }, print: null };
  }

  const level = facesLeft(walker.heading) ? Math.PI : 0;
  const relativeHeading = Math.atan2(Math.sin(walker.heading - level), Math.cos(walker.heading - level));
  const lean = clamp(relativeHeading + (random() - 0.5) * 0.5, -MAX_LEAN, MAX_LEAN);
  let heading = level + lean;

  const nextX = walker.x + Math.cos(heading) * STRIDE;
  const nextY = walker.y + Math.sin(heading) * STRIDE;
  if (nextX < MARGIN || nextX > bounds.width - MARGIN) heading = Math.PI - heading;
  if (nextY < MARGIN || nextY > bounds.height - MARGIN) heading = -heading;

  const x = clamp(walker.x + Math.cos(heading) * STRIDE, MARGIN, bounds.width - MARGIN);
  const y = clamp(walker.y + Math.sin(heading) * STRIDE, MARGIN, bounds.height - MARGIN);
  const foot = walker.foot === 1 ? -1 : 1;

  return {
    walker: { x, y, heading, foot, pecksLeft: 0 },
    print: {
      x: walker.x - Math.sin(heading) * FOOT_OFFSET * foot,
      y: walker.y + Math.cos(heading) * FOOT_OFFSET * foot,
      turn: (heading * 180) / Math.PI + 90,
    },
  };
}

// Follow the path one stride at a time, placing alternating feet beside its centre.
export function oldTrail(x: number, y: number, heading: number, steps: number): Print[] {
  return Array.from({ length: steps }, (_, index) => {
    const angle = heading + Math.sin(index * 0.055 + heading * 3) * 0.45 + Math.sin(index * 0.13 + heading) * 0.12;
    const foot = index % 2 === 0 ? FOOT_OFFSET : -FOOT_OFFSET;
    const print = {
      x: x - Math.sin(angle) * foot,
      y: y + Math.cos(angle) * foot,
      turn: (angle * 180) / Math.PI + 90,
    };
    x += Math.cos(angle) * STRIDE;
    y += Math.sin(angle) * STRIDE;
    return print;
  });
}
