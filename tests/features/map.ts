import type { Settings } from "../../src/shared/ipc";
import type { Drive } from "./driver";
import type { PhoneDrive } from "./phone";
import type { FakeModel } from "../fakeModel";
import { chatFeatures } from "./map/chat";
import { outsideFeatures } from "./map/outside";
import { pageFeatures } from "./map/pages";
import { windowFeatures } from "./map/window";

// Every feature a user can reach, as data: its name, the DESIGN.md section it's in, how to open it and the states worth
// seeing. `pnpm run drive` opens one, `pnpm run baseline` pictures them all, and tests/featureMap.spec.ts opens each
// once. Every state is reached through the app and the fakes, as a test would, never by drawing it by hand.

export type Theme = "light" | "dark";
export type LayoutMode = "vertical" | "horizontal";
export interface Look {
  theme: Theme;
  layout: LayoutMode;
  width: number;
}

// What a feature needs before the app starts.
export interface Needs {
  supabase?: boolean;
  // A headless Chrome standing in for the cloud browser.
  cloudBrowser?: boolean;
  // Starts with the first run instead of skipping it.
  firstRun?: boolean;
  // Starts with the starter mascots.
  starters?: boolean;
  settings?: Partial<Settings>;
  // Files to put in the profile, at the moment drive's clock starts at.
  profile?: (dir: string, now: number) => Promise<void> | void;
  // More environment for the app, given the profile.
  env?: (dir: string) => Record<string, string>;
  // What the fake model answers from the start, for anything the app asks it at launch.
  model?: (model: FakeModel) => void;
}

interface FeatureState {
  // Opens the feature in this state and waits until it's there.
  open: (drive: Drive) => Promise<void>;
  // On top of the feature's own needs.
  needs?: Needs;
  // The window to picture, by a view it holds, when it isn't the feature's.
  window?: string;
}

interface FeatureBase {
  name: string;
  // The section of DESIGN.md it's drawn from.
  design: string;
  // Which layouts change how it looks. "none" is outside the browser window, such as the desktop mascot.
  layouts: "both" | LayoutMode | "none";
}

// A feature of the app, opened in the built app with the fakes behind it.
interface AppFeature extends FeatureBase {
  surface?: "app";
  // The window to picture, by a view it holds. The browser window, by its chrome view, unless it says otherwise.
  window?: string;
  needs?: Needs;
  // The first state is the one opened when none is named.
  states: Record<string, FeatureState>;
}

// The phone page in site/app/, in a browser at a phone's size against the fake Supabase.
interface PhoneFeature extends FeatureBase {
  surface: "phone";
  layouts: "none";
  states: Record<string, { open: (phone: PhoneDrive) => Promise<void> }>;
}

export type Feature = AppFeature | PhoneFeature;

export const FEATURES: Feature[] = [...chatFeatures, ...windowFeatures, ...pageFeatures, ...outsideFeatures];

export const featureNamed = (name: string): Feature | undefined => FEATURES.find((feature) => feature.name === name);

// The layouts a feature is pictured in by `baseline`.
export const layoutsOf = (feature: Feature): [LayoutMode, ...LayoutMode[]] =>
  feature.layouts === "both" ? ["vertical", "horizontal"] : feature.layouts === "none" ? ["vertical"] : [feature.layouts];
