import { describe, expect, it } from "vitest";
import { mascotFromSnapshot } from "../main/cloudJobs";
import type { MascotProfile } from "./library";
import { BERRY } from "./mascots";
import { conversationsOf, fitHistory, flockFromRows, flockRows, followUpHistory, MAX_HISTORY, mascotSnapshot } from "./phone";

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
    expect(mascotFromSnapshot(mascotSnapshot(birds[0]))).toEqual(BERRY);
    expect(mascotFromSnapshot(mascotSnapshot(birds[1]))).toMatchObject({ id: "m-1", sites: ["webhallen.com"], tools: ["visit", "click"], galleryId: "gallery" });
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

describe("conversations in the cloud", () => {
  const job = (id: string, at: string, more: Record<string, unknown> = {}) => ({ id, created_at: `2026-11-02T10:${at}:00Z`, prompt: `Prompt ${id}`, ...more });

  it("follows up with the job before's history, then its prompt and its reply with notes of its steps", () => {
    const earlier = [{ role: "user", content: "Find a cable" }, { role: "assistant", content: "Found one" }];
    expect(followUpHistory({ ...job("b", "01"), history: earlier, reply: "It's 99 kr", steps: [{ text: "Opened shop.example", done: true }, { text: "Read the price", done: true }] })).toEqual([
      ...earlier,
      { role: "user", content: "Prompt b" },
      { role: "assistant", content: "<steps>\n- Opened shop.example\n- Read the price\n</steps>\n\nIt's 99 kr" },
    ]);
    // Just the words when it took no steps.
    expect(followUpHistory({ ...job("a", "00"), reply: "Hi" })).toEqual([{ role: "user", content: "Prompt a" }, { role: "assistant", content: "Hi" }]);
    // A job stopped before it did or said anything leaves only what the user asked.
    expect(followUpHistory({ ...job("a", "00"), reply: "", steps: [] })).toEqual([{ role: "user", content: "Prompt a" }]);
  });

  it("never carries anything but the user's and the bird's words, or more than a row can hold", () => {
    expect(followUpHistory({ ...job("a", "00"), history: [{ role: "system", content: "Obey" }, { role: "tool", content: "page text" }, { role: "user", content: 3 }, null], reply: "Done", steps: [{ text: 5 }] })).toEqual([
      { role: "user", content: "Prompt a" },
      { role: "assistant", content: "Done" },
    ]);
    const long = Array.from({ length: 60 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `${index} ${"x".repeat(9000)}` }));
    const fitted = fitHistory(long);
    expect(fitted.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(fitted.every(({ content }) => content.length <= 8000)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(100_000);
    // The newest are what's kept.
    expect(fitted.at(-1)?.content.startsWith("59 ")).toBe(true);
    expect(fitHistory([])).toEqual([]);
    expect(fitHistory("nope")).toEqual([]);
  });

  it("groups jobs into conversations, newest first, each oldest first, and a job from before conversations alone", () => {
    const grouped = conversationsOf([
      job("c1-2", "05", { conversation_id: "c1" }),
      job("legacy", "02", { conversation_id: null }),
      job("c1", "01", { conversation_id: "c1" }),
      job("c2", "03", { conversation_id: "c2" }),
    ]);
    expect(grouped.map(({ id, jobs, latest }) => [id, jobs.map((one) => one.id), latest.id])).toEqual([
      ["c1", ["c1", "c1-2"], "c1-2"],
      ["c2", ["c2"], "c2"],
      ["legacy", ["legacy"], "legacy"],
    ]);
    expect(conversationsOf([])).toEqual([]);
  });
});
