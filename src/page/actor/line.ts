import type { Core } from "./core";
import type { Actor } from "./stage";

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// How much of what's under this box someone might be reading. Only ever a rough count, as the line is only there a moment.
const crowded = (left: number, top: number, width: number, height: number): number => {
  let count = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const x = left + (width * (col + 0.5)) / 5;
      const y = top + (height * (row + 0.5)) / 2;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (el.matches("input,textarea,select,button,a,[role=button]")) {
        count++;
        continue;
      }
      // The nearest place in some text, which only counts if the point really is on that line.
      const at = document.caretRangeFromPoint?.(x, y);
      if (at?.startContainer.nodeType !== 3 || !at.startContainer.textContent?.trim()) continue;
      const box = at.getBoundingClientRect();
      if (y >= box.top && y <= box.bottom && Math.abs(box.left - x) < 24) count++;
    }
  }
  return count;
};

const overlaps = ([left, top, width, height]: number[], box: Box): boolean =>
  left < box.right && left + width > box.left && top < box.bottom && top + height > box.top;

// The mascot's line: a few words beside it, placed over as little as can be.
export const makeLine = (a: Actor, { size, rectOf }: Core) => {
  const { line } = a.stage;

  // Tries the places around the mascot and takes the first with the least under it, always wholly on screen. Over the mascot
  // or what it's about to do is worse than over any text.
  const placeLine = (): void => {
    const spot = a.spot;
    if (!spot || !line.classList.contains("shown")) return;
    const unit = 1 / a.look.zoom;
    const { width, height } = line.getBoundingClientRect();
    const margin = 6 * unit;
    const gap = 8 * unit;
    const onScreenX = (left: number): number => Math.max(margin, Math.min(left, innerWidth - width - margin));
    const onScreenY = (top: number): number => Math.max(margin, Math.min(top, innerHeight - height - margin));
    const reach = size() * 0.6;
    const rect = a.target?.isConnected ? rectOf(a.target) : null;
    const box = rect && { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
    const self = { left: spot.x - reach, top: spot.y - size(), right: spot.x + reach, bottom: spot.y };
    const above = spot.y - size() - height - gap;
    const beside = spot.y - size() * 0.75;
    const places = [
      [spot.x - width / 2, above],
      [spot.x - reach, above],
      [spot.x + reach - width, above],
      [spot.x + reach + gap, beside],
      [spot.x - reach - gap - width, beside],
      [spot.x - width / 2, Math.max(spot.y, box?.bottom ?? spot.y) + gap],
    ].map(([left, top]) => [onScreenX(left), onScreenY(top)]);
    let best = places[0];
    let bestScore = Infinity;
    places.forEach(([left, top], order) => {
      const at = [left, top, width, height];
      const inTheWay = (box && overlaps(at, box) ? 100 : 0) + (overlaps(at, self) ? 100 : 0);
      const score = inTheWay + crowded(left, top, width, height) * 10 + order;
      if (score < bestScore) {
        best = [left, top];
        bestScore = score;
      }
    });
    a.lineAt = { x: best[0] - spot.x, y: best[1] - spot.y, width, height };
    line.style.transform = "translate(" + a.lineAt.x + "px, " + a.lineAt.y + "px)";
  };

  // The same place from the feet as they move, unless that would take it off screen.
  const keepLine = (): void => {
    if (!a.spot || !a.lineAt) return;
    const left = Math.max(0, Math.min(a.spot.x + a.lineAt.x, innerWidth - a.lineAt.width));
    const top = Math.max(0, Math.min(a.spot.y + a.lineAt.y, innerHeight - a.lineAt.height));
    line.style.transform = "translate(" + (left - a.spot.x) + "px, " + (top - a.spot.y) + "px)";
  };

  const setWords = (words: string | undefined): void => {
    if (words === undefined) return;
    if (words) line.dataset.words = words;
    line.classList.toggle("shown", !!words);
  };

  const say = (words: string | undefined): void => {
    if (words === undefined) return;
    setWords(words);
    placeLine();
  };

  return { placeLine, keepLine, setWords, say };
};

export type Line = ReturnType<typeof makeLine>;
