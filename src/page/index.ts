// Every script main runs in a page. `scripts/buildPage.mjs` bundles each export here by itself, with only what it uses,
// into src/main/tools/pageCode.ts, and main calls it with its arguments as JSON. Nothing here may import Node or Electron, and
// everything it does must work under a page's strict CSP and Trusted Types.
export { listElements, describeElement, spotOf } from "./tools/elements";
export { aimClick, watchPress, pressLanded, endWatch, scriptedClick, aimHover, isHovered, scriptedHover, planDrag } from "./tools/click";
export { aimKey, keyLanded, typeIntoElement, beginTyping, typeChunk, finishTyping, hasFocus, scriptedEnter } from "./tools/keys";
export { describeOption, chooseOption, selectedOptions } from "./tools/options";
export { scrollPage } from "./tools/scroll";
export {
  listCodeFields,
  focusCodeField,
  codeFieldFocus,
  codeFieldsFilled,
  watchCodeSubmit,
  codeFieldsChanged,
  pressCodeSubmit,
  clearCodeFields,
} from "./code/codeFields";
export { installActor } from "./actor/install";
export { actorCommand, ifThere } from "./actor/command";
export { nextNotes, finishWatching } from "./recorder/notes";
