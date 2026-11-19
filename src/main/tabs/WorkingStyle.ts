import type { Tab } from "./Tab";

// A glow around the page while Berry works in it. Added as a style, not an element, so the page's own content
// and scripts are left alone, and it can't take a click.
const WORKING_CSS = `
  html::after {
    content: "" !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
    pointer-events: none !important;
    box-shadow: inset 0 0 0 3px rgb(127 139 216), inset 0 0 72px rgb(127 139 216 / 0.6) !important;
    animation: berry-working 1600ms ease-in-out infinite alternate !important;
  }
  @keyframes berry-working { from { opacity: 0.6; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { html::after { animation: none !important; } }
`;

// The glow on a page while Berry works in it, for anyone who has turned the mascot off.
export class WorkingStyle {
  private workingStyle: Promise<string | null> | null = null;

  constructor(private readonly tab: Tab) {}

  // A tab with nothing loaded yet gets its style when it navigates. The mascot says all this does and more, so it's only for
  // anyone who has turned the mascot off, and a capture for the model has one less thing in it.
  add(): void {
    const view = this.tab.existingView;
    if (!view || this.tab.actor.enabled) return;
    this.workingStyle = view.webContents.insertCSS(WORKING_CSS).catch(() => null);
  }

  remove(): void {
    const view = this.tab.existingView;
    if (!view) return;
    const contents = view.webContents;
    void this.workingStyle
      ?.then((key) => {
        if (key && !contents.isDestroyed()) return contents.removeInsertedCSS(key);
        return undefined;
      })
      .catch(() => {});
    this.workingStyle = null;
  }
}
