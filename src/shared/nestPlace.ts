// Where cards go on a Nest's board, so a new one never lands on another. Shared by the chrome, which places the cards
// the user makes, and main, which places the cards of a plan.

export const CARD_WIDTH = 440;
// What a card is assumed to take before it has been drawn and measured.
export const CARD_HEIGHT = 200;
// Between a card and the one pulled out of it, so the line between them has room to read as one.
export const CARD_GAP = 120;
const ROW_STEP = 48;
const MAX_TRIES = 200;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN = 24;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + MARGIN && b.x < a.x + a.width + MARGIN && a.y < b.y + b.height + MARGIN && b.y < a.y + a.height + MARGIN;

// The first place from `want` downwards where a card of `size` covers no other, so a new card never lands on one.
export const freeSpot = (cards: readonly Rect[], want: { x: number; y: number }, size = { width: CARD_WIDTH, height: CARD_HEIGHT }) => {
  for (let step = 0; step < MAX_TRIES; step++) {
    const spot = { x: want.x, y: want.y + step * ROW_STEP };
    if (!cards.some((card) => overlaps({ ...spot, ...size }, card))) return spot;
  }
  return want;
};

// Where a card pulled out of `source` with a click goes: beside it, level with it, or below that if it's taken.
export const besideSpot = (source: Rect, cards: readonly Rect[]) => freeSpot(cards, { x: source.x + source.width + CARD_GAP, y: source.y });

// A card on the board as it's drawn now, and whether it was placed for the user and never moved by hand, so it may be
// nudged out of the way.
export interface PlacedCard extends Rect {
  id: string;
  movable: boolean;
}

export interface Nudge {
  id: string;
  x: number;
  y: number;
}

// The first place from where a card is, straight down, where it covers none of `others`.
const clearOf = (card: Rect, others: readonly Rect[]): number => {
  let y = card.y;
  for (;;) {
    const hits = others.filter((other) => overlaps({ ...card, y }, other));
    if (hits.length === 0) return y;
    y = Math.max(...hits.map((other) => other.y + other.height + MARGIN));
  }
};

// After cards have grown, such as when an answer or a table arrives: each card covered by one above it moves straight
// down, only as far as it must, past every card in the way, if it was placed for the user and never moved by hand.
// Nothing else moves, so a card the user placed stays where it is, even when one grew over it. Top to bottom, so one
// card's move makes room for the next.
export const settle = (cards: readonly PlacedCard[]): Nudge[] => {
  const fixed = cards.filter((card) => !card.movable);
  const above: Rect[] = [];
  const nudges: Nudge[] = [];
  for (const card of [...cards].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (card.movable && above.some((other) => overlaps(card, other))) {
      const y = clearOf(card, [...above, ...fixed]);
      nudges.push({ id: card.id, x: card.x, y });
      above.push({ ...card, y });
    } else above.push(card);
  }
  return nudges;
};
