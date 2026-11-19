import * as page from "./pageCode";
import { inPage } from "./pageScripts";

// What watches the user while they show Berry something, in a world of its own. What runs in the page is
// src/page/recorder, which says what it may read and what it never does.

// Answers with what's happened since it was last asked, as soon as there's anything. The answer leaves before a click's
// default action runs, so a click that goes to another page still gets here. A new page answers nothing, ever.
export const nextNotes = inPage(page.nextNotes, undefined);

// Whatever's still in a field, and then nothing is left running in the page.
export const finishWatching = inPage(page.finishWatching, undefined);
