import { startWatching, type Note } from "./watch";

// Answers with what's happened since it was last asked, as soon as there's anything. The answer leaves before a click's
// default action runs, so a click that goes to another page still gets here. A new page answers nothing, ever.
export const nextNotes = (): Promise<Note[] | null> => (globalThis.__watching ?? startWatching()).next();

// Whatever's still in a field, and then nothing is left running in the page.
export const finishWatching = (): Note[] => globalThis.__watching?.finish() ?? [];
