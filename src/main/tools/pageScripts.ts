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

export interface ListOptions {
  query?: string;
  limit: number;
  // Also pictures and text, which are left out otherwise unless the query names them.
  everything?: boolean;
  // False in a frame `browserTools` runs this in by itself, which gets the frames inside it the same way.
  descend: boolean;
}

export const listElements = ({ query, limit, everything = false, descend }: ListOptions): string =>
  inPage(page.listElements, { query: query?.toLowerCase() ?? "", limit, everything, descend });

export const describeElement = (ref: string): string => inPage(page.describeElement, { ref });

// Scrolled to it and ready for a real click. `arm: false` is only for finding out where it is, with no watch set on the page.
export const aimClick = (ref: string, mayScroll: boolean, arm = true): string => inPage(page.aimClick, { ref, mayScroll, arm });

// False until the input arrives, then true, or "missed" for a press that was stopped. A new page has no record, so
// null means the input took the page somewhere.
export const inputLanded = inPage(page.inputLanded, undefined);

export const scriptedClick = (ref: string, clicks: 1 | 2): string => inPage(page.scriptedClick, { ref, clicks });

export const aimHover = (ref: string, mayScroll: boolean): string => inPage(page.aimHover, { ref, mayScroll });

export const spotOf = (ref: string): string => inPage(page.spotOf, { ref });

export const isHovered = (ref: string): string => inPage(page.isHovered, { ref });

export const scriptedHover = (ref: string): string => inPage(page.scriptedHover, { ref });

export const planDrag = (ref: string, toRef: string): string => inPage(page.planDrag, { ref, toRef });

// Where a key would go, and set up to notice that it did.
export const aimKey = inPage(page.aimKey, undefined);

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
