import React from "react";
import { useBrowser } from "../contexts/BrowserContext";
import { useLibrary } from "../contexts/LibraryContext";

// For when there's no sidebar to say it.
export const NeedsYouNotice: React.FC = () => {
  const { activeTab } = useBrowser();
  const count = useLibrary().needsYou.length;
  if (count === 0 || activeTab?.page === "needs-you") return null;
  return (
    <button
      type="button"
      onClick={() => void window.chromeAPI.browser.openPage("needs-you")}
      className="h-7 px-2 shrink-0 flex items-center gap-2 rounded-row text-14 outline-none transition-colors app-region-no-drag hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ask" />
      {count === 1 ? "1 thing needs you" : `${count} things need you`}
    </button>
  );
};
