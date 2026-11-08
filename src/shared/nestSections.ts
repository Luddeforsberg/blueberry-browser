// Sections on a Nest's board: named, coloured areas behind cards. Shared by the chrome, which draws and moves them, and
// main, which keeps them and fits one around a plan's cards. Pure, so the rules can be tested without a board.
import type { NestSection } from "./library";
import { CARD_HEIGHT, type Rect } from "./nestPlace";

export const SECTION_COLORS = ["yellow", "green", "blue", "pink", "purple", "gray"] as const;
export type NestSectionColor = (typeof SECTION_COLORS)[number];

export const isSectionColor = (value: unknown): value is NestSectionColor => typeof value === "string" && (SECTION_COLORS as readonly string[]).includes(value);

export const SECTION_NAME = "Section";
export const MAX_SECTION_NAME = 40;
// Small enough to hold one card's head, never so small its name has no room, and as big as the board itself.
export const SECTION_SIZE = { minWidth: 240, minHeight: 160, maxWidth: 2_000_000, maxHeight: 2_000_000 };
// What a click with the section tool makes, with no drag.
export const SECTION_DEFAULT = { width: 520, height: 360 };
// Room kept around cards a section is fitted to: its name and the cards' birds above them, and a margin elsewhere.
export const SECTION_PAD = { x: 32, top: 104, bottom: 40 };

// A name the user typed or a plan gave, on one line, without control or invisible characters, and short.
export const sectionName = (value: unknown): string => {
  const line = typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "";
  return line.length > MAX_SECTION_NAME ? `${line.slice(0, MAX_SECTION_NAME - 1).trimEnd()}…` : line;
};

// The point of a card that says which section it's in: its centre, counting a card taller than usual at the usual height,
// so a card that grows with its answer stays in the section it was dropped in.
const anchorOf = (card: Rect) => ({ x: card.x + card.width / 2, y: card.y + Math.min(card.height, CARD_HEIGHT) / 2 });

// Whether a card is in a section: its point is inside, counting the section's top and left edges and not its bottom and
// right, so a card on the line between two sections side by side is in exactly one.
export const inSection = (card: Rect, section: Rect): boolean => {
  const { x, y } = anchorOf(card);
  return x >= section.x && x < section.x + section.width && y >= section.y && y < section.y + section.height;
};

// The cards in a section, by id, in the order given.
export const cardsIn = <T extends Rect & { id: string }>(section: Rect, cards: readonly T[]): string[] => cards.filter((card) => inSection(card, section)).map((card) => card.id);

// The other sections wholly inside one, which move with it.
export const sectionsIn = <T extends Rect & { id: string }>(section: Rect & { id: string }, sections: readonly T[]): string[] =>
  sections
    .filter(
      (other) =>
        other.id !== section.id &&
        other.x >= section.x &&
        other.y >= section.y &&
        other.x + other.width <= section.x + section.width &&
        other.y + other.height <= section.y + section.height
    )
    .map((other) => other.id);

// A section around cards, with room for its name and their birds above them. Null with no cards.
export const fitSection = (cards: readonly Rect[]): Rect | null => {
  if (cards.length === 0) return null;
  const left = Math.min(...cards.map((card) => card.x)) - SECTION_PAD.x;
  const top = Math.min(...cards.map((card) => card.y)) - SECTION_PAD.top;
  const right = Math.max(...cards.map((card) => card.x + card.width)) + SECTION_PAD.x;
  const bottom = Math.max(...cards.map((card) => card.y + card.height)) + SECTION_PAD.bottom;
  return { x: left, y: top, width: Math.max(SECTION_SIZE.minWidth, right - left), height: Math.max(SECTION_SIZE.minHeight, bottom - top) };
};

// A rectangle dragged between two points, at least the smallest size. A drag too short to mean anything is a click, which
// makes the usual size there.
export const drawnSection = (from: { x: number; y: number }, to: { x: number; y: number }, click: number): Rect => {
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  if (width < click && height < click) return { x: from.x, y: from.y, ...SECTION_DEFAULT };
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.max(SECTION_SIZE.minWidth, width), height: Math.max(SECTION_SIZE.minHeight, height) };
};

// A section being made bigger or smaller from one corner, the opposite corner staying put, never below the smallest size.
export type SectionCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const resizeSection = (start: Rect, corner: SectionCorner, dx: number, dy: number): Rect => {
  const left = corner.endsWith("left");
  const top = corner.startsWith("top");
  const width = Math.max(SECTION_SIZE.minWidth, start.width + (left ? -dx : dx));
  const height = Math.max(SECTION_SIZE.minHeight, start.height + (top ? -dy : dy));
  return { x: left ? start.x + start.width - width : start.x, y: top ? start.y + start.height - height : start.y, width, height };
};

// The colour a new section gets: the first no section on the board has yet, in order, or the next round once all are used.
export const nextColor = (taken: readonly NestSectionColor[]): NestSectionColor => {
  const free = SECTION_COLORS.find((color) => !taken.includes(color));
  return free ?? SECTION_COLORS[taken.length % SECTION_COLORS.length];
};

// The size of a section's name in board pixels: 13px on screen at 100% and closer, growing as the board zooms out, to
// 26px at the furthest, so a board seen whole reads as a map of its sections.
export const nameSize = (zoom: number): number => {
  const onScreen = Math.min(26, Math.max(13, 13 / Math.sqrt(zoom)));
  return onScreen / zoom;
};

// A section's name in its box, in the name's own size: how far it sits in from the section's top and left edges, so the
// inset grows with the name and it never reaches the edge, and how tall it is with its padding, at a line height of 1.25.
export const NAME_BOX = { inset: 0.6, height: 1.55 };

// The name's size, as `nameSize` has it, but never so big that its box reaches `room` board pixels down from the
// section's top, where the highest bird in it stands, so no card covers it, and never under 13px on screen. Null room,
// for a section with no cards, leaves it as it is.
export const sectionNameSize = (zoom: number, room: number | null): number => {
  const wanted = nameSize(zoom);
  return room === null ? wanted : Math.max(13 / zoom, Math.min(wanted, room / (NAME_BOX.inset + NAME_BOX.height)));
};

// The section a plan's cards go in: one fitted around them when the plan is two cards or more, named by the plan or else
// by the request, with the next free colour. One card gets none.
export const planSection = (cards: readonly Rect[], name: string, taken: readonly NestSectionColor[]): Omit<NestSection, "id"> | null => {
  const rect = cards.length >= 2 ? fitSection(cards) : null;
  return rect && { name: sectionName(name) || SECTION_NAME, color: nextColor(taken), ...rect };
};
