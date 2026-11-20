import type { PageElement } from "./dom";

// What the tools keep in the page between scripts: each element they've listed by its ref, and whether real input
// arrived. It lives in the isolated world, so the page can't see it or swap what a ref points to. Refs hold their
// elements weakly, so rows a page has thrown away aren't kept alive by having once been listed.
export interface ToolState {
  next: number;
  byRef: Map<string, WeakRef<PageElement>>;
  refs: WeakMap<Element, string>;
  // False until the input arrives, then true, "missed" for a press that was stopped, or "cut" for one that reached
  // the element before the rest of the click was stopped.
  landed?: boolean | "missed" | "cut";
  // False until a key arrives, then true, or "missed" for one aimed at an element that was stopped elsewhere. Apart from
  // `landed`, so a key never answers for a click.
  keyed?: boolean | "missed";
  stopKeyWatch?: (() => void) | null;
  stopWatching?: (() => void) | null;
  // The id of the watch on, which whoever set it ends with.
  watch?: string | null;
}

declare global {
  var __berry: ToolState | undefined;
}

export const state: ToolState = (globalThis.__berry ??= { next: 1, byRef: new Map(), refs: new WeakMap() });

// The element a ref names, while it's still on the page.
export const elementOf = (ref: string): PageElement | null => {
  const el = state.byRef.get(ref)?.deref();
  return el?.isConnected ? el : null;
};

export const withElement = <T>(ref: string, act: (el: PageElement) => T): T | null => {
  const el = elementOf(ref);
  return el ? act(el) : null;
};

// A ref for each element, the same one for as long as it lives, and never one another element had.
export const refFor = (el: PageElement): string => {
  let ref = state.refs.get(el);
  if (!ref) {
    ref = "e" + state.next++;
    state.refs.set(el, ref);
  }
  if (state.byRef.get(ref)?.deref() !== el) state.byRef.set(ref, new WeakRef(el));
  return ref;
};

// Lets go of refs whose elements are off the page, or gone. One that comes back gets its ref again when it's next listed.
export const forgetDetached = (): void => {
  for (const [ref, held] of state.byRef) if (!held.deref()?.isConnected) state.byRef.delete(ref);
};
