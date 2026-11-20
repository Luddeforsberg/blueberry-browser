import type { View } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import { suggestionsRect } from "./floatingPlaces";
import type { AddressSuggestion, AddressSuggestionsRequest, Rect, ThemeState } from "../../shared/ipc";
import type { MascotLook } from "../../shared/library";
import { ACCESSORIES, PALETTES } from "../../shared/mascots";

const MAX_ROWS = 6;
const MAX_TEXT = 2048;

// The list under the address field, in an overlay view of its own, because the chrome view can't draw over a tab view.
// The chrome works out the rows and handles the keys. This only draws them, and hands a pressed row back to the chrome.
export class AddressSuggestions {
  readonly chromeView: ChromeView = createChromeView("suggestions");
  // What's showing, kept after it hides: a press in the list can reach main after the field's blur has closed it.
  private rows: AddressSuggestion[] = [];

  constructor(private readonly parent: View) {
    this.chromeView.view.setVisible(false);
    parent.addChildView(this.chromeView.view);
  }

  private get contents() {
    return this.chromeView.view.webContents;
  }

  show(request: unknown, window: { width: number; height: number }): void {
    const valid = validRequest(request);
    if (!valid || valid.rows.length === 0) return this.close();
    const { rows, selected, field } = valid;
    const { view, sheet } = suggestionsRect(
      field,
      rows.length,
      rows.some(({ kind }) => kind === "ask"),
      window,
    );
    this.rows = rows;
    // Adding a view again moves it to the top, above tabs opened since.
    this.parent.addChildView(this.chromeView.view);
    this.chromeView.view.setBounds(view);
    this.chromeView.view.setVisible(true);
    sendToRenderer(this.contents, "address:suggestions", { rows, selected, sheet });
  }

  close(): void {
    if (!this.chromeView.view.getVisible()) return;
    this.chromeView.view.setVisible(false);
    sendToRenderer(this.contents, "address:suggestions", null);
  }

  // The row at that place in what was last shown, if there is one.
  pick(index: unknown): AddressSuggestion | null {
    const row = typeof index === "number" && Number.isInteger(index) ? this.rows[index] : undefined;
    this.close();
    return row ?? null;
  }

  notifyTheme(theme: ThemeState): void {
    sendToRenderer(this.contents, "theme:updated", theme);
  }

  destroy(): void {
    this.contents.close();
  }
}

// The chrome is trusted, but the rows go on to another view and come back as something to act on, so each is checked
// for its shape and nothing else rides along.
const text = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_TEXT;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const webOrEmpty = (value: unknown): value is string => text(value) && (value === "" || /^https?:\/\//i.test(value));
const icon = (value: unknown): string | null => (text(value) && /^https?:\/\//i.test(value) ? value : null);

const validLook = (value: unknown): MascotLook | null => {
  const { palette, accessory } = (value ?? {}) as Record<string, unknown>;
  const look = { palette: PALETTES.find(({ id }) => id === palette)?.id, accessory: ACCESSORIES.find(({ id }) => id === accessory)?.id };
  return look.palette && look.accessory ? { palette: look.palette, accessory: look.accessory } : null;
};

const validRow = (value: unknown): AddressSuggestion | null => {
  const row = (value ?? {}) as Record<string, unknown>;
  switch (row.kind) {
    case "tab":
      // A tab is acted on by its id, so its address is only shown.
      return text(row.tabId) && text(row.title) && text(row.url)
        ? { kind: "tab", tabId: row.tabId, title: row.title, url: row.url, favicon: icon(row.favicon) }
        : null;
    case "bookmark":
      return text(row.title) && webOrEmpty(row.url) && row.url
        ? { kind: "bookmark", title: row.title, url: row.url, favicon: icon(row.favicon) }
        : null;
    case "history":
      return text(row.title) && webOrEmpty(row.url) && row.url && text(row.when)
        ? { kind: "history", title: row.title, url: row.url, favicon: icon(row.favicon), when: row.when }
        : null;
    case "search":
      return text(row.text) && webOrEmpty(row.url) && row.url
        ? { kind: "search", text: row.text, url: row.url, opens: row.opens === true }
        : null;
    case "ask": {
      const look = validLook(row.look);
      return text(row.text) && text(row.name) && look
        ? { kind: "ask", text: row.text, name: row.name, look, hidden: row.hidden === true }
        : null;
    }
    default:
      return null;
  }
};

const validRequest = (input: unknown): AddressSuggestionsRequest | null => {
  const { rows, selected, field } = (input ?? {}) as { rows?: unknown; selected?: unknown; field?: Record<string, unknown> };
  const { x, y, width, height } = field ?? {};
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null;
  const valid = rows.map(validRow);
  if (valid.some((row) => row === null)) return null;
  const chosen = typeof selected === "number" && Number.isInteger(selected) && selected >= 0 && selected < valid.length ? selected : null;
  return { rows: valid as AddressSuggestion[], selected: chosen, field: { x, y, width, height } satisfies Rect };
};
