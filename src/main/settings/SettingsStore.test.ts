import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsStore } from "./SettingsStore";
import { ACCOUNT_NAME_MAX } from "../../shared/accountName";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "blueberry-settings-")), "settings.json");

describe("sanitizeSettings", () => {
  it("keeps the mascot on pages on unless it's really turned off", () => {
    expect(DEFAULT_SETTINGS.mascotOnPages).toBe(true);
    expect(sanitizeSettings({ mascotOnPages: false }).mascotOnPages).toBe(false);
    expect(sanitizeSettings({ mascotOnPages: "no" }).mascotOnPages).toBe(true);
  });

  it("falls back to the defaults for anything missing or invalid", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ layoutMode: "diagonal", appearance: 3, showBerry: "yes", chatWidth: "wide" })).toEqual(DEFAULT_SETTINGS);
  });

  it("only accepts the two startup choices", () => {
    expect(sanitizeSettings({ onStartup: "fresh" }).onStartup).toBe("fresh");
    expect(sanitizeSettings({ onStartup: "restore" }, { ...DEFAULT_SETTINGS, onStartup: "fresh" }).onStartup).toBe("restore");
    expect(sanitizeSettings({ onStartup: "everything" }).onStartup).toBe("restore");
  });

  it("keeps valid values and clamps panel widths to their limits", () => {
    expect(sanitizeSettings({ layoutMode: "horizontal", appearance: "dark", sidebarWidth: 9999, chatWidth: 1 })).toMatchObject({
      layoutMode: "horizontal",
      appearance: "dark",
      sidebarWidth: 360,
      chatWidth: 320,
    });
  });
});

describe("accountName", () => {
  const named = { ...DEFAULT_SETTINGS, accountName: "Alex" };

  it("starts with none, and keeps a name trimmed", () => {
    expect(DEFAULT_SETTINGS.accountName).toBeNull();
    expect(sanitizeSettings({ accountName: "  Alex Lind " }).accountName).toBe("Alex Lind");
  });

  it("clears it for nothing, or only spaces", () => {
    expect(sanitizeSettings({ accountName: null }, named).accountName).toBeNull();
    expect(sanitizeSettings({ accountName: "" }, named).accountName).toBeNull();
    expect(sanitizeSettings({ accountName: "   " }, named).accountName).toBeNull();
  });

  it("takes one character up to the limit, counting what's drawn rather than code units, and keeps the old name past it", () => {
    expect(sanitizeSettings({ accountName: "A" }).accountName).toBe("A");
    expect(sanitizeSettings({ accountName: "a".repeat(ACCOUNT_NAME_MAX) }).accountName).toBe("a".repeat(ACCOUNT_NAME_MAX));
    expect(sanitizeSettings({ accountName: "🫐".repeat(ACCOUNT_NAME_MAX) }).accountName).toBe("🫐".repeat(ACCOUNT_NAME_MAX));
    expect(sanitizeSettings({ accountName: "a".repeat(ACCOUNT_NAME_MAX + 1) }, named).accountName).toBe("Alex");
  });

  it("refuses control characters and line breaks, and anything not a string", () => {
    for (const accountName of ["Al\nex", "Al\u0000ex", "Al\u001bex", "Al\u2028ex", "Al\u0085ex", 42, {}]) {
      expect(sanitizeSettings({ accountName }, named).accountName).toBe("Alex");
    }
  });
});

describe("downloadFolder", () => {
  it("keeps null and absolute paths, and refuses anything else", () => {
    const base = { ...DEFAULT_SETTINGS, downloadFolder: "/kept" };
    expect(sanitizeSettings({ downloadFolder: null }, base).downloadFolder).toBeNull();
    expect(sanitizeSettings({ downloadFolder: "/new/place" }, base).downloadFolder).toBe("/new/place");
    expect(sanitizeSettings({}, base).downloadFolder).toBe("/kept");
    for (const bad of ["", "relative/path", "/nul\0byte", 3, {}]) {
      expect(sanitizeSettings({ downloadFolder: bad }, base).downloadFolder).toBe("/kept");
    }
  });
});

