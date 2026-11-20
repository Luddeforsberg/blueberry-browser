import React from "react";
import { useBrowser } from "../contexts/useBrowser";
import { useLibrary } from "../contexts/useLibrary";

// What routines want the user to know, if anything. Berry never speaks up about anything else.
const useRoutineNews = () => {
  const { routines } = useLibrary();
  const runs = routines.flatMap(({ latestRun }) => (latestRun ? [latestRun] : []));
  return {
    asking: runs.filter((run) => run.status === "needs-approval").length,
    ready: routines.filter((routine) => routine.unseen).length,
    working: runs.some((run) => run.status === "running"),
  };
};

// For when there's no sidebar to say it. It waits in the toolbar and never takes focus.
export const RoutineNotice: React.FC = () => {
  const { activeTab } = useBrowser();
  const { ready } = useRoutineNews();
  if (activeTab?.page === "routines" || ready === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void window.chromeAPI.browser.openPage("routines")}
      className="h-7 px-2 shrink-0 flex items-center gap-2 rounded-row text-14 outline-none transition-colors app-region-no-drag hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ink-3" />
      Routine has news
    </button>
  );
};
