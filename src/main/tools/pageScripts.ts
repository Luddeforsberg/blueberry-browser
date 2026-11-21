// Scripts for `Tab.runInPage`, which keeps them in an isolated world. They share the page's DOM, but the
// page can't see or change their variables, so it can't swap what a ref points to. The code is in src/page, bundled
// into pageCode.ts, and each script here is one of those functions called with its arguments as JSON.
import * as page from "./pageCode";
import type { PageScript } from "./pageCode";

export type { Aim, DragPlan } from "../../page/tools/click";
export type { FocusInfo } from "../../page/tools/keys";

// A fixed function and its arguments as data, so nothing from a page or the model is ever part of the code.
export const inPage = <Args>(script: PageScript<Args>, args: NoInfer<Args>): string =>
  `(${script.code})(${args === undefined ? "" : JSON.stringify(args)})`;

// Answers once a tab parked for its picture has been shown and drawn there.
export const drawnWhereParked = (): string => inPage(page.framesPassed, { shown: true });

export interface ListOptions {
  query?: string | undefined;
  limit: number;
  // Also pictures and text, which are left out otherwise unless the query names them.
  everything?: boolean | undefined;
  // False in a frame `browserTools` runs this in by itself, which gets the frames inside it the same way.
  descend: boolean;
}

export const listElements = ({ query, limit, everything = false, descend }: ListOptions): string =>
  inPage(page.listElements, { query: query?.toLowerCase() ?? "", limit, everything, descend });

export const describeElement = (ref: string): string => inPage(page.describeElement, { ref });

// Scrolled to it and ready for a real click. It sets no watch on the page: `watchPress` does, just before the press.
export const aimClick = (ref: string, mayScroll: boolean): string => inPage(page.aimClick, { ref, mayScroll });

// Checks the point still reaches the element and watches for the press, just before it goes. Null if the element has
// gone. A drag's watch only guards its press.
export const watchPress = (ref: string, { x, y }: { x: number; y: number }, pressOnly = false): string =>
  inPage(page.watchPress, { ref, x, y, pressOnly });

// Ends the watch `watchPress` set, however the press went, and no other.
export const endWatch = (id: string): string => inPage(page.endWatch, { id });

// False until the key `aimKey` or `aimKeyAt` set up for arrives, then true, or "missed" if it was stopped on its way
// somewhere else. A new page has no record, so null means the key took the page somewhere.
export const keyLanded = inPage(page.keyLanded, undefined);

// Ends the watch for a key that never came.
export const endKeyWatch = inPage(page.endKeyWatch, undefined);

// What became of the press the watch `id` was set for, ending that watch once it's known, or "ended" if it ended first.
export const pressLanded = (id: string): string => inPage(page.pressLanded, { id });

export const scriptedClick = (ref: string, clicks: 1 | 2): string => inPage(page.scriptedClick, { ref, clicks });

export const aimHover = (ref: string, mayScroll: boolean): string => inPage(page.aimHover, { ref, mayScroll });

export const spotOf = (ref: string): string => inPage(page.spotOf, { ref });

export const isHovered = (ref: string): string => inPage(page.isHovered, { ref });

export const scriptedHover = (ref: string): string => inPage(page.scriptedHover, { ref });

export const planDrag = (ref: string, toRef: string): string => inPage(page.planDrag, { ref, toRef });

// Where a key would go, and set up to notice that it did.
export const aimKey = inPage(page.aimKey, undefined);

// Set up for a key that goes only to this element, if the focus is on it, and is stopped anywhere else. False if the
// focus is elsewhere, null if the element has gone.
export const aimKeyAt = (ref: string): string => inPage(page.aimKeyAt, { ref });

export const typeIntoElement = (ref: string, text: string): string => inPage(page.typeIntoElement, { ref, text });

export const beginTyping = (ref: string): string => inPage(page.beginTyping, { ref });

export const typeChunk = (ref: string, chunk: string): string => inPage(page.typeChunk, { ref, chunk });

export const finishTyping = (ref: string, text: string): string => inPage(page.finishTyping, { ref, text });

export const hasFocus = (ref: string): string => inPage(page.hasFocus, { ref });

export const scriptedEnter = (ref: string): string => inPage(page.scriptedEnter, { ref });

export const describeOption = (ref: string, option: string): string => inPage(page.describeOption, { ref, option });

export const chooseOption = (ref: string, option: string): string => inPage(page.chooseOption, { ref, option });

export const selectedOptions = (ref: string): string => inPage(page.selectedOptions, { ref });

export const scrollPage = (direction: "up" | "down", smooth = false): string => inPage(page.scrollPage, { direction, smooth });

// For typing a code from the phone, which `codeEntry.ts` does. These scripts never hold the code.
export const listCodeFields = inPage(page.listCodeFields, undefined);

export const focusCodeField = (index: number, keepValue = false): string => inPage(page.focusCodeField, { index, keepValue });

export const codeFieldFocus = inPage(page.codeFieldFocus, undefined);

export const codeFieldsFilled = (indexes: number[], length: number): string => inPage(page.codeFieldsFilled, { indexes, length });

export const watchCodeSubmit = inPage(page.watchCodeSubmit, undefined);

export const codeFieldsChanged = (indexes: number[]): string => inPage(page.codeFieldsChanged, { indexes });

export const pressCodeSubmit = (indexes: number[]): string => inPage(page.pressCodeSubmit, { indexes });

export const clearCodeFields = (indexes: number[]): string => inPage(page.clearCodeFields, { indexes });
