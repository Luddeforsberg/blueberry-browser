import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppIconChoice } from "./AppIcon";

// The system's decoder stands in: it reads the size from the header, as a real PNG says it, and a picture ending in
// "garbage" doesn't decode.
const shownOn = vi.hoisted(() => ({ window: [] as unknown[], dock: [] as unknown[] }));
vi.mock("electron", () => ({
  app: { dock: { setIcon: (image: unknown) => shownOn.dock.push(image) } },
  nativeImage: {
    createFromBuffer: (bytes: Buffer) => {
      const decodes = !bytes.toString("latin1").endsWith("garbage");
      const size = decodes ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : { width: 0, height: 0 };
      return { isEmpty: () => !decodes, getSize: () => size };
    },
  },
}));

const { AppIcon, pngFromDataUrl, pngOfSize } = await import("./AppIcon");

// A PNG's signature and header chunk, for a picture `width` by `height`, then `rest`.
const png = (width: number, height = width, rest = "pixels") => {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.from(rest, "latin1")]);
};
const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;
const MEGABYTE = 1024 * 1024;

describe("pngOfSize and pngFromDataUrl", () => {
  it("take a PNG data address of the size asked for", () => {
    expect(pngFromDataUrl(dataUrl(png(256)), 256)).toEqual(png(256));
  });

  it("refuse anything that isn't a PNG data address", () => {
    for (const value of [
      null,
      42,
      {},
      "",
      dataUrl(png(256)).replace("image/png", "image/svg+xml"),
      `${dataUrl(png(256))}!`,
      "https://example.com/icon.png",
      "file:///C:/icon.png",
    ]) {
      expect(pngFromDataUrl(value, 256)).toBeNull();
    }
  });

  it("refuse a PNG that isn't square at the size asked for, or isn't a PNG at all", () => {
    expect(pngOfSize(png(255), 256)).toBeNull();
    expect(pngOfSize(png(257), 256)).toBeNull();
    expect(pngOfSize(png(256, 128), 256)).toBeNull();
    expect(pngOfSize(Buffer.from("GIF89a and then nearly anything"), 256)).toBeNull();
    expect(pngOfSize(png(256).subarray(0, 23), 256)).toBeNull();
  });

  it("take a megabyte and refuse a byte more", () => {
    expect(pngOfSize(png(256, 256, "x".repeat(MEGABYTE - 24)), 256)).not.toBeNull();
    expect(pngOfSize(png(256, 256, "x".repeat(MEGABYTE - 23)), 256)).toBeNull();
    expect(pngFromDataUrl(dataUrl(png(256, 256, "x".repeat(MEGABYTE - 24))), 256)).not.toBeNull();
    expect(pngFromDataUrl(dataUrl(png(256, 256, "x".repeat(MEGABYTE - 23))), 256)).toBeNull();
  });
});

describe("AppIcon", () => {
  const scout: AppIconChoice = { mascotId: "scout", ground: "night" };
  const window = { setIcon: (image: unknown) => shownOn.window.push(image) };
  let folder: string;
  let chosen: AppIconChoice;
  const start = () => new AppIcon(folder, window as never, () => chosen);
  const shown = () => (process.platform === "darwin" ? shownOn.dock : shownOn.window);
  const forget = () => {
    shownOn.window.length = 0;
    shownOn.dock.length = 0;
  };

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "blueberry-app-icon-"));
    chosen = scout;
    forget();
  });

  it("sets and keeps a picture for what's chosen", () => {
    expect(start().set(dataUrl(png(256)), "scout", "night")).toBe(true);
    expect(shown()).toHaveLength(1);
    expect(readFileSync(join(folder, "app-icon.png"))).toEqual(png(256));
    expect(JSON.parse(readFileSync(join(folder, "app-icon.json"), "utf8"))).toEqual(scout);
  });

  it("refuses a picture drawn for anything but what's chosen, and changes nothing", () => {
    const icon = start();
    expect(icon.set(dataUrl(png(256)), null, "night")).toBe(false);
    expect(icon.set(dataUrl(png(256)), "scout", "paper")).toBe(false);
    expect(icon.set(dataUrl(png(256)), ["scout"], "night")).toBe(false);
    expect(shown()).toHaveLength(0);
    expect(existsSync(join(folder, "app-icon.png"))).toBe(false);
  });

  it("refuses what isn't a PNG of the right size, or doesn't decode, and changes nothing", () => {
    const icon = start();
    expect(icon.set(dataUrl(png(512)), "scout", "night")).toBe(false);
    expect(icon.set("data:image/png;base64,AAAA", "scout", "night")).toBe(false);
    expect(icon.set(dataUrl(png(256, 256, "garbage")), "scout", "night")).toBe(false);
    expect(shown()).toHaveLength(0);
    expect(existsSync(join(folder, "app-icon.png"))).toBe(false);
  });

  it("sets the kept picture again at launch, only while it's for what's chosen", () => {
    start().set(dataUrl(png(256)), "scout", "night");
    forget();
    start();
    expect(shown()).toHaveLength(1);

    // Its mascot deleted, the choice is Berry's, and the picture of the mascot isn't used.
    forget();
    chosen = { mascotId: null, ground: "night" };
    start();
    expect(shown()).toHaveLength(0);
  });

  it("leaves the shipped icon with nothing kept, or a kept file that isn't a picture", () => {
    start();
    writeFileSync(join(folder, "app-icon.json"), JSON.stringify(scout));
    writeFileSync(join(folder, "app-icon.png"), "not a picture");
    start();
    expect(shown()).toHaveLength(0);
  });
});
