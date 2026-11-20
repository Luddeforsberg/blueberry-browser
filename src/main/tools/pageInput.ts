import type { PageTarget } from "./pageTarget";

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
const inView = (tab: PageTarget, { x, y }: Point) => {
  const zoom = tab.zoomFactor;
  return { x: Math.round(x * zoom), y: Math.round(y * zoom) };
};

export const moveTo = async (tab: PageTarget, point: Point): Promise<void> => {
  const at = inView(tab, point);
  // The second move, a pixel on, is what makes some pages notice the pointer has arrived.
  await tab.sendAgentInput({ type: "mouseMove", x: at.x - 1, y: at.y });
  await pause(STEP_MS);
  await tab.sendAgentInput({ type: "mouseMove", x: at.x, y: at.y });
  await pause(STEP_MS);
};

const press = async (tab: PageTarget, at: Point, clickCount: number) => {
  await tab.sendAgentInput({ type: "mouseDown", button: "left", clickCount, ...at });
};

const release = async (tab: PageTarget, at: Point, clickCount: number) => {
  await tab.sendAgentInput({ type: "mouseUp", button: "left", clickCount, ...at });
};

// One press and release, the `count`th of a click, with the pointer already there.
export const pressAt = async (tab: PageTarget, point: Point, count: number): Promise<void> => {
  const at = inView(tab, point);
  await press(tab, at, count);
  await pause(STEP_MS);
  await release(tab, at, count);
  await pause(STEP_MS);
};

// With the pointer already at `from`.
export const dragBetween = async (tab: PageTarget, from: Point, to: Point): Promise<void> => {
  const start = inView(tab, from);
  const end = inView(tab, to);
  await press(tab, start, 1);
  await pause(STEP_MS);
  for (let step = 1; step <= DRAG_STEPS; step++) {
    const x = Math.round(start.x + ((end.x - start.x) * step) / DRAG_STEPS);
    const y = Math.round(start.y + ((end.y - start.y) * step) / DRAG_STEPS);
    await tab.sendAgentInput({ type: "mouseMove", x, y });
    await pause(STEP_MS);
  }
  await release(tab, end, 1);
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

export const pressKey = async (tab: Pick<PageTarget, "sendAgentInput">, key: string, shift: boolean): Promise<void> => {
  const keyCode = NAMED_KEYS[key] ?? key;
  const modifiers: "shift"[] = shift ? ["shift"] : [];
  await tab.sendAgentInput({ type: "keyDown", keyCode, modifiers });
  // Without this a character isn't typed and Enter doesn't submit.
  if (keyCode === "Enter" || keyCode === "Space" || !(key in NAMED_KEYS)) {
    await tab.sendAgentInput({ type: "char", keyCode: keyCode === "Space" ? " " : keyCode, modifiers });
  }
  await pause(STEP_MS);
  await tab.sendAgentInput({ type: "keyUp", keyCode, modifiers });
  await pause(STEP_MS);
};

// How a real action went, as the page showed it: "landed" it arrived, "missed" it reached nothing it was meant for,
// "cut" it reached it and the rest went elsewhere, "lost" nothing came back in time to say.
export type Arrival = "landed" | "missed" | "cut" | "lost";

// What Berry knows of any action on a page, and so what may follow it. Every tool that acts goes by this:
// - "confirmed": it happened. Done.
// - "refused": it's known not to have happened. It was never sent, the browser turned it down, or nothing it was meant
//   for received it. Only then may another try go for the same thing, real or scripted, since it can't do it twice.
// - "unknown": it went and nothing says whether it counted. Nothing more goes for it, only words, because a second try
//   would do it twice if the first arrived.
// A guard is an action too: nothing acts behind one that isn't confirmed.
export type Outcome = "confirmed" | "refused" | "unknown";

export const outcomeOf = (arrival: Arrival): Outcome => (arrival === "landed" ? "confirmed" : arrival === "missed" ? "refused" : "unknown");

const LATE = Symbol("late");

// `work`, or LATE once `ms` is up, whichever comes first.
const within = async <T>(work: Promise<T>, ms: number): Promise<T | typeof LATE> => {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
};

// "landed" once the page has reported it, or answers null, which only a new document does, so the input took the page
// somewhere. A page that can't answer, as while a new one replaces it, is asked again, and no answer in time is "lost".
// "ended" means the watch ended before it could say, so nobody knows. The time is the clock's, so a page that's slow to
// answer each question doesn't get longer: a question still out when it's up counts as no answer.
export const landed = async (ask: () => Promise<boolean | "missed" | "cut" | "ended" | null>): Promise<Arrival> => {
  const deadline = Date.now() + LANDED_MS;
  for (let left = LANDED_MS; left > 0; left = deadline - Date.now()) {
    const answer = await within(
      ask().catch(() => false as const),
      left,
    );
    if (answer === LATE || answer === "ended") return "lost";
    if (answer === "missed" || answer === "cut") return answer;
    if (answer !== false) return "landed";
    await pause(Math.min(LANDED_POLL_MS, Math.max(0, deadline - Date.now())));
  }
  return "lost";
};
