// Part of the IPC contract (ipc.ts): the mascot on the edge of the screen, its prompt box, tray and ask.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { HandoffNeed, MascotLook } from "../library";
import type { Point } from "./window";

export type DesktopEdge = "bottom" | "top" | "left" | "right";

export interface DesktopBerrySpot {
  displayId: number;
  edge: DesktopEdge;
  // How far along that edge, from 0 to 1. Each end is a corner.
  fraction: number;
}

// A mascot as the desktop draws it, in the mood it's in.
export interface DesktopFace {
  name: string;
  look: MascotLook;
  mood: "rest" | "fetching" | "asking" | "delivered" | "oops";
}

// What the drop says besides its faces. Main decides all of it. What comes out by itself, asking and finished, never
// has a site, a step or the exact words of an approval in it: only who and what kind of thing, and a finished reply's
// own first sentence.
export type DesktopDropSays =
  | { kind: "rest" }
  // Pointed at with nothing going on: what a press does, with the shortcut's keys if it's ours.
  | { kind: "job"; shortcut: boolean }
  // Pointed at while one job works: its name and when it started.
  | { kind: "working"; title: string; since: number | null }
  // Pointed at with several things going: "2 working", "1 finished".
  | { kind: "counts"; counts: string[] }
  // Something needs you, with Answer.
  | { kind: "asking"; words: string }
  // A job ended while you were away, with Open and a cross.
  | { kind: "finished"; text: string };

// Everything the drop's view draws. The view never names a chat or an approval: a press only says which part.
export interface DesktopDropState {
  // False while it goes back into the edge, just before the window hides.
  shown: boolean;
  // Goes up each time the window moves or changes size, when anything in it jumps rather than gliding.
  frame: number;
  // The window's top left on the screen.
  origin: Point;
  edge: DesktopEdge;
  // The middle of the drop on the edge, in the window.
  anchor: Point;
  dragging: boolean;
  // Up to three, the one with the most to say first.
  faces: DesktopFace[];
  // Something is working, so the pips move beside the faces.
  working: boolean;
  says: DesktopDropSays;
  showBerry: boolean;
  still: boolean;
}

// What a press on the drop was on.
export type DesktopDropPart = "drop" | "answer" | "open" | "dismiss";

// The prompt box: who goes, where, and jobs sent before, whose words go in the box.
export interface DesktopBox {
  chosen: { id: string; name: string; look: MascotLook };
  mascots: Array<{ id: string; name: string; look: MascotLook }>;
  // This computer or the cloud, where the chosen mascot can work there, and which it starts on.
  cloud: { fits: boolean; on: boolean };
  recent: Array<{ label: string; prompt: string }>;
  shortcut: boolean;
}

// The tray's rows carry a key main made for this one showing, never a chat's or an approval's id.
export interface DesktopTray {
  mascots: Array<DesktopFace & { chosen: boolean }>;
  asks: Array<DesktopFace & { key: string; words: string; since: number }>;
  working: Array<DesktopFace & { key: string; title: string; step: string | null; since: number | null }>;
  finished: Array<DesktopFace & { key: string; title: string; problem: string | null; at: number }>;
}

// The ask, only ever after Answer was pressed: the exact words, which are what's being allowed.
export interface DesktopAsk {
  // Made by main for this one showing, and sent back with a decision. It says nothing of the chat or the approval.
  key: string;
  face: DesktopFace;
  kind: "approval" | "question" | "handoff";
  // The tool's exact words, or the question.
  text: string;
  answers: string[];
  handoff: { need: HandoffNeed; site: string } | null;
  // What job it's for.
  job: string;
  // What happened, for a moment after it was answered here, and then the sheet closes.
  said: string | null;
}

// The window that can take the keyboard: the prompt box, or the tray and the ask beside the drop.
export interface DesktopPanelState {
  open: "box" | "sheets" | null;
  // Goes up each time it opens, so the view grows it again and puts the keyboard in it.
  opened: number;
  // Going away, for as long as the view takes to shrink it.
  closing: boolean;
  edge: DesktopEdge;
  // The middle of the drop on the edge, in this window.
  anchor: Point;
  box: DesktopBox;
  tray: DesktopTray | null;
  ask: DesktopAsk | null;
  showBerry: boolean;
  still: boolean;
}

// An answer from the ask, with the key of the showing it was pressed on. Main applies it to the ask it showed under
// that key, and only once.
export interface DesktopDecision {
  key: string;
  allow: boolean;
  answer?: string;
}

// "done" went through. "gone" means that ask isn't the one waiting or the one showing any more, or was answered here already. "code" is an
// answer shaped like a code, which isn't sent.
export type DesktopDecided = "done" | "gone" | "code";
