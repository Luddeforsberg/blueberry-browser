import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MascotStore } from "./MascotStore";
import { BERRY, BERRY_ID } from "../shared/mascots";

const file = () => join(mkdtempSync(join(tmpdir(), "blueberry-mascots-")), "mascots.json");
const draft = { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read things.", sites: ["https://www.GitHub.com/x"], tools: ["visit"] };

describe("MascotStore", () => {
  it("always has Berry, which can't be changed or deleted", () => {
    const store = new MascotStore(file());
    expect(store.all()).toEqual([BERRY]);
    expect(store.save(BERRY_ID, draft).ok).toBe(false);
    expect(store.delete(BERRY_ID)).toBe(false);
    expect(store.resolve(null)).toBe(BERRY);
  });

  it("never turns something it can't find, or something deleted, into Berry", () => {
    const store = new MascotStore(file());
    const lost = store.resolve("gone");
    expect(lost.tools).toEqual([]);
    expect(lost.sites.length).toBeGreaterThan(0);

    const saved = store.save(null, draft);
    if (!saved.ok) throw new Error(saved.error);
    expect(store.delete(saved.id)).toBe(true);
    expect(store.resolve(saved.id).sites).toEqual(["github.com"]);
  });

  it("keeps only what it knows, from the renderer or the file", () => {
    const path = file();
    const saved = new MascotStore(path).save(null, { ...draft, skipApprovals: true, tools: ["visit", "everything"] });
    if (!saved.ok) throw new Error(saved.error);
    const [mascot] = new MascotStore(path).all().slice(1);
    expect(mascot).toEqual({ ...draft, sites: ["github.com"], id: saved.id, deletedAt: null });

    writeFileSync(path, JSON.stringify([{ ...draft, id: BERRY_ID }, { ...draft, id: "bad", sites: ["not a site"] }]));
    expect(new MascotStore(path).all()).toEqual([BERRY]);
  });

  it.each([
    ["", false],
    ["a".repeat(24), true],
    ["a".repeat(25), false],
  ])("takes the name %j: %s", (name, ok) => {
    expect(new MascotStore(file()).save(null, { ...draft, name }).ok).toBe(ok);
  });

  it("rejects a bare top-level name or a site it can't read, which would widen the limit or lose it", () => {
    for (const site of ["com", "not a site", "file:///x"]) {
      expect(new MascotStore(file()).save(null, { ...draft, sites: [site] }).ok).toBe(false);
    }
  });
});
