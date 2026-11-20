import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { Settings } from "../shared/ipc";
import { BERRY } from "../shared/mascots";
import { MascotStore } from "./MascotStore";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./SettingsStore";
import { addStarterFlock, STARTER_FLOCK } from "./starterFlock";

const store = () => new MascotStore(join(mkdtempSync(join(tmpdir(), "blueberry-starters-")), "mascots.json"));
const settingsOf = (start: Partial<Settings> = {}) => {
  let settings = { ...DEFAULT_SETTINGS, ...start };
  return {
    get: () => settings,
    update: (patch: Partial<Settings>) => (settings = sanitizeSettings({ ...settings, ...patch }, settings)),
  };
};
const names = (mascots: MascotStore) => mascots.all().filter((mascot) => mascot.deletedAt === null).map(({ name }) => name);

describe("addStarterFlock", () => {
  it("gives a profile with only Berry four mascots of other berries, as Gallery copies, and marks it done", () => {
    const mascots = store();
    const settings = settingsOf();
    addStarterFlock(mascots, settings);
    expect(names(mascots)).toEqual(["Berry", "Plain Words", "Competitor Watch", "Meeting Prep", "Newsletter Builder"]);
    const starters = mascots.all().slice(1);
    expect(starters.map(({ galleryId }) => galleryId)).toEqual([...STARTER_FLOCK]);
    expect(new Set(starters.map(({ look }) => look.palette))).toEqual(new Set(["canary", "jackdaw", "robin", "flamingo"]));
    expect(settings.get().startersAdded).toBe(true);
  });

  it("gives them nothing Berry can't do", () => {
    const mascots = store();
    addStarterFlock(mascots, settingsOf());
    for (const starter of mascots.all().slice(1)) {
      expect(starter.tools.every((tool) => BERRY.tools.includes(tool))).toBe(true);
      expect(starter.worksInCloud).toBeUndefined();
    }
  });

  it("happens once: deleting them, or every mascot, never brings them back", () => {
    const mascots = store();
    const settings = settingsOf();
    addStarterFlock(mascots, settings);
    for (const starter of mascots.all().slice(1)) mascots.delete(starter.id);
    addStarterFlock(mascots, settings);
    expect(names(mascots)).toEqual(["Berry"]);
  });

  it("adds nothing to a profile with mascots of its own, and marks it done", () => {
    const mascots = store();
    mascots.save(null, { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "News.", sites: ["svt.se"], tools: ["visit"] });
    const settings = settingsOf();
    addStarterFlock(mascots, settings);
    expect(names(mascots)).toEqual(["Berry", "Scout"]);
    expect(settings.get().startersAdded).toBe(true);
  });

  it("adds nothing once marked done, even with only Berry", () => {
    const mascots = store();
    addStarterFlock(mascots, settingsOf({ startersAdded: true }));
    expect(names(mascots)).toEqual(["Berry"]);
  });

  it("counts a flock whose own mascots were all deleted as only Berry", () => {
    const mascots = store();
    const saved = mascots.save(null, { name: "Plain Words", look: { palette: "canary", accessory: "bow" }, instructions: "Mine.", sites: [], tools: [] });
    if (!saved.ok) throw new Error(saved.error);
    mascots.delete(saved.id);
    addStarterFlock(mascots, settingsOf());
    expect(names(mascots)).toEqual(["Berry", "Plain Words", "Competitor Watch", "Meeting Prep", "Newsletter Builder"]);
  });
});
