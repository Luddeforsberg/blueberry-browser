import type { ElectronApplication } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// A window is a stack of views (AGENTS.md, src/main), and Playwright only sees one at a time, so a picture of the
// window is each visible view captured by Electron and laid over the ones beneath it, in the window's own order.

// Something painted over before comparing, because it changes by itself: an element in the view whose address has
// `view` in it.
interface Mask {
  view: string;
  selector: string;
}

interface Layer {
  x: number;
  y: number;
  width: number;
  height: number;
  png: string;
  masks: Array<{ x: number; y: number; width: number; height: number }>;
}

// Clocks that tick while something runs. The app's clock is fixed (driveFakes.cjs), but how long a job has taken
// depends on how fast this computer is, so these are painted over in every picture. Matched by their exact classes, so a
// change to one shows up as a difference rather than being hidden.
const RUNNING_CLOCKS: Mask[] = [
  // A reply's "Working 0:02", and how long it took once it's folded.
  'span[class="text-ink-3 tabular-nums"]',
  'section[aria-label="How it got there"] > button > span.tabular-nums',
  // Show Berry how's clock while it watches, and a routine run's time.
  'span[aria-hidden="true"][class="font-mono text-11.5 text-ink-3 tabular-nums"]',
  'span[class="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums"]',
  // The desktop mascot's line and its panel.
  'span[class="font-mono text-11.5 font-regular text-tip-ink/60 tabular-nums"]',
  'span[class="shrink-0 font-mono text-11.5 text-faint tabular-nums"]',
].map((selector) => ({ view: "view=", selector }));

// What the window material would show through glass. It's drawn by the system, so no capture has it.
const GROUND = { light: [243, 243, 243], dark: [32, 32, 32] } as const;
const MASK_COLOUR = [255, 0, 255] as const;

// Carets blink and finite animations end, so neither is caught halfway. Infinite ones go back to their start.
const STILL_CSS = "*, *::before, *::after { caret-color: transparent !important; }";
const STILL_SCRIPT = `void document.getAnimations().forEach((animation) => {
  const timing = animation.effect && animation.effect.getComputedTiming();
  if (timing && Number.isFinite(timing.endTime)) animation.finish(); else animation.cancel();
});`;

// Which window: the browser window by default, or the desktop mascot's, found by the view it holds.
const layersOf = (app: ElectronApplication, view: string, masks: Mask[]) =>
  app.evaluate(
    async ({ BaseWindow }, { view, masks, css, script }) => {
      const views = (window: Electron.BaseWindow) =>
        window.contentView.children.filter((child): child is Electron.WebContentsView => "webContents" in child);
      const window = BaseWindow.getAllWindows().find((candidate) =>
        views(candidate).some((child) => child.webContents.getURL().includes(`view=${view}`)),
      );
      if (!window) throw new Error(`No window holds view=${view}`);
      const { width, height } = window.getContentBounds();
      const layers: Layer[] = [];
      for (const child of views(window)) {
        const bounds = child.getBounds();
        // A parked tab keeps one corner pixel in the window, under the chrome (AGENTS.md, Traps).
        if (!child.getVisible() || bounds.width <= 1 || bounds.height <= 1) continue;
        const contents = child.webContents;
        await contents.insertCSS(css).catch(() => undefined);
        await contents.executeJavaScript(script).catch(() => undefined);
        const url = contents.getURL();
        const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
        for (const mask of masks.filter((each) => url.includes(each.view))) {
          const found = await contents
            .executeJavaScript(
              `[...document.querySelectorAll(${JSON.stringify(mask.selector)})].map((element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })`,
            )
            .catch(() => []);
          rects.push(...found);
        }
        const image = await contents.capturePage();
        layers.push({ ...bounds, png: image.toPNG().toString("base64"), masks: rects });
      }
      return { width, height, layers };
    },
    { view, masks, css: STILL_CSS, script: STILL_SCRIPT },
  );

const compose = ({ width, height, layers }: { width: number; height: number; layers: Layer[] }, theme: "light" | "dark"): PNG => {
  const out = new PNG({ width, height });
  const [r, g, b] = GROUND[theme];
  for (let at = 0; at < out.data.length; at += 4) out.data.set([r, g, b, 255], at);
  for (const layer of layers) {
    const picture = PNG.sync.read(Buffer.from(layer.png, "base64"));
    // A capture is at the view's own size, since drive draws at a scale of 1.
    for (let y = 0; y < Math.min(picture.height, layer.height); y++) {
      const top = layer.y + y;
      if (top < 0 || top >= height) continue;
      for (let x = 0; x < Math.min(picture.width, layer.width); x++) {
        const left = layer.x + x;
        if (left < 0 || left >= width) continue;
        const from = (y * picture.width + x) * 4;
        const to = (top * width + left) * 4;
        const alpha = picture.data[from + 3] / 255;
        if (alpha === 0) continue;
        for (let channel = 0; channel < 3; channel++) {
          out.data[to + channel] = Math.round(picture.data[from + channel] * alpha + out.data[to + channel] * (1 - alpha));
        }
      }
    }
    for (const rect of layer.masks) {
      for (let y = Math.max(0, Math.floor(layer.y + rect.y)); y < Math.min(height, Math.ceil(layer.y + rect.y + rect.height)); y++) {
        for (let x = Math.max(0, Math.floor(layer.x + rect.x)); x < Math.min(width, Math.ceil(layer.x + rect.x + rect.width)); x++) {
          out.data.set([...MASK_COLOUR, 255], (y * width + x) * 4);
        }
      }
    }
  }
  return out;
};

const SETTLE_MS = 250;
const SETTLE_TRIES = 12;

// How far a pixel's colour may move before it counts, the same as scripts/baselineCompare.mjs, so a window counts as at
// rest when a comparison wouldn't tell its last two pictures apart. Edges drawn with anti-aliasing can change by a shade
// from one frame to the next.
const THRESHOLD = 0.1;

// Where two pictures of the same size differ, as one box, or null where they don't.
const changedBox = (a: PNG, b: PNG): string | null => {
  const diff = new PNG({ width: a.width, height: a.height });
  if (pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD, diffMask: true }) === 0) return null;
  let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      // pixelmatch marks a difference in red, and anti-aliasing it skipped in yellow.
      const at = (y * a.width + x) * 4;
      if (diff.data[at + 3] === 0 || diff.data[at + 1] !== 0) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    }
  }
  return `x ${left}–${right}, y ${top}–${bottom}`;
};

// Captures until two pictures in a row are the same, so what's saved is where the window came to rest. A window that
// never rests is saved anyway, with where it kept changing.
export async function captureWindow(
  app: ElectronApplication,
  { view = "chrome", theme }: { view?: string; theme: "light" | "dark" },
): Promise<{ png: Buffer; restless: string | null }> {
  let last: PNG | null = null;
  let restless: string | null = "while it was opening";
  for (let tries = 0; tries < SETTLE_TRIES; tries++) {
    const picture = compose(await layersOf(app, view, RUNNING_CLOCKS), theme);
    if (last && last.width === picture.width && last.height === picture.height) {
      restless = changedBox(last, picture);
      if (!restless) return { png: PNG.sync.write(picture), restless: null };
    }
    last = picture;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  }
  return { png: PNG.sync.write(last!), restless };
}
