import type { View } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import { tooltipRect } from "./Layout";
import type { Rect, ThemeState, TooltipRequest } from "../shared/ipc";

const MAX_WORDS = 200;
const MAX_KEYS = 4;
const MAX_KEY = 12;
const MAX_WIDTH = 640;

// A tooltip that hangs over a web page, in a view of its own, because a tab's view covers the chrome under the toolbar.
// The chrome decides what it says, when it shows and where. This only draws it, and never takes the keyboard: nothing
// in it can be focused or pressed, and the chrome hides it as soon as the pointer leaves its control.
export class TooltipView {
  readonly chromeView: ChromeView = createChromeView("tooltip");
  private bounds: Rect | null = null;

  constructor(private readonly parent: View) {
    this.chromeView.view.setVisible(false);
    parent.addChildView(this.chromeView.view);
  }

  private get contents() {
    return this.chromeView.view.webContents;
  }

  show(request: unknown, window: { width: number; height: number }): void {
    const valid = validRequest(request);
    if (!valid) return this.hide();
    const { view, pill } = tooltipRect(valid.box, window);
    const moved = !this.bounds || view.y !== this.bounds.y || view.width !== this.bounds.width || view.height !== this.bounds.height;
    if (moved) {
      // Adding a view again moves it to the top, above tabs and other views opened since. Only when it isn't showing,
      // so a slide along a row never touches the view.
      if (!this.bounds) this.parent.addChildView(this.chromeView.view);
      this.chromeView.view.setBounds(view);
      this.bounds = view;
    }
    sendToRenderer(this.contents, "tooltip:shown", { ...valid, box: pill, slide: valid.slide && !moved });
    this.chromeView.view.setVisible(true);
  }

  hide(): void {
    if (!this.bounds) return;
    this.bounds = null;
    this.chromeView.view.setVisible(false);
    sendToRenderer(this.contents, "tooltip:shown", null);
  }

  notifyTheme(theme: ThemeState): void {
    sendToRenderer(this.contents, "theme:updated", theme);
  }

  destroy(): void {
    this.contents.close();
  }
}

// The chrome is trusted, but what it sends is drawn in another view, so only words, short keys and a sane box get there.
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validRequest = (input: unknown): TooltipRequest | null => {
  const { words, keys, box, slide } = (input ?? {}) as { words?: unknown; keys?: unknown; box?: Record<string, unknown>; slide?: unknown };
  const { x, y, width, height } = box ?? {};
  if (typeof words !== "string" || words.length === 0 || words.length > MAX_WORDS) return null;
  if (!Array.isArray(keys) || keys.length > MAX_KEYS || !keys.every((key) => typeof key === "string" && key.length > 0 && key.length <= MAX_KEY)) return null;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || width > MAX_WIDTH || height <= 0 || height > 64) return null;
  return { words, keys: keys as string[], box: { x, y, width, height }, slide: slide === true };
};
