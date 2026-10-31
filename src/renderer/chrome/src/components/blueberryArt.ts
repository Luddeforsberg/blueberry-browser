// One of the small berries that build the big one. Positions are in units of the fruit's radius.
export interface Berrylet {
  x: number;
  y: number;
  // How squarely it faces us, from 0 at the fruit's edge to 1. Near the edge it's seen side on.
  facing: number;
  // How much light it catches, from 0 to 1.
  light: number;
  // How far it is from the crown, from 0 to 1, as a share of the fruit's surface.
  fromCrown: number;
}

const LIGHT = { x: -0.45, y: -0.62, z: 0.64 };
// Where the crown sits on the fruit, near the top so it shows above the page's cards.
export const CROWN = { x: 0.09, y: -0.83 };
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// The same seed always gives the same grain, so the fruit doesn't change between new tabs.
export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A point on the fruit's face turned towards the light. Off the fruit there's no light to catch.
export const lightAt = (x: number, y: number): number => {
  const rest = 1 - x * x - y * y;
  if (rest <= 0) return 0;
  const shade = x * LIGHT.x + y * LIGHT.y + Math.sqrt(rest) * LIGHT.z;
  return Math.max(0, Math.min(1, (shade + 0.25) / 1.25));
};

// Spirals small berries over a sphere from the crown, the way seeds grow in a sunflower head, and keeps
// the ones on the side facing us.
export const growBerrylets = (count: number): Berrylet[] => {
  const pole = { ...CROWN, z: Math.sqrt(1 - CROWN.x * CROWN.x - CROWN.y * CROWN.y) };
  const across = Math.hypot(pole.x, pole.z);
  const u = { x: pole.z / across, y: 0, z: -pole.x / across };
  const v = {
    x: pole.y * u.z - pole.z * u.y,
    y: pole.z * u.x - pole.x * u.z,
    z: pole.x * u.y - pole.y * u.x,
  };

  const berrylets: Berrylet[] = [];
  for (let index = 0; index < count; index++) {
    const fromCrown = (index + 0.5) / count;
    const height = 1 - 2 * fromCrown;
    const around = Math.sqrt(1 - height * height);
    const angle = index * GOLDEN_ANGLE;
    const a = Math.cos(angle) * around;
    const b = Math.sin(angle) * around;
    const x = a * u.x + b * v.x + height * pole.x;
    const y = a * u.y + b * v.y + height * pole.y;
    const facing = a * u.z + b * v.z + height * pole.z;
    if (facing <= 0) continue;
    berrylets.push({ x, y, facing, light: lightAt(x, y), fromCrown });
  }
  return berrylets;
};
