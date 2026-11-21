import { InternalTab } from "../tabs/InternalTab";
import { Routines } from "../routines/Routines";
import { Recordings } from "../recordings/Recordings";
import { generateTitle, hasModel, writeWithCheapModel } from "../chats/agent";
import { notifyRoutine } from "./routineNotices";
import type { WindowParts } from "./WindowParts";

// Jobs the user repeats, wired to the window: routines and Show Berry how. Routines are kept by the app's store, and
// their times run in a window, since a run works in its tabs: with the window closed, one that comes due runs once the
// next window opens. Each is made in its turn by the window's constructor, and reaches the rest of the window only when
// it's called.

export const createRoutines = (w: WindowParts): Routines =>
  new Routines(w.stores.routineStore, w.app.chats, {
    onChanged: () => {
      w.library.publishLibrary();
      void w.app.runnerJobs.routinesChanged();
    },
    stillInCloud: (id) => w.app.runnerJobs.stillInCloud(id),
    cloudFailed: (id) => w.app.runnerJobs.cloudFailed(id),
    // Named the way a chat is titled, from the user's own words for what it does and nothing else.
    writeName: async (instructions) => (hasModel() ? generateTitle([{ role: "user", content: instructions }]) : null),
    onAttention: (routine, kind) => {
      // The Routines row and the toolbar say so anyway, and that holds until the user is free. Anything asking
      // is notified from Needs you, along with every chat's.
      if (kind === "needs-approval" || w.library.userIsBusyOrHere) return;
      notifyRoutine(routine.name, kind, () => {
        w.show();
        w.tabs.openPage("routines");
      });
    },
    // A tab the user has been to stays, even if they only looked.
    closeTab: (tabId) => {
      if (w.tabs.isBackground(tabId)) w.tabs.closeTab(tabId, false);
    },
  });

export const createRecordings = (w: WindowParts): Recordings =>
  new Recordings({
    chrome: () => w.chromeView.view.webContents,
    activeTab: () => w.tabs.activeTab,
    openReview: () => w.tabs.openPage("recording"),
    closeReview: () => {
      const review = w.tabs.entries.find((tab) => tab instanceof InternalTab && tab.page === "recording");
      if (!review) return;
      if (w.tabs.tabCount === 1) w.tabs.openPage("new-tab");
      w.tabs.closeTab(review.id, false);
    },
    // The new tab says what to do while watching is on, so one already in front is used.
    openStart: () => {
      const front = w.tabs.activeEntry;
      if (!(front instanceof InternalTab && front.page === "new-tab")) w.tabs.openPage("new-tab");
    },
    hasModel,
    // Page labels go in this, and a careless page may have put a code from the phone in one.
    write: (system, data) => writeWithCheapModel(system, w.app.chats.withoutCodes(data)),
  });
