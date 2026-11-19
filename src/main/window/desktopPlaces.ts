import type { DesktopBerrySpot, DesktopEdge, Point, Rect } from "../../shared/ipc";
import { DESKTOP_BOX, DESKTOP_DROP, DESKTOP_DROP_MOST, DESKTOP_FILLET, DESKTOP_SHADOW } from "../../shared/desktopSizes";
import { clamp } from "./Layout";

// The drop on the edge of the screen (DESIGN.md, On your desktop), with its sizes in src/shared/desktopSizes.ts. Its
// window keeps one size wherever it stands, big enough for everything the drop says by itself, so nothing native moves
// or resizes while it grows.
const DESKTOP_SHEETS_FROM_EDGE = DESKTOP_DROP.out + 8;
// Let go this close to a corner, and that's where it goes.
const DESKTOP_CORNER_SNAP = 56;
// With nothing saved, the right edge, a little below the middle, where no taskbar or Dock is under it.
export const DESKTOP_DEFAULT_SPOT = { edge: "right", fraction: 0.6 } as const;

type Spot = Pick<DesktopBerrySpot, "edge" | "fraction">;

export interface DesktopPlace {
  window: Rect;
  // The middle of the drop, on the edge, in the window. It can be outside the window, for the sheets beside it.
  anchor: Point;
}

const sideEdge = (edge: DesktopEdge): boolean => edge === "left" || edge === "right";

// From its middle to the end of a fillet, along the edge, so that at rest it's wholly on screen however far along it is.
const DESKTOP_REACH = DESKTOP_FILLET + DESKTOP_DROP.along / 2;

// The middle of the drop on the screen: a point on the edge.
const dropMiddle = (area: Rect, { edge, fraction }: Spot): Point => {
  const across = sideEdge(edge);
  const start = across ? area.y : area.x;
  const length = across ? area.height : area.width;
  const along = Math.round(start + Math.min(DESKTOP_REACH, length / 2) + clamp(fraction, 0, 1) * Math.max(length - 2 * DESKTOP_REACH, 0));
  if (edge === "right") return { x: area.x + area.width, y: along };
  if (edge === "left") return { x: area.x, y: along };
  if (edge === "top") return { x: along, y: area.y };
  return { x: along, y: area.y + area.height };
};

// A window against the edge, `out` from it and `along` it, centred on the drop and wholly inside the work area.
const againstEdge = (area: Rect, edge: DesktopEdge, middle: Point, out: number, along: number): Rect => {
  const width = Math.min(sideEdge(edge) ? out : along, area.width);
  const height = Math.min(sideEdge(edge) ? along : out, area.height);
  const x =
    edge === "right"
      ? area.x + area.width - width
      : edge === "left"
        ? area.x
        : clamp(middle.x - width / 2, area.x, area.x + area.width - width);
  const y =
    edge === "bottom"
      ? area.y + area.height - height
      : edge === "top"
        ? area.y
        : clamp(middle.y - height / 2, area.y, area.y + area.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
};

const placed = (window: Rect, middle: Point): DesktopPlace => ({ window, anchor: { x: middle.x - window.x, y: middle.y - window.y } });

// The drop's own window. Along a side edge it grows out of it, and along the top or bottom it grows along it.
export const desktopPlace = (area: Rect, spot: Spot): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const { long, thick } = DESKTOP_DROP_MOST;
  const across = thick + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW);
  return placed(
    sideEdge(spot.edge)
      ? againstEdge(area, spot.edge, middle, long + DESKTOP_SHADOW, across)
      : againstEdge(area, spot.edge, middle, thick + DESKTOP_SHADOW, long + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW)),
    middle,
  );
};

// The drop at rest in its window, without its fillets: what takes the pointer until the view says what it's drawing.
export const desktopRestingDrop = ({ anchor }: Pick<DesktopPlace, "anchor">, edge: DesktopEdge): Rect => {
  const { along, out } = DESKTOP_DROP;
  if (sideEdge(edge)) return { x: edge === "right" ? anchor.x - out : anchor.x, y: anchor.y - along / 2, width: out, height: along };
  return { x: anchor.x - along / 2, y: edge === "bottom" ? anchor.y - out : anchor.y, width: along, height: out };
};

// The prompt box's window: from the same place on the edge, so the drop can grow into it. Along a side edge it grows
// out of the edge, and along the top or bottom it grows along it. `thick` is the box's own, taller with more lines.
export const desktopBoxPlace = (area: Rect, spot: Spot, thick: number = DESKTOP_BOX.thick): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const across = Math.max(thick, DESKTOP_BOX.thick) + 2 * DESKTOP_BOX.around;
  return placed(
    sideEdge(spot.edge)
      ? againstEdge(area, spot.edge, middle, DESKTOP_BOX.long + DESKTOP_SHADOW, across)
      : againstEdge(area, spot.edge, middle, across, DESKTOP_BOX.long + 2 * (DESKTOP_FILLET + DESKTOP_SHADOW)),
    middle,
  );
};

// The tray and the ask: beside the drop, towards the middle of the screen, and wholly on screen at any size.
export const desktopSheetsPlace = (area: Rect, spot: Spot, size: { width: number; height: number }): DesktopPlace => {
  const middle = dropMiddle(area, spot);
  const { edge } = spot;
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  const x =
    edge === "right"
      ? area.x + area.width - DESKTOP_SHEETS_FROM_EDGE - width
      : edge === "left"
        ? area.x + DESKTOP_SHEETS_FROM_EDGE
        : middle.x - width / 2;
  const y =
    edge === "bottom"
      ? area.y + area.height - DESKTOP_SHEETS_FROM_EDGE - height
      : edge === "top"
        ? area.y + DESKTOP_SHEETS_FROM_EDGE
        : middle.y - height / 2;
  const window = {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
  return placed(window, middle);
};

// The nearest edge to a point on a display, and how far along it. Near a corner, it's the corner.
export const desktopSpotAt = (area: Rect, displayId: number, point: Point): DesktopBerrySpot => {
  const distances: Array<[DesktopEdge, number]> = [
    ["bottom", area.y + area.height - point.y],
    ["top", point.y - area.y],
    ["left", point.x - area.x],
    ["right", area.x + area.width - point.x],
  ];
  const [edge] = distances.reduce((nearest, next) => (next[1] < nearest[1] ? next : nearest));
  const horizontal = !sideEdge(edge);
  const start = horizontal ? area.x : area.y;
  const length = horizontal ? area.width : area.height;
  const at = (horizontal ? point.x : point.y) - start;
  if (at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 0 };
  if (length - at < DESKTOP_CORNER_SNAP) return { displayId, edge, fraction: 1 };
  const room = length - 2 * DESKTOP_REACH;
  return { displayId, edge, fraction: room > 0 ? clamp((at - DESKTOP_REACH) / room, 0, 1) : 0 };
};

export const desktopHit = (point: Point, window: Rect, hits: Rect[]): boolean =>
  hits.some(({ x, y, width, height }) => {
    const left = window.x + x;
    const top = window.y + y;
    return point.x >= left && point.x < left + width && point.y >= top && point.y < top + height;
  });
