import { describe, expect, it, vi } from "vitest";
import { DesktopParts } from "./DesktopParts";
import type { DesktopBerryHost } from "./DesktopBerry";
import { DEFAULT_SETTINGS } from "../settings/SettingsStore";
import { BERRY } from "../../shared/mascots";
import type { LibrarySnapshot } from "../../shared/library";
import type { ChromeView } from "../window/chromeView";

const display = { id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } };
vi.mock("electron", () => ({
  BaseWindow: class {},
  globalShortcut: {},
  screen: { getAllDisplays: () => [display], getDisplayNearestPoint: () => display, getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
}));
vi.mock("../window/chromeView", () => ({}));
vi.mock("../menus/MenuView", () => ({}));
const sent = vi.hoisted(() => [] as string[]);
vi.mock("../window/ipc", () => ({ sendToRenderer: (_: unknown, channel: string) => sent.push(channel) }));

const library = { pinned: [], bookmarks: [], chats: [], routines: [], mascots: [BERRY], needsYou: [], memory: { facts: [], offers: [] } };

describe("DesktopParts.publish", () => {
  it("reads the library once for the drop and the open panel together", () => {
    let reads = 0;
    const host = {
      settings: () => ({ ...DEFAULT_SETTINGS, desktopBerry: true, onboarded: true }),
      library: (): LibrarySnapshot => {
        reads++;
        return library;
      },
      mascot: () => BERRY,
      nameOf: () => "Berry",
      stillMotion: () => false,
      progress: () => ({ step: null, since: null }),
      recentJobs: () => [],
      cloud: () => ({ runner: false, cloud: false }),
    } as unknown as DesktopBerryHost;
    const parts = new DesktopParts(host);
    const view = { view: { webContents: {} } } as unknown as ChromeView;
    parts.view = view;
    parts.panel = view;
    parts.composer.panelOpen = "sheets";
    parts.composer.trayOpen = true;

    parts.publish();

    expect(sent).toEqual(["desktop:state", "desktop:panel-state"]);
    expect(reads).toBe(1);
  });
});
