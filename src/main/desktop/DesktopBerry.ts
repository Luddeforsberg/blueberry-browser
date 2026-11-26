import type { ChromeView } from "../window/chromeView";
import type { Rect } from "../window/Layout";
import type { DesktopTarget } from "./desktopBerryState";
import type { DesktopDecided, DesktopDropPart, DesktopDropState, DesktopPanelState, Settings, ThemeState } from "../../shared/ipc";
import type { LibrarySnapshot, MascotProfile, NeedsYouItem } from "../../shared/library";
import { DesktopParts } from "./DesktopParts";

export interface DesktopBerryHost {
  settings: () => Settings;
  update: (patch: Partial<Settings>) => void;
  library: () => LibrarySnapshot;
  mascot: (id: string | null) => MascotProfile;
  nameOf: (mascotId: string) => string;
  // Blueberry's window is what the user is using, so the drop isn't needed.
  inFront: () => boolean;
  stillMotion: () => boolean;
  theme: () => ThemeState;
  // A chat that has just ended. Null if the user stopped it or it's gone.
  ended: (chatId: string) => { mascotId: string; title: string; text: string; error: string | null } | null;
  chatOnScreen: (chatId: string) => boolean;
  // A working chat's latest step and when its reply began, for the tray and the drop pointed at.
  progress: (chatId: string) => { step: string | null; since: number | null };
  // Jobs the user sent before, newest first, as chips over the box.
  recentJobs: () => Array<{ label: string; prompt: string }>;
  // Whether the cloud runner or a cloud browser can take a job.
  cloud: () => { runner: boolean; cloud: boolean };
  send: (text: string, mascotId: string, where: { runner: boolean; cloud: boolean }) => boolean;
  // The same as Needs you's `chat:decide`.
  decide: (chatId: string, approvalId: string, allow: boolean, answer?: string) => boolean;
  open: (target: DesktopTarget) => void;
  // The tab an ask is about, or its chat or routine when it has none here.
  seePage: (item: NeedsYouItem) => void;
  showBlueberry: () => void;
}

// The mascot on the edge of the screen while the user is in other apps: a drop that says what the mascots are doing, a
// prompt box that's the drop grown, the tray and the ask. All it can do is start a chat with no page, answer what Needs
// you answers, the same way, and open Blueberry. It never reads the screen, other apps or the clipboard, and there's no
// route from a tool to here.
//
// Two windows make it. The drop's own lets clicks through everywhere but the drop, never takes the keyboard, and keeps
// one size wherever it stands, so the drop grows and shrinks inside it and nothing native moves. The panel is the window
// that can take the keyboard without bringing Blueberry forward: it draws the prompt box, starting from the drop's own
// size at the drop's own place and growing from there, over the drop, so the two read as one shape, or the tray and the
// ask beside it. It changes size only before it shows and between one thing and the next, never while anything moves.
//
// This is only what callers see: every method hands the call to a part in `DesktopParts`.
export class DesktopBerry {
  private readonly parts: DesktopParts;

  constructor(host: DesktopBerryHost) {
    this.parts = new DesktopParts(host);
  }

  get chromeView(): ChromeView | null {
    return this.parts.view;
  }
  get composerView(): ChromeView | null {
    return this.parts.panel;
  }
  get menuView(): DesktopParts["menus"] {
    return this.parts.menus;
  }
  get shortcutTaken(): boolean {
    return this.parts.shortcutTaken;
  }
  sync(): void {
    this.parts.sync();
  }
  destroy(): void {
    this.parts.destroy();
  }
  notifyTheme(): void {
    this.parts.notifyTheme();
  }

  // The drop.
  mainWindowGone(): void {
    this.parts.drop.mainWindowGone();
  }
  mainWindowBlurred(): void {
    this.parts.drop.mainWindowBlurred();
  }
  mainWindowFocused(): void {
    this.parts.drop.mainWindowFocused();
  }
  setDropBox(box: Rect, frame: number): void {
    this.parts.drop.setDropBox(box, frame);
  }
  press(part: DesktopDropPart): void {
    this.parts.drop.press(part);
  }
  dragStart(): void {
    this.parts.drop.dragStart();
  }
  dragEnd(): void {
    this.parts.drop.dragEnd();
  }
  showMenu(): void {
    this.parts.drop.showMenu();
  }
  get state(): DesktopDropState {
    return this.parts.drop.stateOf(this.parts.host.library());
  }

  // The panel: the prompt box, the tray and the ask.
  openBox(): void {
    this.parts.composer.openBox();
  }
  setPanelHeight(height: number): void {
    this.parts.composer.setPanelHeight(height);
  }
  closePanel(): void {
    this.parts.composer.closePanel();
  }
  send(text: string, cloud: boolean): boolean {
    return this.parts.composer.send(text, cloud);
  }
  choose(mascotId: string): void {
    this.parts.composer.choose(mascotId);
  }
  openBlueberry(): void {
    this.parts.composer.openBlueberry();
  }
  trayPress(key: string): void {
    this.parts.composer.trayPress(key);
  }
  decide(decision: unknown): DesktopDecided {
    return this.parts.composer.decide(decision);
  }
  seePage(): void {
    this.parts.composer.seePage();
  }
  get panelState(): DesktopPanelState {
    return this.parts.composer.panelStateOf(this.parts.host.library());
  }

  // What the jobs have done.
  libraryChanged(library: LibrarySnapshot): void {
    this.parts.news.libraryChanged(library);
  }
}
