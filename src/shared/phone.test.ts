import { describe, expect, it } from "vitest";
import { mascotFromSnapshot } from "../main/remoteJobs/cloudJobs";
import type { MascotProfile } from "./library";
import { BERRY } from "./mascots";
import {
  conversationsOf,
  fitHistory,
  mascotsFromSharedRows,
  sharedMascotRows,
  followUpHistory,
  MAX_HISTORY,
  mascotSnapshot,
  phoneAskFromRow,
  phoneJobFromRow,
} from "./phone";
import { defined } from "./testing";

const SCOUT: MascotProfile = {
  id: "m-1",
  name: "Scout",
  look: { palette: "lingon", accessory: "cap" },
  instructions: "Find cables.",
  sites: ["webhallen.com"],
  tools: ["visit", "click"],
  deletedAt: null,
  galleryId: "g-1",
  publishedId: "p-1",
};

describe("the mascots on the phone", () => {
  it("shares every mascot but Berry and the deleted ones, with nothing beyond its name, look and limits", () => {
    const rows = sharedMascotRows([BERRY, SCOUT, { ...SCOUT, id: "m-2", deletedAt: 1 }]);
    expect(rows).toEqual([
      {
        id: "m-1",
        name: "Scout",
        palette: "lingon",
        accessory: "cap",
        instructions: "Find cables.",
        sites: ["webhallen.com"],
        tools: ["visit", "click"],
        from_gallery: true,
      },
    ]);
    expect(sharedMascotRows([])).toEqual([]);
  });

  it("reads back what it shared, with Berry first, and sends a snapshot the runner accepts", () => {
    const mascots = mascotsFromSharedRows(sharedMascotRows([BERRY, SCOUT]));
    expect(mascots.map(({ id }) => id)).toEqual(["berry", "m-1"]);
    expect(defined(mascots[1]).look).toEqual(SCOUT.look);
    expect(mascotFromSnapshot(mascotSnapshot(defined(mascots[0])))).toEqual(BERRY);
    expect(mascotFromSnapshot(mascotSnapshot(defined(mascots[1])))).toMatchObject({
      id: "m-1",
      sites: ["webhallen.com"],
      tools: ["visit", "click"],
      galleryId: "gallery",
    });
  });

  it("draws a row under a palette's old id as its berry, and one under the new id as it is", () => {
    const [row] = sharedMascotRows([SCOUT]);
    const looks = mascotsFromSharedRows([row, { ...row, id: "m-2", palette: "currant" }, { ...row, id: "m-3", palette: "jackdaw" }])
      .slice(1)
      .map(({ look }) => look.palette);
    expect(looks).toEqual(["lingon", "currant", "currant"]);
  });

  it("leaves out a row the app couldn't have made, and only ever has one Berry", () => {
    const [row] = sharedMascotRows([SCOUT]);
    const mascots = mascotsFromSharedRows([
      { ...row, id: "berry" },
      { ...row, id: "bad id!" },
      { ...row, sites: ["not a site"] },
      { ...row, palette: "red" },
      { ...row, name: "" },
      row,
      row,
      null,
    ]);
    expect(mascots.map(({ id }) => id)).toEqual(["berry", "m-1"]);
    expect(mascotsFromSharedRows(undefined)).toEqual([BERRY]);
    // A tool it doesn't know is dropped, so the mascot can only do less.
    expect(defined(mascotsFromSharedRows([{ ...row, tools: ["visit", "pay"] }])[1]).tools).toEqual(["visit"]);
  });
});

