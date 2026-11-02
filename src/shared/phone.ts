import type { MascotProfile } from "./library";
import { BERRY, BERRY_ID, parseMascotDraft } from "./mascots";

// The flock on its way to the phone and back. The app shares each bird's name, look and limits, never what it remembers,
// and the phone sends a job as one of them with the same snapshot the app would. Plain data, used by the app and, bundled
// into site/shared.js, by the phone page, so both read a row the same way.

export const MAX_SHARED_BIRDS = 100;

export interface FlockRow {
  id: string;
  name: string;
  palette: string;
  accessory: string;
  instructions: string;
  sites: string[];
  tools: string[];
  from_gallery: boolean;
}

// What the app shares: every bird but Berry, which the phone always has, and none that's been deleted.
export const flockRows = (mascots: readonly MascotProfile[]): FlockRow[] =>
  mascots
    .filter((mascot) => mascot.id !== BERRY_ID && mascot.deletedAt === null)
    .slice(0, MAX_SHARED_BIRDS)
    .map(({ id, name, look, instructions, sites, tools, galleryId }) => ({
      id,
      name,
      palette: look.palette,
      accessory: look.accessory,
      instructions,
      sites: [...sites],
      tools: [...tools],
      from_gallery: !!galleryId,
    }));

// What the phone reads back: Berry first, then each row that passes the same checks as a mascot made in the app. Anything
// else is left out, so a bird can only be sent as what the app would have sent.
export const flockFromRows = (rows: unknown): MascotProfile[] => {
  const birds: MascotProfile[] = [BERRY];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { id, name, palette, accessory, instructions, sites, tools, from_gallery: fromGallery } = (row ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id) || id === BERRY_ID || birds.some((bird) => bird.id === id)) continue;
    const parsed = parseMascotDraft({ name, look: { palette, accessory }, instructions, sites, tools });
    if ("error" in parsed) continue;
    birds.push({ ...parsed.draft, id, deletedAt: null, ...(fromGallery === true ? { galleryId: "gallery" } : {}) });
  }
  return birds;
};

// The bird a job is sent as, in the shape the app sends and `mascotFromSnapshot` checks on the runner.
export const snapshotOf = ({ id, name, instructions, sites, tools, galleryId }: MascotProfile) => ({
  id,
  name,
  instructions,
  sites: [...sites],
  tools: [...tools],
  fromGallery: !!galleryId,
});
