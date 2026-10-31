import type { Tab } from "./Tab";
import { chooseCodeField, type CodeField, type CodeTarget } from "./phoneReplies";
import { clearCodeFields, codeFieldFocus, codeFieldsChanged, codeFieldsFilled, focusCodeField, listCodeFields, pressCodeSubmit, watchCodeSubmit } from "./pageScripts";
import { pause, pressKey } from "./pageInput";

// Types a code from the user's phone into a tab they've been handed. Nothing the model can call leads here, and this
// is the one thing that uses a tab while it's held. The code only ever goes to the page as key presses, never into a
// script, so it can't turn up in a script's error.

const AFTER_TYPING_MS = 300;
const AFTER_ENTER_MS = 300;

export type EntryResult = "entered" | "no-field" | "interrupted";

export const enterCodeInTab = async (tab: Tab, code: string, stillOurs: () => boolean, userIsThere: () => boolean): Promise<EntryResult> => {
  const keys = { sendAgentInput: (event: Parameters<Tab["sendInputWhileHeld"]>[0]) => tab.sendInputWhileHeld(event) };
  const run = <T>(script: string) => tab.runInPageWhileHeld<T>(script);
  const { fields, hasPasswordField } = await run<{ fields: CodeField[]; hasPasswordField: boolean }>(listCodeFields);
  const target: CodeTarget = chooseCodeField(fields, code, hasPasswordField);
  if (!target) return "no-field";
  const indexes = target.kind === "one" ? [target.index] : target.indexes;
  const startingUrl = tab.url;
  // The tab may have just gone back to the job, which mustn't find half a code, but one the user is in is left alone.
  const wipe = () => (tab.heldForUser ? run(clearCodeFields(indexes)) : tab.runInPage(clearCodeFields(indexes)));
  const interrupted = async (): Promise<EntryResult> => {
    if (!userIsThere()) await wipe().catch(() => {});
    return "interrupted";
  };

  await run(watchCodeSubmit);
  if (!(await run<boolean>(focusCodeField(indexes[0])))) return "no-field";
  try {
    for (const [at, character] of [...code].entries()) {
      if (!stillOurs()) return await interrupted();
      const box = target.kind === "one" ? indexes[0] : indexes[at];
      // A row of boxes usually moves along by itself. If not, or a page took the focus anywhere else, it's put right
      // first, because a real key goes wherever the focus is.
      if ((await run<number>(codeFieldFocus)) !== box && !(await run<boolean>(focusCodeField(box, target.kind === "boxes")))) throw new Error("The focus moved");
      await pressKey(keys, character, false);
    }
    if (!(await run<boolean>(codeFieldsFilled(indexes, code.length)))) throw new Error("The field didn't take it");
  } catch {
    await wipe().catch(() => {});
    return "no-field";
  }

  const moved = () => tab.url !== startingUrl || tab.isLoading;
  const submitted = async () => moved() || (await run<boolean>(codeFieldsChanged(indexes)).catch(() => true));
  // Many pages submit by themselves on the last character.
  await pause(AFTER_TYPING_MS);
  if (!stillOurs()) return interrupted();
  if (!(await submitted())) {
    await pressKey(keys, "Enter", false);
    await pause(AFTER_ENTER_MS);
    if (!(await submitted())) await run(pressCodeSubmit(indexes));
  }
  await tab.settled();
  // Left in the field, a job could read it there. A new page has nothing to wipe, and can't answer if it's still coming.
  await wipe().catch(() => {});
  return "entered";
};
