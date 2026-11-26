// Dev only, and nothing in the app can reach it. Fills a new profile folder with two weeks of the founder in founder.ts:
// visits, bookmarks, open tabs, mascots, what they remember and routines, written through the app's own stores. It
// refuses a folder that isn't empty, so it can't touch real data by accident. See evals/README.md.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BookmarkStore } from "../../src/main/library/BookmarkStore";
import { HistoryStore } from "../../src/main/library/HistoryStore";
import { saveFile } from "../../src/main/library/savedFile";
import { starterMascots } from "../../src/main/mascots/mascotCatalog";
import { MascotStore } from "../../src/main/mascots/MascotStore";
import { MemoryStore } from "../../src/main/memory/MemoryStore";
import { RoutineStore } from "../../src/main/routines/RoutineStore";
import { nextRun } from "../../src/main/routines/routineSchedule";
import { SettingsStore } from "../../src/main/settings/SettingsStore";
import { SessionStore } from "../../src/main/tabs/Session";
import type { MemoryFact } from "../../src/shared/library";
import { factProblem } from "../../src/shared/memory";
import { missing } from "../../src/shared/missing";
import { BOOKMARKS, FACTS, founderVisits, INVESTOR_UPDATE, OPEN_TABS, pinned, ROUTINES, STARTERS } from "./founder";

const saved = (result: { ok: true; id: string } | { ok: false; error: string }): string => {
  if (!result.ok) throw new Error(result.error);
  return result.id;
};

const seedMascots = (folder: string): Map<string, string> => {
  const mascots = new MascotStore(join(folder, "mascots.json"));
  const catalog = starterMascots();
  for (const id of STARTERS) {
    const entry = catalog.find((candidate) => candidate.id === id) ?? missing(`starter ${id}`);
    saved(mascots.addFromGallery(entry.id, entry.draft, entry.description));
  }
  saved(mascots.save(null, INVESTOR_UPDATE));
  return new Map(mascots.all().map(({ name, id }) => [name, id]));
};

// A fact only reaches memory.json in the app when the user presses Remember, so these go through the same check and are
// read back through the store, which drops anything it wouldn't keep.
const seedFacts = (folder: string, ids: Map<string, string>, now: number): void => {
  const file = join(folder, "memory.json");
  const facts: MemoryFact[] = Object.entries(FACTS).flatMap(([name, texts]) =>
    texts.map((text) => {
      const problem = factProblem(text, null);
      if (problem) throw new Error(`${text}: ${problem}`);
      return { id: randomUUID(), mascotId: ids.get(name) ?? missing(name), text, site: null, savedAt: now };
    }),
  );
  if (!saveFile(file, JSON.stringify(facts, null, 2))) throw new Error("memory.json wasn't saved");
  const store = new MemoryStore(file, {
    onChanged: () => {},
    enabled: () => true,
    hasModel: () => false,
    write: async () => "",
    isClean: () => true,
  });
  const kept = [...ids.values()].flatMap((id) => store.factsOf(id)).length;
  if (kept !== facts.length) throw new Error(`Only ${kept} of ${facts.length} facts were kept`);
};

const seedRoutines = (folder: string, ids: Map<string, string>, now: number): void => {
  const routines = new RoutineStore(join(folder, "routines.db"));
  for (const { mascot, ...draft } of ROUTINES) {
    routines.create({ ...draft, mascotId: mascot ? (ids.get(mascot) ?? missing(mascot)) : null }, nextRun(draft.schedule, now));
  }
};

const seedTabs = (folder: string, now: number): void => {
  const bookmarks = new BookmarkStore(folder);
  for (const [url, title, favicon] of pinned(now)) bookmarks.add("favourites", url, title, favicon);
  for (const [url, title] of BOOKMARKS) bookmarks.add("bookmarks", url, title);
  const session = new SessionStore(join(folder, "session.json"));
  // A new tab in front, since Playwright's launch never finishes while a restored web page loads in front.
  session.saveSoon(() => ({
    tabs: [
      ...OPEN_TABS.map(([url, title]) => ({ url, title, favicon: null, entries: [{ url, title }], index: 0 })),
      { page: "new-tab" as const, param: null, title: "New tab" },
    ],
    active: OPEN_TABS.length,
    sidebarOpen: true,
    chatOpen: false,
    width: 0,
    height: 0,
  }));
  session.flush();
};

export const seedFounder = (folder: string, now = Date.now()): void => {
  if (existsSync(folder) && readdirSync(folder).length) throw new Error(`${folder} isn't empty. Name a new folder.`);
  mkdirSync(folder, { recursive: true });
  new HistoryStore(join(folder, "history.db")).importVisits(founderVisits(now));
  const ids = seedMascots(folder);
  seedFacts(folder, ids, now);
  seedRoutines(folder, ids, now);
  seedTabs(folder, now);
  const settings = new SettingsStore(join(folder, "settings.json"));
  settings.update({ onboarded: true, startersAdded: true });
  settings.flush();
};

if (process.argv[1]?.endsWith("seedFounder.ts")) {
  const folder = process.argv[2];
  if (!folder) throw new Error("Name a new profile folder: pnpm dlx tsx evals/pictures/seedFounder.ts /tmp/blueberry-founder");
  seedFounder(folder);
  console.log(`Seeded ${folder}`);
}
