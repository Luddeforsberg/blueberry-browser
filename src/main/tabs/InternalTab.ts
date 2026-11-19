import type { InternalPage } from "../../shared/ipc";
import { mascotsBack } from "../../shared/mascotsPlaces";
import { galleryBack } from "../../shared/galleryPlaces";
import { routinesBack } from "../../shared/routinePlaces";
import { settingsBack } from "../../shared/settingsPlaces";

const TITLES: Record<InternalPage, string> = {
  "new-tab": "New tab",
  chat: "Chat",
  routines: "Routines",
  settings: "Settings",
  downloads: "Downloads",
  gallery: "Component gallery",
  history: "History",
  mascots: "Your mascots",
  "mascot-gallery": "Gallery",
  "needs-you": "Needs you",
  recording: "What I watched",
  cloud: "Cloud tab",
};

// A tab whose page the chrome renderer draws, so it has no web view and no navigation history. The one step back it
// has is Settings', the mascots' page's, Routines' and the Gallery's, from a page one step in to where it came from, which
// its param names.
export class InternalTab {
  readonly kind = "internal";
  readonly favicon = null;
  readonly isLoading = false;
  readonly berryWorking = false;
  readonly workingMascotId = null;
  readonly canGoForward = false;
  readonly trouble = null;
  readonly loadError = null;
  title: string;

  constructor(
    readonly id: string,
    readonly page: InternalPage,
    public param: string | null = null,
    title?: string,
  ) {
    this.title = title || TITLES[page];
  }

  private get back(): string | null {
    if (this.page === "settings") return settingsBack(this.param);
    if (this.page === "mascots") return mascotsBack(this.param);
    if (this.page === "routines") return routinesBack(this.param);
    if (this.page === "mascot-gallery") return galleryBack(this.param);
    return null;
  }

  get canGoBack(): boolean {
    return this.back !== null;
  }

  goBack(): void {
    this.param = this.back ?? this.param;
  }

  get url(): string {
    return `blueberry://${this.page}${this.param ? `/${encodeURIComponent(this.param)}` : ""}`;
  }

  // The chrome draws internal pages, so there is no view to show, hide or close.
  show(): void {
    return;
  }

  hide(): void {
    return;
  }

  destroy(): void {
    return;
  }
}
