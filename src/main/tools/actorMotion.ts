// Where the mascot on the page lands and how long what it does takes, worked out from where things are. Plain numbers:
// `PageActor` decides when any of it is drawn.

// Drawing size on screen. `.pose` is positioned from where the feet are, which is what everything here measures.
export const MASCOT_SIZE = 56;
const FEET_X = 57 / 120;

// Flight time grows with distance, within what a fraction of a second allows.
const FLIGHT_BASE_MS = 200;
const FLIGHT_MS_PER_PIXEL = 0.35;
const FLIGHT_MAX_MS = 520;
const ENTRY_MS = 520;

// Letters arrive one tick at a time. Longer text gets bigger chunks rather than more time.
const TYPE_TICK_MS = 34;
export const TYPE_MAX_MS = 1300;

// Where an element is, in the top page's pixels, from `spotOf`.
export interface Spot {
  left: number;
  top: number;
  width: number;
  height: number;
  // Where a click would go.
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
  // Its label, unless it's a secret field or holds what's typed in it, so never anything the user typed.
  name?: string;
  secret?: boolean;
}

// "ask" stands where "land" would, and faces the user there until they answer.
export type Landing = "land" | "perch" | "look" | "ask";

export interface Place {
  x: number;
  y: number;
  // 1 faces right, -1 faces left.
  turn: 1 | -1;
}

// Where the feet go. Over a short target it stands on the top edge, so it hides none of the label, and leans in to peck.
// Over a tall one, near the point. It faces into the page wherever the left side is too tight.
export const landingFor = ({ left, top, width, height, x, y, viewWidth }: Spot, kind: Landing, size = MASCOT_SIZE): Place => {
  if (kind === "perch") {
    // Sat on the edge at the far end, clear of the letters coming in from the start.
    const seat = left + width - Math.min(width * 0.25, size);
    return { x: Math.max(size * 0.6, Math.min(seat, viewWidth - size * 0.6)), y: Math.max(size * 0.7, top), turn: 1 };
  }
  const reach = size * 0.42;
  const turn: 1 | -1 = x - reach - size * FEET_X < 0 ? -1 : x + reach + size * 0.6 > viewWidth && x > viewWidth / 2 ? -1 : 1;
  const edge = height <= size * 1.5 ? top + Math.min(height * 0.2, 6) : y - size * 0.3;
  return { x: x - turn * reach, y: Math.max(size * 0.9, edge), turn };
};

export const flightMs = (from: { x: number; y: number } | null, to: { x: number; y: number }): number => {
  if (!from) return ENTRY_MS;
  return Math.round(Math.min(FLIGHT_MAX_MS, FLIGHT_BASE_MS + Math.hypot(to.x - from.x, to.y - from.y) * FLIGHT_MS_PER_PIXEL));
};

// A short text one letter at a time, and a long one in as many chunks as fit, so 5000 characters take no longer than 40.
export const typingChunks = (text: string): string[] => {
  const letters = [...text];
  const size = Math.max(1, Math.ceil(letters.length / Math.floor(TYPE_MAX_MS / TYPE_TICK_MS)));
  const chunks: string[] = [];
  for (let at = 0; at < letters.length; at += size) chunks.push(letters.slice(at, at + size).join(""));
  return chunks;
};

// Not metronomic: a bit of variation between ticks, and a small pause after a word.
export const typingPauseMs = (chunk: string): number => {
  const jitter = TYPE_TICK_MS * (0.7 + Math.random() * 0.6);
  return /\s$/.test(chunk) ? jitter * 1.6 : jitter;
};
