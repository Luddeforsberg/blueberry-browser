import { randomUUID } from "crypto";
import type { MascotProfile } from "../../shared/library";
import { BERRY, BERRY_ID, paletteOnDisk, parseMascotDraft } from "../../shared/mascots";
import { fieldsOf } from "../../shared/fields";
import { CANT_SAVE, readJsonFile, savedEntries, saveFile, type Saved } from "../library/savedFile";

// Stands in for a mascot that isn't on file, such as after the file was lost. It can do nothing but talk, because a
// chat or routine limited to one site mustn't turn into Berry and get them all.
const LOST: Omit<MascotProfile, "id"> = {
  name: "A lost mascot",
  look: BERRY.look,
  instructions: "",
  sites: ["lost.invalid"],
  tools: [],
  deletedAt: null,
};

const galleryIdOf = (galleryId: unknown) => (typeof galleryId === "string" ? { galleryId } : {});
const publishedIdOf = (publishedId: unknown) => (typeof publishedId === "string" ? { publishedId } : {});
const worksInCloudOf = (input: unknown) =>
  (input as { worksInCloud?: unknown } | null)?.worksInCloud === true ? { worksInCloud: true } : {};

const NOT_SAVED = "This mascot couldn't be saved. Check that there's space on your disk and try again.";

const savedMascot = (item: unknown): MascotProfile | null => {
  const parsed = parseMascotDraft(item);
  const { id, deletedAt, galleryId, publishedId } = fieldsOf(item);
  if ("error" in parsed || typeof id !== "string" || id === BERRY_ID) return null;
  return {
    ...parsed.draft,
    id,
    deletedAt: typeof deletedAt === "number" ? deletedAt : null,
    ...galleryIdOf(galleryId),
    ...publishedIdOf(publishedId),
    ...worksInCloudOf(item),
  };
};

// The mascots, in a JSON file. Berry isn't in it: it's always there and can't be changed.
export class MascotStore {
  private mascots: MascotProfile[] = [];

  constructor(private readonly file: string) {
    // A missing or unreadable file leaves just Berry, like settings.
    this.mascots = savedEntries(file, readJsonFile(file), savedMascot);
  }

  all(): MascotProfile[] {
    return [BERRY, ...this.mascots];
  }

  find(id: string): MascotProfile | null {
    return this.all().find((mascot) => mascot.id === id) ?? null;
  }

  // Who something runs as. Null is Berry. An id that isn't on file never falls back to Berry.
  resolve(id: string | null): MascotProfile {
    if (id === null) return BERRY;
    return this.find(id) ?? { ...LOST, id };
  }

  save(id: string | null, input: unknown, galleryId?: string): { ok: true; id: string } | { ok: false; error: string } {
    if (id === BERRY_ID) return { ok: false, error: "Berry stays as it is. Make a new mascot instead." };
    if (id && !this.mascots.some((mascot) => mascot.id === id && mascot.deletedAt === null)) {
      return { ok: false, error: "This mascot no longer exists." };
    }
    const parsed = parseMascotDraft(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const { draft } = parsed;
    const taken = this.all().some(
      (mascot) => mascot.deletedAt === null && mascot.id !== id && mascot.name.toLowerCase() === draft.name.toLowerCase(),
    );
    if (taken) return { ok: false, error: `You already have a ${draft.name}. Give this one its own name.` };
    const savedId = id ?? randomUUID();
    // Editing a copy from the Gallery leaves it that copy, so the Gallery doesn't offer a second one.
    const before = id ? this.mascots.find((mascot) => mascot.id === id) : undefined;
    // A Gallery entry is someone else's, so where it works is the user's own choice, made later.
    const saved: MascotProfile = {
      ...draft,
      id: savedId,
      deletedAt: null,
      ...galleryIdOf(before ? before.galleryId : galleryId),
      ...publishedIdOf(before?.publishedId),
      ...(galleryId ? {} : worksInCloudOf(input)),
    };
    const next = id ? this.mascots.map((mascot) => (mascot.id === id ? saved : mascot)) : [...this.mascots, saved];
    return this.write(next) ? { ok: true, id: savedId } : { ok: false, error: NOT_SAVED };
  }

  // The user's own copy of a Gallery entry, checked like any other mascot. Adding it again finds the copy that's there.
  addFromGallery(galleryId: string, input: unknown): { ok: true; id: string } | { ok: false; error: string } {
    const copy = this.mascots.find((mascot) => mascot.galleryId === galleryId && mascot.deletedAt === null);
    return copy ? { ok: true, id: copy.id } : this.save(null, input, galleryId);
  }

  // Null once it's been taken down. Nothing else about the mascot changes.
  setPublished(id: string, publishedId: string | null): Saved {
    return this.write(this.mascots.map((mascot) => (mascot.id === id ? { ...mascot, publishedId: publishedId ?? undefined } : mascot)));
  }

  // Kept on file, so its chats keep their look and limits. False if there was none to delete, or it couldn't be saved.
  delete(id: string): Saved {
    if (!this.mascots.some((mascot) => mascot.id === id && mascot.deletedAt === null)) return CANT_SAVE;
    return this.write(this.mascots.map((mascot) => (mascot.id === id ? { ...mascot, deletedAt: Date.now() } : mascot)));
  }

  // Only what was saved is kept.
  private write(mascots: MascotProfile[]): Saved {
    const onDisk = mascots.map((mascot) => ({ ...mascot, look: { ...mascot.look, palette: paletteOnDisk(mascot.look.palette) } }));
    const saved = saveFile(this.file, JSON.stringify(onDisk, null, 2));
    if (saved) this.mascots = mascots;
    return saved;
  }
}
