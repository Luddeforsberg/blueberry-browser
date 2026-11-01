import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { MascotProfile } from "../shared/library";
import { BERRY, BERRY_ID, parseMascotDraft } from "../shared/mascots";

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

// The flock, in a JSON file. Berry isn't in it: it's always there and can't be changed.
export class MascotStore {
  private mascots: MascotProfile[] = [];

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        this.mascots = raw.flatMap((item: Partial<MascotProfile> | null) => {
          const parsed = parseMascotDraft(item);
          if ("error" in parsed || typeof item?.id !== "string" || item.id === BERRY_ID) return [];
          return [{ ...parsed.draft, id: item.id, deletedAt: typeof item.deletedAt === "number" ? item.deletedAt : null, ...galleryIdOf(item.galleryId), ...publishedIdOf(item.publishedId) }];
        });
      }
    } catch {
      // A missing or unreadable file leaves just Berry, like settings.
    }
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
    const taken = this.all().some((mascot) => mascot.deletedAt === null && mascot.id !== id && mascot.name.toLowerCase() === draft.name.toLowerCase());
    if (taken) return { ok: false, error: `You already have a ${draft.name}. Give this one its own name.` };
    const savedId = id ?? randomUUID();
    // Editing a copy from the Gallery leaves it that copy, so the Gallery doesn't offer a second one.
    const before = id ? this.mascots.find((mascot) => mascot.id === id) : undefined;
    const saved: MascotProfile = { ...draft, id: savedId, deletedAt: null, ...galleryIdOf(before ? before.galleryId : galleryId), ...publishedIdOf(before?.publishedId) };
    this.write(id ? this.mascots.map((mascot) => (mascot.id === id ? saved : mascot)) : [...this.mascots, saved]);
    return { ok: true, id: savedId };
  }

  // The user's own copy of a Gallery entry, checked like any other mascot. Adding it again finds the copy that's there.
  addFromGallery(galleryId: string, input: unknown): { ok: true; id: string } | { ok: false; error: string } {
    const copy = this.mascots.find((mascot) => mascot.galleryId === galleryId && mascot.deletedAt === null);
    return copy ? { ok: true, id: copy.id } : this.save(null, input, galleryId);
  }

  // Null once it's been taken down. Nothing else about the mascot changes.
  setPublished(id: string, publishedId: string | null): void {
    this.write(this.mascots.map((mascot) => (mascot.id === id ? { ...mascot, publishedId: publishedId ?? undefined } : mascot)));
  }

  // Kept on file, so its chats keep their look and limits.
  delete(id: string): boolean {
    if (!this.mascots.some((mascot) => mascot.id === id && mascot.deletedAt === null)) return false;
    this.write(this.mascots.map((mascot) => (mascot.id === id ? { ...mascot, deletedAt: Date.now() } : mascot)));
    return true;
  }

  private write(mascots: MascotProfile[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(mascots, null, 2));
    renameSync(temp, this.file);
    this.mascots = mascots;
  }
}