describe("the app icon", () => {
  const chosen = { ...DEFAULT_SETTINGS, appIconMascotId: "4b0c6a5e-1f2d-4c3b-9a8e-7d6c5b4a3f21", appIconGround: "glow" as const };

  it("starts as Berry on Paper, and keeps a mascot's id and any of the four grounds", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ appIconMascotId: null, appIconGround: "paper" });
    expect(sanitizeSettings({ appIconMascotId: chosen.appIconMascotId, appIconGround: "night" })).toMatchObject({
      appIconMascotId: chosen.appIconMascotId,
      appIconGround: "night",
    });
    for (const ground of ["paper", "night", "colour", "glow"])
      expect(sanitizeSettings({ appIconGround: ground }).appIconGround).toBe(ground);
  });

  it("takes Berry's own id, or null, as Berry", () => {
    expect(sanitizeSettings({ appIconMascotId: "berry" }, chosen).appIconMascotId).toBeNull();
    expect(sanitizeSettings({ appIconMascotId: null }, chosen).appIconMascotId).toBeNull();
  });

  it("keeps what it had for anything that isn't an id or a ground", () => {
    for (const appIconMascotId of ["", "a".repeat(65), "../mascots.json", "id with spaces", 7, {}]) {
      expect(sanitizeSettings({ appIconMascotId }, chosen).appIconMascotId).toBe(chosen.appIconMascotId);
    }
    expect(sanitizeSettings({ appIconMascotId: "a".repeat(64) }, chosen).appIconMascotId).toBe("a".repeat(64));
    for (const appIconGround of ["", "Paper", "colour ", "plum", null]) {
      expect(sanitizeSettings({ appIconGround }, chosen).appIconGround).toBe("glow");
    }
  });
});

describe("SettingsStore", () => {
  it("survives a missing or corrupt file", () => {
    const file = tempFile();
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);

    writeFileSync(file, "{ not json");
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("saves updates so the next start reads them back", () => {
    const file = tempFile();
    const store = new SettingsStore(file);

    store.update({ layoutMode: "horizontal", sidebarWidth: 300 });
    store.flush();

    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ layoutMode: "horizontal" });
    expect(new SettingsStore(file).get()).toMatchObject({ layoutMode: "horizontal", sidebarWidth: 300 });
  });

  it("reads the mascot on pages from its old key, and saves it only under the new one", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({ birdOnPages: false }));
    const store = new SettingsStore(file);
    expect(store.get().mascotOnPages).toBe(false);

    store.update({ showBerry: false });
    store.flush();
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(saved.mascotOnPages).toBe(false);
    expect(saved).not.toHaveProperty("birdOnPages");

    // The new key wins, and an old file with both reads the new one.
    expect(sanitizeSettings({ mascotOnPages: true, birdOnPages: false }).mascotOnPages).toBe(true);
    expect(sanitizeSettings({ mascotOnPages: false }).mascotOnPages).toBe(false);
  });

  it("keeps the desktop mascot on the edge, and refuses anything that isn't a place", () => {
    const spot = (desktopBerrySpot: unknown) => sanitizeSettings({ desktopBerrySpot }).desktopBerrySpot;
    expect(spot({ displayId: 1, edge: "top", fraction: 0 })).toEqual({ displayId: 1, edge: "top", fraction: 0 });
    expect(spot({ displayId: 1, edge: "left", fraction: 1 })).toEqual({ displayId: 1, edge: "left", fraction: 1 });
    expect(spot({ displayId: 1, edge: "right", fraction: 1.5 })).toEqual({ displayId: 1, edge: "right", fraction: 1 });
    expect(spot({ displayId: 1, edge: "bottom", fraction: -1 })).toEqual({ displayId: 1, edge: "bottom", fraction: 0 });
    // Saved before it could stand anywhere else, or with an edge there's no such thing as.
    expect(spot({ displayId: 1, fraction: 0.5 })).toEqual({ displayId: 1, edge: "bottom", fraction: 0.5 });
    expect(spot({ displayId: 1, edge: "middle", fraction: 0.5 })).toEqual({ displayId: 1, edge: "bottom", fraction: 0.5 });
    expect(spot({ displayId: "1", fraction: 0.5 })).toBeNull();
    expect(spot({ displayId: 1, fraction: Infinity })).toBeNull();
    expect(spot(null)).toBeNull();
    expect(spot(undefined)).toBeNull();
  });
});
