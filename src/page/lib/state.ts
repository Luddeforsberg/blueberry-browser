import type { PageElement } from "./dom";

// What the tools keep in the page between scripts: each element they've listed by its ref, and whether real input
// arrived. It lives in the isolated world, so the page can't see it or swap what a ref points to.
export interface ToolState {
  next: number;
  byRef: Map<string, PageElement>;
  refs: WeakMap<Element, string>;
  // False until the input arrives, then true, "missed" for a press that was stopped, or "cut" for one that reached
  // the element before the rest of the click was stopped.
  landed?: boolean | "missed" | "cut";
  stopWatching?: (() => void) | null;
}

declare global {
  var __berry: ToolState | undefined;
}

export const state: ToolState = (globalThis.__berry ??= { next: 1, byRef: new Map(), refs: new WeakMap() });

export const withElement = <T>(ref: string, act: (el: PageElement) => T): T | null => {
  const el = state.byRef.get(ref);
  if (!el || !el.isConnected) return null;
  return act(el);
};
