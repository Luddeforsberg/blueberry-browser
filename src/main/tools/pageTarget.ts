import type { TabLoadError, TabTrouble } from "../../shared/ipc";
import type { PageActor } from "./PageActor";
import type { Outcome } from "./pageInput";

// What Berry's tools need from a tab, and nothing more. `Tab` is the Electron one, and `CdpTab` is a page in a browser
// reached over the Chrome DevTools Protocol, such as one in the cloud. Types only, so the tools load in plain Node.
// Anything that acts says how it went, never hiding that the browser turned it down: it rejects, or answers the action's
// `Outcome` (`pageInput.ts`) where an answer that never came has to be told apart from a no.

// A frame from another origin. Its scripts run in its own page's world, so nothing it says about itself is believed.
export interface PageFrame {
  readonly origin: string;
  isDestroyed(): boolean;
}

// Real mouse and keyboard, in the page's own pixels. Key names are Electron's, which `pageInput.ts` uses.
export type AgentInput =
  | { type: "mouseMove" | "mouseDown" | "mouseUp"; x: number; y: number; button?: "left"; clickCount?: number }
  | { type: "keyDown" | "keyUp" | "char"; keyCode: string; modifiers?: "shift"[] };

export interface PageTarget {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly isLoading: boolean;
  readonly trouble: TabTrouble | null;
  readonly loadError: TabLoadError | null;
  readonly canGoBack: boolean;
  // Where going back would land.
  readonly backUrl: string | null;
  // A code from the phone went in, so no picture of it may go to the model for now.
  readonly mayShowCode: boolean;
  // How much bigger the page draws its pixels.
  readonly zoomFactor: number;
  // The mascot drawn on the page. Null where there's nobody to see one, as in a browser in the cloud.
  readonly actor: PageActor | null;

  // In a world of its own, which shares the page's DOM but not its variables, and stays the same world for a document.
  runInPage<T = unknown>(code: string): Promise<T>;
  readonly foreignFrames: PageFrame[];
  runInFrame<T = unknown>(frame: PageFrame, code: string): Promise<T>;
  // The page and what's in its frames, each frame labelled with where it really comes from.
  getTextWithFrames(allowsFrame: (origin: string) => boolean): Promise<string>;
  // A JPEG of what's on screen, no wider than `maxWidth`, or null if nothing has been drawn yet. Rejects if the user was
  // handed the tab, or a code went in, at any point while it was being taken.
  screenshotJpeg(maxWidth: number, quality: number): Promise<Buffer | null>;
  sendAgentInput(event: AgentInput): void | Promise<void>;

  loadURL(url: string): Promise<void>;
  // Berry going back, which leaves the tab the job's. Anything else going back is the user.
  agentGoBack(): Promise<Outcome>;
  // Waits for whatever an action started to load, within reason.
  settled(): Promise<void>;
  // For as long as `act` runs, the page can't take this tab anywhere `allows` says no to. Says which addresses it stopped.
  // `act` only runs once the limit is on, and if it can't be put on this rejects without running it.
  withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }>;
}
