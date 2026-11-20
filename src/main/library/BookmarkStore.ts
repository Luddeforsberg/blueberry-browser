import { randomUUID } from "crypto";
import { join } from "path";
import type { Bookmark, SavedSiteList } from "../../shared/library";
import { fieldsOf } from "../../shared/fields";
import { NOTHING_TO_SAVE, readJsonFile, savedEntries, saveFile, type Saved } from "./savedFile";

const WEB = /^https?:\/\//i;
// A page names its own icon, so it could name one of any length. Longer than this, the site shows its letter.
export const MAX_ICON_LENGTH = 2048;
// Only an icon on the web, never a data address or anything else a page could name.
const webIcon = (favicon: unknown) =>
  typeof favicon === "string" && favicon.length <= MAX_ICON_LENGTH && WEB.test(favicon) ? { favicon } : {};

const savedSite = (entry: unknown): Bookmark | null => {
  const { id, title, url, favicon } = fieldsOf(entry);
  return typeof id === "string" && typeof title === "string" && typeof url === "string" && WEB.test(url)
    ? { id, title, url, ...webIcon(favicon) }
    : null;
};

interface SavedSites {
  pinned: Bookmark[];
  bookmarks: Bookmark[];
}

// A site is in one list or the other, once. The first one with its address or its id is kept, and pinned comes first,
// so a site that was once saved both ways stays on top.
const oncePerSite = ({ pinned, bookmarks }: SavedSites): SavedSites => {
  const urls = new Set<string>();
  const ids = new Set<string>();
  const firstOnes = (sites: Bookmark[]) =>
    sites.filter(({ id, url }) => {
      if (urls.has(url) || ids.has(id)) return false;
      urls.add(url);
      ids.add(id);
      return true;
    });
  return { pinned: firstOnes(pinned), bookmarks: firstOnes(bookmarks) };
};

// The two lists of saved sites, the pinned ones on top and the bookmarks, in one file, so moving a site from one to the
// other is a single write: it's in one list or the other, whatever happens partway. Each change says whether it was
// saved, and only what was saved is kept. Before, each list had a file of its own, which the first launch reads in.
export class BookmarkStore {
  private readonly file: string;
  private lists: SavedSites;

  constructor(folder: string) {
    this.file = join(folder, "saved-sites.json");
    const saved = readJsonFile(this.file);
    if (saved !== undefined) {
      const { pinned, bookmarks } = fieldsOf(saved);
      this.lists = oncePerSite({
        pinned: savedEntries(this.file, pinned, savedSite),
        bookmarks: savedEntries(this.file, bookmarks, savedSite),
      });
      return;
    }
    const before = (name: string) => {
      const file = join(folder, name);
      return savedEntries(file, readJsonFile(file), savedSite);
    };
    this.lists = oncePerSite({ pinned: before("pinned.json"), bookmarks: before("bookmarks.json") });
    // The old files stay as they were. Until this is saved, the next launch reads them in again, the same way.
    if (this.lists.pinned.length + this.lists.bookmarks.length > 0 && !this.save(this.lists)) {
      console.error("Saved sites are read from the old files until they can be saved together.");
    }
  }

  get pinned(): Bookmark[] {
    return this.lists.pinned;
  }

  get bookmarks(): Bookmark[] {
    return this.lists.bookmarks;
  }

  has(url: string): boolean {
    return [...this.lists.pinned, ...this.lists.bookmarks].some((site) => site.url === url);
  }

  // Saves a page at the end of a list. One saved already, in either, stays as it is.
  add(list: SavedSiteList, url: string, title: string, favicon: string | null = null): Saved {
    if (!WEB.test(url) || this.has(url)) return NOTHING_TO_SAVE;
    const site = { id: randomUUID(), title: title || url, url, ...webIcon(favicon) };
    return list === "favourites"
      ? this.save({ ...this.lists, pinned: [...this.lists.pinned, site] })
      : this.save({ ...this.lists, bookmarks: [...this.lists.bookmarks, site] });
  }

  // Puts a saved site at a place in a list, from wherever it is, keeping its id. The place counts the others, so it's
  // where it ends up.
  place(id: string, list: SavedSiteList, index: number): Saved {
    const site = [...this.lists.pinned, ...this.lists.bookmarks].find((candidate) => candidate.id === id);
    if (!site) return NOTHING_TO_SAVE;
    const others = (sites: Bookmark[]) => sites.filter((candidate) => candidate.id !== id);
    const into = others(list === "favourites" ? this.lists.pinned : this.lists.bookmarks);
    const at = Math.max(0, Math.min(Math.trunc(index) || 0, into.length));
    const placed = [...into.slice(0, at), site, ...into.slice(at)];
    return list === "favourites"
      ? this.save({ pinned: placed, bookmarks: others(this.lists.bookmarks) })
      : this.save({ pinned: others(this.lists.pinned), bookmarks: placed });
  }

  // From both lists.
  removeUrl(url: string): Saved {
    if (!this.has(url)) return NOTHING_TO_SAVE;
    const others = (sites: Bookmark[]) => sites.filter((site) => site.url !== url);
    return this.save({ pinned: others(this.lists.pinned), bookmarks: others(this.lists.bookmarks) });
  }

  private save(lists: SavedSites): Saved {
    const saved = saveFile(this.file, JSON.stringify(lists, null, 2));
    if (saved) this.lists = lists;
    return saved;
  }
}
