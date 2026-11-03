import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { GalleryLinked, GalleryListing, GalleryMascot, PublishedMascot, PublishResult } from "../shared/library";
import { isUuid, parsePublicDraft, parsePublishChoices, parsePublishedRow, publicRow } from "../shared/publishing";
import type { Account } from "./Account";
import { GalleryServer, publicPageLink, ServerError, Unreachable } from "./galleryServer";
import { starterMascots } from "./mascotCatalog";
import type { MascotStore } from "./MascotStore";

const NO_SERVER = "Publishing isn’t set up in this copy of Blueberry.";
const CANT_REACH = "Couldn’t reach the Gallery, so nothing changed. Try again in a moment.";
const SIGN_IN_FIRST = "Sign in to publish.";

const failure = (error: unknown): string => {
  if (error instanceof Unreachable) return CANT_REACH;
  if (error instanceof ServerError && (error.status === 401 || error.status === 403)) return "The Gallery didn’t accept your sign-in. Sign out, sign in again and try once more.";
  if (error instanceof ServerError && error.status === 400) return "The Gallery refused this. You may already have the most it allows, 20 published mascots.";
  return "The Gallery couldn’t do that. Try again in a moment.";
};

interface Saved {
  // A random id standing for this install, sent only when adding, so one install counts once.
  install: string;
  // The name they last published under. It starts empty, so it can't start as anything from the account.
  author: string;
}

// The Gallery beyond the starters: what's published, and publishing. Everything from the server goes through
// `parsePublishedRow`, and a copy goes through `MascotStore` like one made by hand.
export class Gallery {
  // What the page last showed, so a copy is exactly what the user reviewed, even if its author has changed it since.
  private shown = new Map<string, GalleryMascot>(starterMascots().map((entry) => [entry.id, entry]));
  private saved: Saved;

  constructor(
    private readonly server: GalleryServer | null,
    private readonly account: Account,
    private readonly mascots: MascotStore,
    private readonly file: string,
    private readonly site: string | undefined,
    private readonly onChange: () => void
  ) {
    this.saved = this.load();
  }

  get author(): string {
    return this.saved.author;
  }

  async list(): Promise<GalleryListing> {
    const starters = starterMascots();
    if (!this.server) return { entries: starters, status: "starters" };
    try {
      const published = (await this.server.listMascots()).flatMap((row) => {
        const entry = parsePublishedRow(row);
        return entry ? [{ ...entry, link: publicPageLink(this.site, entry.id) }] : [];
      });
      for (const entry of published) this.shown.set(entry.id, entry);
      return { entries: [...published, ...starters], status: "live" };
    } catch {
      return { entries: starters, status: "unreachable" };
    }
  }

  // The entry a `blueberry://mascot/` link named, asked of the server now. Like a row in the list, it's only shown, so
  // adding it still takes Add on what was shown.
  async linked(id: unknown): Promise<GalleryLinked> {
    if (!this.server) return { entry: null, status: "starters" };
    if (!isUuid(id)) return { entry: null, status: "live" };
    try {
      const row = parsePublishedRow(await this.server.mascot(id));
      if (!row || row.id !== id.toLowerCase()) return { entry: null, status: "live" };
      const entry = { ...row, link: publicPageLink(this.site, row.id) };
      this.shown.set(entry.id, entry);
      return { entry, status: "live" };
    } catch {
      return { entry: null, status: "unreachable" };
    }
  }

  entry(id: string): GalleryMascot | null {
    return this.shown.get(id) ?? null;
  }

  // Best effort: a mascot is added whether or not the count hears of it. Starters aren't on the server to count.
  countAdd(id: string): void {
    if (!this.server || !this.shown.get(id)?.publishedAt) return;
    const { server } = this;
    void this.account
      .accessToken()
      .catch(() => null)
      .then((token) => server.recordAdd(token, id, this.saved.install))
      .catch(() => console.error("Couldn't count an add."));
  }

  async publish(mascotId: unknown, choices: unknown): Promise<PublishResult> {
    if (!this.server) return { ok: false, error: NO_SERVER };
    const mascot = typeof mascotId === "string" ? this.mascots.find(mascotId) : null;
    if (!mascot || mascot.deletedAt !== null || mascot.id === "berry") return { ok: false, error: "This mascot can’t be published." };
    if (mascot.galleryId) return { ok: false, error: "This is a copy from the Gallery, so it’s not yours to publish." };
    const draft = parsePublicDraft(mascot);
    if ("error" in draft) return { ok: false, error: draft.error };
    const parsed = parsePublishChoices(choices);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const row = publicRow(draft.draft, parsed.choices);
    try {
      const token = await this.account.accessToken();
      if (!token) return { ok: false, error: SIGN_IN_FIRST };
      let id = mascot.publishedId ?? null;
      if (!id || !(await this.server.updateMascot(token, id, row))) id = await this.server.insertMascot(token, row);
      if (!id) return { ok: false, error: "The Gallery didn’t say whether that worked. Look for it in the Gallery." };
      this.mascots.setPublished(mascot.id, id);
      this.saved = { ...this.saved, author: parsed.choices.author };
      this.save();
      this.onChange();
      return { ok: true, id, link: publicPageLink(this.site, id) };
    } catch (error) {
      return { ok: false, error: failure(error) };
    }
  }

  // Copies people have already added stay theirs, as nothing here can reach them.
  async unpublish(id: unknown): Promise<PublishResult> {
    if (!this.server) return { ok: false, error: NO_SERVER };
    if (typeof id !== "string") return { ok: false, error: "That isn’t published." };
    try {
      const token = await this.account.accessToken();
      if (!token) return { ok: false, error: SIGN_IN_FIRST };
      // No row deleted means it's another account's, or already gone. Saying it worked could leave it public.
      if (!(await this.server.deleteMascot(token, id))) return { ok: false, error: "That didn’t remove anything. It may be on another account, so sign in with the one that published it." };
      this.forgetPublished(id);
      this.shown.delete(id);
      this.onChange();
      return { ok: true, id, link: null };
    } catch (error) {
      return { ok: false, error: failure(error) };
    }
  }

  // The signed-in user's, from the server, so it still works on a computer that didn't publish them. Null if it can't say.
  async mine(): Promise<PublishedMascot[] | null> {
    if (!this.server) return [];
    try {
      const token = await this.account.accessToken();
      if (!token) return [];
      const rows = await this.server.myMascots(token);
      return rows.flatMap((row) => {
        const entry = parsePublishedRow(row);
        if (!entry) return [];
        return [{
          id: entry.id,
          name: entry.draft.name,
          author: entry.author,
          description: entry.description,
          category: entry.category,
          example: entry.example ?? null,
          addCount: entry.addCount ?? 0,
          link: publicPageLink(this.site, entry.id),
          hidden: (row as { hidden?: unknown }).hidden === true,
        }];
      });
    } catch {
      return null;
    }
  }

  private forgetPublished(id: string): void {
    for (const mascot of this.mascots.all()) {
      if (mascot.publishedId === id) this.mascots.setPublished(mascot.id, null);
    }
  }

  private load(): Saved {
    try {
      const { install, author } = JSON.parse(readFileSync(this.file, "utf8"));
      if (typeof install === "string") return { install, author: typeof author === "string" ? author : "" };
    } catch {
      // A new one follows. It only means this install could count once more.
    }
    const fresh = { install: randomUUID(), author: "" };
    this.saved = fresh;
    this.save();
    return fresh;
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.saved));
      renameSync(temp, this.file);
    } catch {
      console.error("Couldn't save the Gallery's settings.");
    }
  }
}
