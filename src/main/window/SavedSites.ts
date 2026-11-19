import type { OwnMenuItem } from "../menus/ownMenu";
import type { ChromeRegion } from "../../shared/ipc";
import type { SavedSiteList } from "../../shared/library";
import type { WindowParts, WindowStores } from "./WindowParts";

// Pinned sites and bookmarks: the star, Keep on Top, moving a site between the lists and a saved site's menu.
export class SavedSites {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  // A favourite is a bookmark kept on top, so the star counts both, and taking it off takes the site away from both.
  toggleBookmark(): void {
    const tab = this.w.tabs.activeTab;
    if (!tab) return;
    const saved = this.stores.bookmarkStore.has(tab.url) || this.stores.pinnedStore.has(tab.url);
    this.saveBookmarks(() => {
      if (!saved) return this.stores.bookmarkStore.add(tab.url, tab.title, tab.favicon);
      this.stores.bookmarkStore.removeUrl(tab.url);
      this.stores.pinnedStore.removeUrl(tab.url);
    });
  }

  keepOnTop(): void {
    const tab = this.w.tabs.activeTab;
    if (!tab || this.stores.pinnedStore.has(tab.url)) return;
    const saved = this.stores.bookmarkStore.get().find((bookmark) => bookmark.url === tab.url);
    if (saved) this.placeSavedSite(saved.id, "favourites", this.stores.pinnedStore.get().length);
    else this.saveBookmarks(() => this.stores.pinnedStore.add(tab.url, tab.title, tab.favicon));
  }

  // A saved site lives in one list or the other: on top as a tile, or in the bookmarks.
  placeSavedSite(id: string, list: SavedSiteList, index: number): void {
    const site = [...this.stores.pinnedStore.get(), ...this.stores.bookmarkStore.get()].find((candidate) => candidate.id === id);
    if (!site) return;
    const [into, outOf] =
      list === "favourites" ? [this.stores.pinnedStore, this.stores.bookmarkStore] : [this.stores.bookmarkStore, this.stores.pinnedStore];
    this.saveBookmarks(() => {
      into.place(site, index);
      outOf.removeUrl(site.url);
    });
  }

  // Settles once the menu has closed.
  showBookmarkMenu(id: string, anchor: unknown, from: ChromeRegion): Promise<void> {
    const pin = this.stores.pinnedStore.get().find((candidate) => candidate.id === id);
    const site = pin ?? this.stores.bookmarkStore.get().find((candidate) => candidate.id === id);
    if (!site) return Promise.resolve();
    const items: OwnMenuItem[] = [
      pin
        ? { label: "Move to Bookmarks", icon: "bookmark", click: () => this.placeSavedSite(id, "bookmarks", 0) }
        : { label: "Keep on Top", icon: "pin", click: () => this.placeSavedSite(id, "favourites", this.stores.pinnedStore.get().length) },
      { type: "separator" },
      {
        label: "Remove Bookmark",
        icon: "delete",
        danger: true,
        click: () =>
          this.saveBookmarks(() => {
            this.stores.bookmarkStore.removeUrl(site.url);
            this.stores.pinnedStore.removeUrl(site.url);
          }),
      },
    ];
    return new Promise((resolve) => this.w.windowMenus.openMenu(items, anchor, from, "Bookmark", resolve));
  }

  private saveBookmarks(save: () => void): void {
    try {
      save();
      this.w.broadcast("library:updated", this.w.library.librarySnapshot);
      // The horizontal layout's bookmarks bar comes and goes with what's saved.
      this.w.panels.updateAllBounds();
    } catch (error) {
      console.error("Failed to save pinned sites and bookmarks:", error);
      void this.w.windowMenus.notice(
        "Could not save your pinned sites and bookmarks",
        "Check that there is space on your disk and try again.",
      );
    }
  }
}
