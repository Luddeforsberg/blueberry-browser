import type { OwnMenuItem } from "../menus/ownMenu";
import type { ChromeRegion } from "../../shared/ipc";
import type { SavedSiteList } from "../../shared/library";
import type { Saved } from "../library/savedFile";
import type { WindowParts } from "./WindowParts";
import type { AppStores } from "../app/appStores";

// Pinned sites and bookmarks: the star, Keep on Top, moving a site between the lists and a saved site's menu.
export class SavedSites {
  constructor(
    private readonly w: WindowParts,
    private readonly stores: AppStores,
  ) {}

  // A favourite is a bookmark kept on top, so the star counts both, and taking it off takes the site away from both.
  toggleBookmark(): void {
    const tab = this.w.tabs.activeTab;
    if (!tab) return;
    const { bookmarkStore } = this.stores;
    this.saved(
      bookmarkStore.has(tab.url) ? bookmarkStore.removeUrl(tab.url) : bookmarkStore.add("bookmarks", tab.url, tab.title, tab.favicon),
    );
  }

  keepOnTop(): void {
    const tab = this.w.tabs.activeTab;
    const { bookmarkStore } = this.stores;
    if (!tab || bookmarkStore.pinned.some((site) => site.url === tab.url)) return;
    const saved = bookmarkStore.bookmarks.find((bookmark) => bookmark.url === tab.url);
    this.saved(
      saved
        ? bookmarkStore.place(saved.id, "favourites", bookmarkStore.pinned.length)
        : bookmarkStore.add("favourites", tab.url, tab.title, tab.favicon),
    );
  }

  // A saved site lives in one list or the other: on top as a tile, or in the bookmarks.
  placeSavedSite(id: string, list: SavedSiteList, index: number): void {
    this.saved(this.stores.bookmarkStore.place(id, list, index));
  }

  // Settles once the menu has closed.
  showBookmarkMenu(id: string, anchor: unknown, from: ChromeRegion): Promise<void> {
    const { bookmarkStore } = this.stores;
    const pin = bookmarkStore.pinned.find((candidate) => candidate.id === id);
    const site = pin ?? bookmarkStore.bookmarks.find((candidate) => candidate.id === id);
    if (!site) return Promise.resolve();
    const items: OwnMenuItem[] = [
      pin
        ? { label: "Move to Bookmarks", icon: "bookmark", click: () => this.placeSavedSite(id, "bookmarks", 0) }
        : { label: "Keep on Top", icon: "pin", click: () => this.placeSavedSite(id, "favourites", bookmarkStore.pinned.length) },
      { type: "separator" },
      {
        label: "Remove Bookmark",
        icon: "delete",
        danger: true,
        click: () => this.saved(bookmarkStore.removeUrl(site.url)),
      },
    ];
    return new Promise((resolve) => this.w.windowMenus.openMenu(items, anchor, from, "Bookmark", resolve));
  }

  // Both lists are one file, so a change is saved whole or not at all, and one that wasn't changes nothing.
  private saved(saved: Saved): void {
    if (!saved) {
      void this.w.windowMenus.notice(
        "Could not save your pinned sites and bookmarks",
        "Nothing was changed. Check that there is space on your disk, or restart Blueberry, and try again.",
      );
      return;
    }
    this.w.broadcast("library:updated", this.w.library.librarySnapshot);
    // The horizontal layout's bookmarks bar comes and goes with what's saved.
    this.w.panels.updateAllBounds();
  }
}
