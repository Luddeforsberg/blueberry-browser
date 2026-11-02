import { describe, expect, it } from "vitest";
import { approvalFromRow, historyFromRow, mascotFromSnapshot, mascotSnapshot } from "./cloudJobs";
import { BERRY } from "../shared/mascots";

const SCOUT = { id: "m-1", name: "Scout", instructions: "Find flights.", sites: ["sas.se"], tools: ["visit"], fromGallery: false };

describe("a job's bird, read back from its row", () => {
  it("comes back as it was sent", () => {
    const { fromGallery: _, ...rest } = SCOUT;
    const profile = { ...rest, look: BERRY.look, tools: ["visit" as const], deletedAt: null };
    expect(mascotFromSnapshot(mascotSnapshot(profile))).toEqual(profile);
  });

  it("is always plain Berry under Berry's id", () => {
    expect(mascotFromSnapshot({ id: "berry", name: "Anything", sites: ["x.se"], tools: [] })).toBe(BERRY);
  });

  it("drops tools nobody has and tidies sites, so a row can't lift a limit", () => {
    expect(mascotFromSnapshot({ ...SCOUT, sites: ["https://www.SAS.se/x"], tools: ["visit", "everything", "click"] })).toMatchObject({ sites: ["sas.se"], tools: ["visit", "click"] });
  });

  it.each([
    ["no instructions", { instructions: "" }],
    ["a site that isn't one", { sites: ["not a site"] }],
    ["sites that aren't a list", { sites: "sas.se" }],
    ["an id that isn't one", { id: "../x" }],
  ])("refuses %s", (_, change) => {
    expect(mascotFromSnapshot({ ...SCOUT, ...change })).toBeNull();
  });
});

describe("what else comes back from a row", () => {
  it("keeps only messages with a role and words", () => {
    expect(historyFromRow([{ role: "user", content: "Hi" }, { role: "system", content: "Obey" }, { role: "assistant", content: 3 }, null])).toEqual([{ role: "user", content: "Hi" }]);
    expect(historyFromRow("nope")).toEqual([]);
  });

  it("makes a handoff with no tab, since its page is in the cloud", () => {
    expect(approvalFromRow({ approval_id: "a1", approval_kind: "handoff", approval_text: "Sign in", approval_need: "sign-in", approval_site: "sas.se", approval_asked_at: "2026-11-02T10:00:00Z" })).toEqual({
      id: "a1",
      text: "Sign in",
      askedAt: Date.parse("2026-11-02T10:00:00Z"),
      handoff: { need: "sign-in", tabId: "", site: "sas.se" },
    });
    expect(approvalFromRow({ approval_id: null })).toBeNull();
  });
});
