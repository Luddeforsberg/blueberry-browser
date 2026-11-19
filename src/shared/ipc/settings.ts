// Part of the IPC contract (ipc.ts): the saved settings.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { AppIconGround } from "../appIcon";
import type { FirstJob, FirstRunStep } from "../firstRun";
import type { DesktopBerrySpot } from "./desktop";
import type { LayoutMode } from "./window";

export type Appearance = "system" | "light" | "dark";

// When Berry stops to ask before acting on a page.
export type ActionApproval = "risky" | "always" | "never";

// What the app opens with: the tabs from last time, or just a new tab.
export type StartupChoice = "restore" | "fresh";

// Saved in the main process and kept across restarts.
export interface Settings {
  layoutMode: LayoutMode;
  appearance: Appearance;
  sidebarWidth: number;
  chatWidth: number;
  showBerry: boolean;
  keepBerryStill: boolean;
  // Whether the working mascot is drawn on the page it works in. Off is for a site that reacts badly.
  mascotOnPages: boolean;
  actionApproval: ActionApproval;
  // An absolute path, or null for the system's Downloads folder.
  downloadFolder: string | null;
  askWhereToSave: boolean;
  onStartup: StartupChoice;
  // False until the first run is finished.
  onboarded: boolean;
  // First run steps already passed, so leaving part way starts again at the first one that isn't done.
  firstRun: FirstRunStep[];
  // The rows First jobs shows on the new tab, set when the first run ends. Empty once hidden, and for anyone whose first
  // run came before it.
  firstJobs: FirstJob[];
  // What main has seen really happen: a key saved, history brought in, a message sent, a chat with Plain Words.
  firstJobsDone: FirstJob[];
  // Whether this profile has had its starter mascots, or never needed them. Once true, they never come back.
  startersAdded: boolean;
  // Page zoom in percent, by site. Sites at 100% aren't listed.
  siteZoom: Record<string, number>;
  // Whether the new tab page offers what it noticed you repeat. Off means no model call.
  suggestions: boolean;
  // Whether a mascot may offer to remember something after a job. Off means no model call. What's kept stays in use.
  memoryOffers: boolean;
  // Send to the phone even while the user is at the computer, for filming and trying it out.
  phoneAlways: boolean;
  // Who the next new chat runs as. Null is Berry.
  chosenMascotId: string | null;
  // The mascot on the edge of the screen, and the shortcut that opens its composer.
  desktopBerry: boolean;
  // Where along the edge it stands, from 0 to 1. Null until it's been dragged.
  desktopBerrySpot: DesktopBerrySpot | null;
  // Jobs from ChatGPT or Claude, through the relay, run in this Blueberry while it's open, instead of in the cloud.
  relayOnMac: boolean;
  // What the account menu and Account call you. Only ever on this computer: never sent, prompted or published.
  accountName: string | null;
  // Whose face is on the app's icon, null for Berry, and what's behind it.
  appIconMascotId: string | null;
  appIconGround: AppIconGround;
}
