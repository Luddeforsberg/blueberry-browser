import { app, nativeImage, type BaseWindow, type NativeImage } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { APP_ICON_SIZE, type AppIconGround } from "../../shared/appIcon";

// Settings > General > App icon. Main can't draw a mascot, so the chrome draws the chosen icon and hands it over as a PNG.
// What arrives is untrusted bytes: it's set only if it's for what's chosen and is a PNG of the right size that the system
// decodes. The last one is kept in the user data folder with what it was drawn for, so it's set again at launch before
// any page has drawn it, and never for a mascot that's gone. A pinned shortcut, and the icon while the app is closed,
// stay the shipped one, which the systems don't let a running app change.

const MAX_BYTES = 1024 * 1024;
const PREFIX = "data:image/png;base64,";
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The bytes, if they're a PNG no bigger than a megabyte that says it's `size` pixels square. Its header is all that's read
// here: whether the rest decodes is the system's to say.
export function pngOfSize(bytes: Buffer, size: number): Buffer | null {
  if (bytes.length < 24 || bytes.length > MAX_BYTES || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  // The header chunk always comes first: its length, 13, its type, then the width and height.
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return bytes.readUInt32BE(16) === size && bytes.readUInt32BE(20) === size ? bytes : null;
}

// The same, from a PNG data address and nothing else.
export function pngFromDataUrl(value: unknown, size: number): Buffer | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  const base64 = value.slice(PREFIX.length);
  if (base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  return pngOfSize(Buffer.from(base64, "base64"), size);
}

export interface AppIconChoice {
  // Null is Berry, as it is once the chosen mascot is deleted.
  mascotId: string | null;
  ground: AppIconGround;
}

export class AppIcon {
  private readonly picture: string;
  private readonly drawnFor: string;

  constructor(
    folder: string,
    private readonly window: BaseWindow,
    private readonly chosen: () => AppIconChoice,
  ) {
    this.picture = join(folder, "app-icon.png");
    this.drawnFor = join(folder, "app-icon.json");
    this.restore();
  }

  // From the chrome. Says whether it was taken. Anything else leaves the icon as it was.
  set(png: unknown, mascotId: unknown, ground: unknown): boolean {
    const chosen = this.chosen();
    if (mascotId !== chosen.mascotId || ground !== chosen.ground) return false;
    const bytes = pngFromDataUrl(png, APP_ICON_SIZE);
    const image = bytes && this.decoded(bytes);
    if (!bytes || !image) return false;
    this.apply(image);
    try {
      mkdirSync(dirname(this.picture), { recursive: true });

      // Beside the file, then renamed, so a crash never leaves half of one.
      writeFileSync(`${this.picture}.tmp`, bytes);
      renameSync(`${this.picture}.tmp`, this.picture);
      writeFileSync(`${this.drawnFor}.tmp`, JSON.stringify(chosen));
      renameSync(`${this.drawnFor}.tmp`, this.drawnFor);
    } catch (error) {
      console.error("Failed to keep the app icon:", error);
    }
    return true;
  }

  // The kept icon, if it was drawn for what's chosen now. Otherwise the shipped one stays until the chrome draws.
  private restore(): void {
    let drawnFor: Partial<AppIconChoice>;
    let bytes: Buffer;
    try {
      drawnFor = JSON.parse(readFileSync(this.drawnFor, "utf8")) ?? {};
      bytes = readFileSync(this.picture);
    } catch {
      return;
    }
    const chosen = this.chosen();
    if (drawnFor.mascotId !== chosen.mascotId || drawnFor.ground !== chosen.ground) return;
    const checked = pngOfSize(bytes, APP_ICON_SIZE);
    const image = checked && this.decoded(checked);
    if (image) this.apply(image);
  }

  private decoded(bytes: Buffer): NativeImage | null {
    const image = nativeImage.createFromBuffer(bytes);
    const { width, height } = image.getSize();
    return !image.isEmpty() && width === APP_ICON_SIZE && height === APP_ICON_SIZE ? image : null;
  }

  // On a Mac the Dock's, elsewhere the window's, which is what the taskbar shows while the app is open.
  private apply(image: NativeImage): void {
    if (process.platform === "darwin") app.dock?.setIcon(image);
    else this.window.setIcon(image);
  }
}
