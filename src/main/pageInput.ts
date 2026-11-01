import type { Tab } from "./Tab";

// Real mouse and keyboard, which a page can't tell from a person's. They go to the tab's own view, so they don't
// move the user's pointer or take their focus, and a tab behind the chat gets them too. Electron's input doesn't
// reach a frame from another origin, so `browserTools` only aims these at the page and its same-origin frames.

const STEP_MS = 30;
const DRAG_STEPS = 8;
// About how long a real drag takes from press to release.
export const DRAG_MS = STEP_MS * (DRAG_STEPS + 1);
// How long a page gets to show that real input reached it.
const LANDED_MS = 500;
const LANDED_POLL_MS = 50;

export interface Point {
  x: number;
  y: number;
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The page measures in its own pixels, and a zoomed page draws them bigger.
const inView = (tab: Tab, { x, y }: Point) => {
  const zoom = tab.webContents.getZoomFactor();
  return { x: Math.round(x * zoom), y: Math.round(y * zoom) };
};

export const moveTo = async (tab: Tab, point: Point): Promise<void> => {
  const at = inView(tab, point);
  // The second move, a pixel on, is what makes some pages notice the pointer has arrived.
  tab.sendAgentInput({ type: "mouseMove", x: at.x - 1, y: at.y });
  await pause(STEP_MS);
  tab.sendAgentInput({ type: "mouseMove", x: at.x, y: at.y });
  await pause(STEP_MS);
};

const press = (tab: Tab, at: Point, clickCount: number) => {
  tab.sendAgentInput({ type: "mouseDown", button: "left", clickCount, ...at });
};

const release = (tab: Tab, at: Point, clickCount: number) => {
  tab.sendAgentInput({ type: "mouseUp", button: "left", clickCount, ...at });
};

// False if `goOn` said no just before a press, so nothing was clicked.
export const clickAt = async (tab: Tab, point: Point, clicks: 1 | 2, goOn: () => boolean = () => true): Promise<boolean> => {
  await moveTo(tab, point);
  const at = inView(tab, point);
  for (let count = 1; count <= clicks; count++) {
    if (!goOn()) return false;
    press(tab, at, count);
    await pause(STEP_MS);
    release(tab, at, count);
    await pause(STEP_MS);
  }
  return true;
};

export const dragBetween = async (tab: Tab, from: Point, to: Point): Promise<void> => {
  await moveTo(tab, from);
  const start = inView(tab, from);
  const end = inView(tab, to);
  press(tab, start, 1);
  await pause(STEP_MS);
  for (let step = 1; step <= DRAG_STEPS; step++) {
    const x = Math.round(start.x + ((end.x - start.x) * step) / DRAG_STEPS);
    const y = Math.round(start.y + ((end.y - start.y) * step) / DRAG_STEPS);
    tab.sendAgentInput({ type: "mouseMove", x, y });
    await pause(STEP_MS);
  }
  release(tab, end, 1);
  await pause(STEP_MS);
};

// What the model may name, and the name Electron knows each by.
const NAMED_KEYS: Record<string, string> = {
  Enter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Space: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

export const KEY_NAMES = Object.keys(NAMED_KEYS);

// Moves the focus or the view, or closes something. None of it can send or change anything by itself.
const HARMLESS_KEYS = new Set(["Escape", "Tab", "Home", "End", "PageUp", "PageDown"]);

export const isHarmlessKey = (key: string): boolean => HARMLESS_KEYS.has(key);

// A single character counts as a key too. No Control or Command, because the app's own menu answers those
// when a page doesn't, and that includes closing the window and quitting.
export const isKnownKey = (key: string): boolean => key in NAMED_KEYS || [...key].length === 1;

export const pressKey = async (tab: Pick<Tab, "sendAgentInput">, key: string, shift: boolean): Promise<void> => {
  const keyCode = NAMED_KEYS[key] ?? key;
  const modifiers: "shift"[] = shift ? ["shift"] : [];
  tab.sendAgentInput({ type: "keyDown", keyCode, modifiers });
  // Without this a character isn't typed and Enter doesn't submit.
  if (keyCode === "Enter" || keyCode === "Space" || !(key in NAMED_KEYS)) {
    tab.sendAgentInput({ type: "char", keyCode: keyCode === "Space" ? " " : keyCode, modifiers });
  }
  await pause(STEP_MS);
  tab.sendAgentInput({ type: "keyUp", keyCode, modifiers });
  await pause(STEP_MS);
};

// "landed" once the page has reported it, or if `ask` can't answer, which means the input took it to a new page.
export const landed = async (ask: () => Promise<boolean | "missed" | null>): Promise<"landed" | "missed" | "lost"> => {
  for (let waited = 0; waited < LANDED_MS; waited += LANDED_POLL_MS) {
    const answer = await ask().catch(() => null);
    if (answer === "missed") return "missed";
    if (answer !== false) return "landed";
    await pause(LANDED_POLL_MS);
  }
  return "lost";
};
