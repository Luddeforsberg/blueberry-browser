import type { InternalPage } from "../shared/ipc";

const TITLES: Record<InternalPage, string> = {
  "new-tab": "New tab",
  chat: "Chat",
  routines: "Routines",
  settings: "Settings",
  downloads: "Downloads",
  gallery: "Component gallery",
  history: "History",
  flock: "Your flock",
  "mascot-gallery": "Mascot gallery",
  "needs-you": "Needs you",
};

// A tab whose page the chrome renderer draws, so it has no web view and no navigation history.
export class InternalTab {
  readonly kind = "internal";
  readonly favicon = null;
  readonly isLoading = false;
  readonly berryWorking = false;
  readonly workingMascotId = null;
  readonly canGoBack = false;
  readonly canGoForward = false;
  readonly trouble = null;
  readonly loadError = null;
  title: string;

  constructor(
    readonly id: string,
    readonly page: InternalPage,
    public param: string | null = null,
    title?: string
  ) {
    this.title = title || TITLES[page];
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