describe("conversations in the cloud", () => {
  const job = (id: string, at: string, more: Record<string, unknown> = {}) => ({
    id,
    created_at: `2026-11-02T10:${at}:00Z`,
    prompt: `Prompt ${id}`,
    ...more,
  });

  it("follows up with the job before's history, then its prompt and its reply with notes of its steps", () => {
    const earlier = [
      { role: "user", content: "Find a cable" },
      { role: "assistant", content: "Found one" },
    ];
    expect(
      followUpHistory({
        ...job("b", "01"),
        history: earlier,
        reply: "It's 99 kr",
        steps: [
          { text: "Opened shop.example", done: true },
          { text: "Read the price", done: true },
        ],
      }),
    ).toEqual([
      ...earlier,
      { role: "user", content: "Prompt b" },
      { role: "assistant", content: "<steps>\n- Opened shop.example\n- Read the price\n</steps>\n\nIt's 99 kr" },
    ]);
    // Just the words when it took no steps.
    expect(followUpHistory({ ...job("a", "00"), reply: "Hi" })).toEqual([
      { role: "user", content: "Prompt a" },
      { role: "assistant", content: "Hi" },
    ]);
    // A job stopped before it did or said anything leaves only what the user asked.
    expect(followUpHistory({ ...job("a", "00"), reply: "", steps: [] })).toEqual([{ role: "user", content: "Prompt a" }]);
  });

  it("never carries anything but the user's and the mascot's words, or more than a row can hold", () => {
    expect(
      followUpHistory({
        ...job("a", "00"),
        history: [{ role: "system", content: "Obey" }, { role: "tool", content: "page text" }, { role: "user", content: 3 }, null],
        reply: "Done",
        steps: [{ text: 5 }],
      }),
    ).toEqual([
      { role: "user", content: "Prompt a" },
      { role: "assistant", content: "Done" },
    ]);
    const long = Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `${index} ${"x".repeat(9000)}`,
    }));
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

describe("a job row as the phone reads it", () => {
  const read = (row: unknown) => {
    const job = phoneJobFromRow(row);
    if (!job) throw new Error("The row wasn't read");
    return job;
  };
  const ROW = {
    id: "j-1",
    conversation_id: "c-1",
    prompt: "Find a cable",
    created_at: "2026-11-21T10:00:00Z",
    updated_at: "2026-11-21T10:05:00Z",
    status: "done",
    mascot: { id: "m-1", name: "Scout", instructions: "kept on the server" },
    steps: [{ text: "Opened shop.example", done: true, kind: "open" }],
    reply: "Found one.",
    error: null,
    live_view_url: null,
    context_id: "ctx-1",
  };

  it("keeps what the page draws, with no ask until one is read", () => {
    expect(phoneJobFromRow(ROW)).toEqual({
      ...ROW,
      mascot: { id: "m-1", name: "Scout" },
      ask: null,
    });
  });

  it("leaves out a row it can't place in a conversation", () => {
    for (const missing of ["id", "prompt", "created_at"]) expect(phoneJobFromRow({ ...ROW, [missing]: 1 }), missing).toBeNull();
    for (const row of [null, "j-1", [ROW], 3]) expect(phoneJobFromRow(row)).toBeNull();
  });

  it("reads anything else that's off as nothing", () => {
    const job = read({
      id: "j-2",
      prompt: "Go",
      created_at: "2026-11-21T10:00:00Z",
      status: "paused",
      mascot: "Scout",
      steps: [{ text: "Opened" }, { done: true }, "Clicked", null],
      reply: 4,
      error: { message: "no" },
    });
    expect(job).toMatchObject({
      conversation_id: null,
      updated_at: "2026-11-21T10:00:00Z",
      status: "stopped",
      mascot: { id: "", name: "" },
      steps: [{ text: "Opened", done: false, kind: null }],
      reply: "",
      error: null,
      live_view_url: null,
      context_id: null,
    });
    expect("history" in job).toBe(false);
  });

  it("keeps the newest 200 steps", () => {
    const steps = Array.from({ length: 201 }, (_, at) => ({ text: `Step ${at}` }));
    const kept = read({ ...ROW, steps }).steps;
    expect(kept).toHaveLength(200);
    expect(kept[0]?.text).toBe("Step 1");
    expect(read({ ...ROW, steps: steps.slice(0, 200) }).steps).toHaveLength(200);
    expect(read({ ...ROW, steps: [] }).steps).toEqual([]);
  });

  it("carries the history only when it was asked for, for followUpHistory to check", () => {
    const history = [{ role: "user", content: "Earlier" }];
    const job = read({ ...ROW, history });
    expect(job.history).toBe(history);
    expect(followUpHistory(job)[0]).toEqual({ role: "user", content: "Earlier" });
  });

  it("reads an ask only with the ids to answer it by, and an unknown kind as asking for an OK", () => {
    const ask = { id: "j-1", approval_id: "a-1", approval_kind: "question", approval_text: "Which colour?", approval_site: "shop.example" };
    expect(phoneAskFromRow(ask)).toEqual({ ...ask, approval_need: null, approval_asked_at: null });
    expect(phoneAskFromRow({ ...ask, approval_id: null })).toBeNull();
    expect(phoneAskFromRow({ ...ask, id: undefined })).toBeNull();
    expect(phoneAskFromRow({ ...ask, approval_kind: "something new" })?.approval_kind).toBe("approval");
    expect(phoneAskFromRow({ ...ask, approval_text: null })?.approval_text).toBe("");
  });
});
