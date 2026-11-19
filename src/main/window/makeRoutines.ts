import { app } from "electron";
import { join } from "path";
import { InternalTab } from "../tabs/InternalTab";
import type { RoutineStore } from "../routines/RoutineStore";
import { Routines } from "../routines/Routines";
import { Recordings } from "../recordings/Recordings";
import { Suggestions } from "../suggestions/Suggestions";
import { PATTERN_WINDOW_MS } from "../suggestions/suggestionPatterns";
import { generateTitle, hasModel, writeWithCheapModel } from "../chats/agent";
import { notifyRoutine } from "./routineNotices";
import type { WindowParts, WindowStores } from "./WindowParts";

// Plenty for a habit to show, and few enough to look through on every new tab.
const MAX_SUGGESTION_VISITS = 5000;
const MAX_SUGGESTION_CHATS = 100;

// Jobs the user repeats, wired to the window: routines, Show Berry how, and the suggestions on the new tab. Each is made
// in its turn by the window's constructor, and reaches the rest of the window only when it's called.

export const createRoutines = (w: WindowParts, routineStore: RoutineStore): Routines =>
  new Routines(routineStore, w.chats, {
    onChanged: () => {
      w.library.publishLibrary();
      void w.runnerJobs.routinesChanged();
    },
    stillInCloud: (id) => w.runnerJobs.stillInCloud(id),
    cloudFailed: (id) => w.runnerJobs.cloudFailed(id),
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
    write: (system, data) => writeWithCheapModel(system, w.chats.withoutCodes(data)),
  });

export const createSuggestions = (w: WindowParts, stores: WindowStores): Suggestions =>
  new Suggestions(join(app.getPath("userData"), "suggestions.json"), {
    enabled: () => w.settings.suggestions,
    // Both newest first.
    visits: () => stores.history.since(Date.now() - PATTERN_WINDOW_MS, MAX_SUGGESTION_VISITS),
    chats: () =>
      stores.chatStore.firstMessages(MAX_SUGGESTION_CHATS).map((chat) => {
        // Failed and stopped are only known for replies since launch.
        const outcome = w.chats.work(chat.id)?.outcome;
        return { ...chat, outcome: outcome === "failed" || outcome === "stopped" ? outcome : chat.replied ? "done" : "no reply" };
      }),
    routines: () => w.routines.list(),
    runs: (routineId) => w.routines.runs(routineId),
    mascots: () => stores.mascotStore.all(),
    hasModel,
    // Page titles go in this, and a careless page may have put a code from the phone in its title.
    write: (system, data) => writeWithCheapModel(system, w.chats.withoutCodes(data)),
    onChanged: () => w.library.publishSuggestions(),
  });
