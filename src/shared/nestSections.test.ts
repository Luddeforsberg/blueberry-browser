import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH } from "./nestPlace";
import { cardsIn, drawnSection, fitSection, inSection, NAME_BOX, nameSize, nextColor, planSection, resizeSection, SECTION_DEFAULT, SECTION_PAD, SECTION_SIZE, sectionName, sectionNameSize, sectionsIn } from "./nestSections";

const section = { x: 0, y: 0, width: 1000, height: 600 };
// A card whose centre is at (cx, cy), at the usual size.
const cardAt = (cx: number, cy: number, height = CARD_HEIGHT) => ({ x: cx - CARD_WIDTH / 2, y: cy - CARD_HEIGHT / 2, width: CARD_WIDTH, height });

describe("inSection", () => {
  it("counts a card by its centre, the top and left edges in and the bottom and right edges out", () => {
    expect(inSection(cardAt(0, 0), section)).toBe(true);
    expect(inSection(cardAt(-1, 300), section)).toBe(false);
    expect(inSection(cardAt(999, 599), section)).toBe(true);
    expect(inSection(cardAt(1000, 300), section)).toBe(false);
    expect(inSection(cardAt(500, 600), section)).toBe(false);
    // Mostly outside, but its centre is in.
    expect(inSection(cardAt(990, 590), section)).toBe(true);
  });

  it("puts a card on the line between two sections side by side in exactly one", () => {
    const right = { x: 1000, y: 0, width: 1000, height: 600 };
    const card = cardAt(1000, 300);
    expect([inSection(card, section), inSection(card, right)]).toEqual([false, true]);
  });

  it("counts a card that grew taller than usual at the usual height, so its answer doesn't take it out", () => {
    const tall = { x: 100, y: 400, width: CARD_WIDTH, height: 1200 };
    expect(inSection(tall, section)).toBe(true);
    expect(inSection({ ...tall, y: 600 - CARD_HEIGHT / 2 }, section)).toBe(false);
  });

  it("lists the cards and the sections wholly inside one", () => {
    expect(cardsIn(section, [{ id: "a", ...cardAt(100, 100) }, { id: "b", ...cardAt(1100, 100) }])).toEqual(["a"]);
    expect(cardsIn(section, [])).toEqual([]);
    const outer = { id: "outer", ...section };
    expect(
      sectionsIn(outer, [outer, { id: "inner", x: 0, y: 0, width: 1000, height: 600 }, { id: "over", x: 900, y: 0, width: 200, height: 200 }])
    ).toEqual(["inner"]);
  });
});

describe("fitSection", () => {
  it("fits around cards with room for the name and birds above", () => {
    expect(fitSection([])).toBeNull();
    expect(fitSection([{ x: 100, y: 200, width: 440, height: 200 }, { x: 680, y: 260, width: 440, height: 300 }])).toEqual({
      x: 100 - SECTION_PAD.x,
      y: 200 - SECTION_PAD.top,
      width: 680 + 440 - 100 + 2 * SECTION_PAD.x,
      height: 260 + 300 - 200 + SECTION_PAD.top + SECTION_PAD.bottom,
    });
  });

  it("is never smaller than a section can be, and every card it's fitted to is in it", () => {
    const tiny = { x: 0, y: 0, width: 10, height: 10 };
    expect(fitSection([tiny])).toMatchObject({ width: SECTION_SIZE.minWidth, height: SECTION_SIZE.minHeight });
    const cards = [cardAt(300, 300), cardAt(900, 700, 400)];
    const fitted = fitSection(cards)!;
    expect(cards.every((card) => inSection(card, fitted))).toBe(true);
  });
});

describe("planSection", () => {
  const placed = [
    { x: 0, y: 0, width: CARD_WIDTH, height: 180 },
    { x: 560, y: 0, width: CARD_WIDTH, height: 180 },
  ];

  it("gives one card no section, and two a section around them in the next free colour", () => {
    expect(planSection(placed.slice(0, 1), "Outreach", [])).toBeNull();
    expect(planSection([], "Outreach", [])).toBeNull();
    expect(planSection(placed, "Outreach", ["yellow"])).toEqual({ name: "Outreach", color: "green", ...fitSection(placed)! });
  });

  it("cleans the plan's name like a title, and falls back to Section with none", () => {
    expect(planSection(placed, "  Find​  customers\n", [])!.name).toBe("Find customers");
    expect(planSection(placed, "\u0000 ", [])!.name).toBe("Section");
    expect(planSection(placed, "x".repeat(41), [])!.name).toBe(`${"x".repeat(39)}…`);
    expect(sectionName("x".repeat(40))).toBe("x".repeat(40));
  });
});

