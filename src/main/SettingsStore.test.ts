import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsStore } from "./SettingsStore";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "blueberry-settings-")), "settings.json");

describe("sanitizeSettings", () => {
  it("falls back to the defaults for anything missing or invalid", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ layoutMode: "diagonal", appearance: 3, showBerry: "yes", chatWidth: "wide" })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("only accepts the two startup choices", () => {
    expect(sanitizeSettings({ onStartup: "fresh" }).onStartup).toBe("fresh");
    expect(sanitizeSettings({ onStartup: "restore" }, { ...DEFAULT_SETTINGS, onStartup: "fresh" }).onStartup).toBe("restore");
    expect(sanitizeSettings({ onStartup: "everything" }).onStartup).toBe("restore");
  });

  it("keeps valid values and clamps panel widths to their limits", () => {
    expect(
      sanitizeSettings({ layoutMode: "horizontal", appearance: "dark", sidebarWidth: 9999, chatWidth: 1 })
    ).toMatchObject({ layoutMode: "horizontal", appearance: "dark", sidebarWidth: 360, chatWidth: 320 });
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
});
