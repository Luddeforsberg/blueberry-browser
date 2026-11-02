import { describe, expect, it } from "vitest";
import { mascotFromSnapshot } from "../main/cloudJobs";
import type { MascotProfile } from "./library";
import { BERRY } from "./mascots";
import { flockFromRows, flockRows, snapshotOf } from "./phone";

const SCOUT: MascotProfile = {
  id: "m-1",
  name: "Scout",
  look: { palette: "robin", accessory: "cap" },
  instructions: "Find cables.",
  sites: ["webhallen.com"],
  tools: ["visit", "click"],
  deletedAt: null,
  galleryId: "g-1",
  publishedId: "p-1",
};

describe("the flock on the phone", () => {
  it("shares every bird but Berry and the deleted ones, with nothing beyond its name, look and limits", () => {
    const rows = flockRows([BERRY, SCOUT, { ...SCOUT, id: "m-2", deletedAt: 1 }]);
    expect(rows).toEqual([{ id: "m-1", name: "Scout", palette: "robin", accessory: "cap", instructions: "Find cables.", sites: ["webhallen.com"], tools: ["visit", "click"], from_gallery: true }]);
    expect(flockRows([])).toEqual([]);
  });

  it("reads back what it shared, with Berry first, and sends a snapshot the runner accepts", () => {
    const birds = flockFromRows(flockRows([BERRY, SCOUT]));
    expect(birds.map(({ id }) => id)).toEqual(["berry", "m-1"]);
    expect(mascotFromSnapshot(snapshotOf(birds[0]))).toEqual(BERRY);
    expect(mascotFromSnapshot(snapshotOf(birds[1]))).toMatchObject({ id: "m-1", sites: ["webhallen.com"], tools: ["visit", "click"], galleryId: "gallery" });
  });

  it("leaves out a row the app couldn't have made, and only ever has one Berry", () => {
    const [row] = flockRows([SCOUT]);
    const birds = flockFromRows([
      { ...row, id: "berry" },
      { ...row, id: "bad id!" },
      { ...row, sites: ["not a site"] },
      { ...row, palette: "red" },
      { ...row, name: "" },
      row,
      row,
      null,
    ]);
    expect(birds.map(({ id }) => id)).toEqual(["berry", "m-1"]);
    expect(flockFromRows(undefined)).toEqual([BERRY]);
    // A tool it doesn't know is dropped, so the bird can only do less.
    expect(flockFromRows([{ ...row, tools: ["visit", "pay"] }])[1].tools).toEqual(["visit"]);
  });
});