describe("nextColor", () => {
  it("takes the first colour not used, and goes round once all are", () => {
    expect(nextColor([])).toBe("yellow");
    expect(nextColor(["yellow", "blue"])).toBe("green");
    expect(nextColor(["yellow", "green", "blue", "pink", "purple", "gray"])).toBe("yellow");
    expect(nextColor(["yellow", "green", "blue", "pink", "purple", "gray", "yellow"])).toBe("green");
  });
});

describe("drawing and resizing", () => {
  it("makes a click the usual size, and a short drag at least the smallest size", () => {
    expect(drawnSection({ x: 10, y: 20 }, { x: 15, y: 22 }, 8)).toEqual({ x: 10, y: 20, ...SECTION_DEFAULT });
    expect(drawnSection({ x: 300, y: 300 }, { x: 200, y: 250 }, 8)).toEqual({ x: 200, y: 250, width: SECTION_SIZE.minWidth, height: SECTION_SIZE.minHeight });
    expect(drawnSection({ x: 0, y: 0 }, { x: 800, y: 500 }, 8)).toEqual({ x: 0, y: 0, width: 800, height: 500 });
  });

  it("keeps the opposite corner put and stops at the smallest size", () => {
    const start = { x: 100, y: 100, width: 600, height: 400 };
    expect(resizeSection(start, "bottom-right", 50, 20)).toEqual({ x: 100, y: 100, width: 650, height: 420 });
    expect(resizeSection(start, "top-left", 50, 20)).toEqual({ x: 150, y: 120, width: 550, height: 380 });
    expect(resizeSection(start, "top-left", 1000, 1000)).toEqual({ x: 700 - SECTION_SIZE.minWidth, y: 500 - SECTION_SIZE.minHeight, width: SECTION_SIZE.minWidth, height: SECTION_SIZE.minHeight });
    expect(resizeSection(start, "bottom-left", -10, -1000)).toEqual({ x: 90, y: 100, width: 610, height: SECTION_SIZE.minHeight });
  });
});

describe("nameSize", () => {
  it("is 13px on screen at 100% and closer, and grows zoomed out to 26px at 25%", () => {
    expect(nameSize(1) * 1).toBe(13);
    expect(nameSize(1.5) * 1.5).toBe(13);
    expect(nameSize(0.25) * 0.25).toBe(26);
    expect(nameSize(0.5) * 0.5).toBeGreaterThan(13);
    expect(nameSize(0.5) * 0.5).toBeLessThan(26);
  });
});

describe("sectionNameSize", () => {
  const box = NAME_BOX.inset + NAME_BOX.height;
  const tall = 10_000;
  it("grows as nameSize does while there's room above the highest bird and in the section", () => {
    expect(sectionNameSize(0.5, null, tall)).toBe(nameSize(0.5));
    expect(sectionNameSize(0.5, 1000, tall)).toBe(nameSize(0.5));
    expect(sectionNameSize(1, 60, tall)).toBe(13);
  });

  it("stops where its box, inset included, would reach the highest bird", () => {
    const size = sectionNameSize(0.5, 60, tall);
    expect(size).toBeLessThan(nameSize(0.5));
    expect(size * box).toBeCloseTo(60);
  });

  it("fits its box and an inset under it in the section, the smallest one at the furthest zoom too", () => {
    const size = sectionNameSize(0.25, null, SECTION_SIZE.minHeight);
    expect(size * (box + NAME_BOX.inset)).toBeLessThanOrEqual(SECTION_SIZE.minHeight);
    expect(size * 0.25).toBeGreaterThanOrEqual(13);
  });

  it("is never under 13px on screen, even with no room", () => {
    expect(sectionNameSize(0.25, 60, tall) * 0.25).toBe(13);
    expect(sectionNameSize(0.25, 0, tall) * 0.25).toBe(13);
    expect(sectionNameSize(0.25, -40, tall) * 0.25).toBe(13);
  });
});
