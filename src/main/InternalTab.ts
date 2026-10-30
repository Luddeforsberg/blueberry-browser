import type { InternalPage } from "../shared/ipc";

const TITLES: Record<InternalPage, string> = {
  "new-tab": "New tab",
  chat: "New chat",
  routines: "Routines",
  settings: "Settings",
};

// A tab whose page the chrome renderer draws, so it has no web view and no navigation history.
export class InternalTab {
  readonly kind = "internal";
  readonly favicon = null;
  readonly isLoading = false;
  readonly canGoBack = false;
  readonly canGoForward = false;
  readonly title: string;

  constructor(
    readonly id: string,
    readonly page: InternalPage,
    readonly param: string | null = null,
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
