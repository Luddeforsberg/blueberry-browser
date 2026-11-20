import { describe, expect, it } from "vitest";
import { ACTOR_ART, type ArtNode } from "./pageActorArt";
import { artFor } from "./pageActorScript";
import { defined } from "../../shared/testing";

const berriesIn = (node: ArtNode): string[] => [
  ...new Set([...JSON.stringify(node).matchAll(/"data-berry":"([a-z]+)"/g)].map(([, berry]) => defined(berry))),
];

describe("artFor", () => {
  it("keeps only the berry the palette draws as, with its own clip", () => {
    const art = artFor(defined(ACTOR_ART.glasses?.looking), "raspberry");
    expect(berriesIn(art)).toEqual(["raspberry"]);
    expect(JSON.stringify(art)).toContain("clip-raspberry");
    expect(JSON.stringify(art)).not.toContain("clip-blueberry");
  });

  it("keeps every berry for a palette it doesn't know", () => {
    expect(berriesIn(artFor(defined(ACTOR_ART.none?.rest), "unknown")).length).toBe(6);
  });
});
