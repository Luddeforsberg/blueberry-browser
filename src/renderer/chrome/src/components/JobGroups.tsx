import React from "react";
import { X } from "lucide-react";
import type { TabInfo } from "@shared/ipc";
import { useBrowser } from "../contexts/useBrowser";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { LEADING_SLOT, TabIcon } from "./TabIcon";
import { Berry } from "./Berry";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { SHORTCUTS } from "@shared/shortcuts";
import { Tooltip } from "@common/components/Tooltip";
import { useTabPreview } from "./useTabPreview";

// Part of the tab row (Tabs.tsx): a job's tabs, grouped under its chat.

// A job's tab gets its card in place of its tooltip too, where it gets one.
const JobTabTip: React.FC<{ tab: TabInfo; children: (preview: ReturnType<typeof useTabPreview>) => React.ReactElement }> = ({
  tab,
  children,
}) => {
  const preview = useTabPreview(tab);
  return (
    <Tooltip words={preview ? null : tab.title || "New tab"} whenCut>
      {children(preview)}
    </Tooltip>
  );
};

// A job's tabs aren't the user's. While one runs, its chat is a row with its mascot's face, on a tray, and the tabs it
// opened sit under it behind a dotted line. They close when the job ends, except any the user took over.
export const JobGroup: React.FC<{ chatId: string; chatTab: TabInfo | undefined; tabs: TabInfo[]; onClose: (id: string) => void }> = ({
  chatId,
  chatTab,
  tabs,
  onClose,
}) => {
  const { chats, needsYou } = useLibrary();
  const { find } = useMascots();
  const { switchTab } = useBrowser();
  const chat = chats.find(({ id }) => id === chatId);
  const mascot = find(chat?.mascotId ?? null);
  const asking = needsYou.some(({ id }) => id === chatId);
  const title = chat?.title ?? chatTab?.title ?? "A job";
  const open = () => (chatTab ? void switchTab(chatTab.id) : void window.chromeAPI.browser.openPage("chat", { param: chatId, title }));
  const row =
    "flex items-center gap-2.5 w-full px-2 rounded-row text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus app-region-no-drag";

  return (
    <li className="mt-1 p-0.5 pb-1 rounded-tile bg-tray">
      <div className={cn("flex items-center h-8 pr-1 rounded-row", chatTab?.isActive ? "bg-sheet shadow-up" : "hover:bg-hover")}>
        <Tooltip words={title} whenCut>
          <button
            type="button"
            aria-current={chatTab?.isActive ? "page" : undefined}
            onClick={open}
            className={cn(row, "flex-1 min-w-0 h-full text-14 text-ink")}
          >
            <span className={LEADING_SLOT}>
              <Berry mood={asking ? "asking" : "fetching"} size={20} mascot={mascot} />
            </span>
            <span className="flex-1 truncate">{title}</span>
            <span className="sr-only">{asking ? `, ${mascot.name} needs you` : `, ${mascot.name} is working`}</span>
            {asking && <Pips pattern="waiting" className="text-ask" />}
          </button>
        </Tooltip>
        {chatTab?.isActive && (
          <Tooltip words="Close" shortcut={SHORTCUTS.closeTab}>
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={() => onClose(chatTab.id)}
              className="press size-6 shrink-0 flex items-center justify-center rounded-[7px] text-ink-3 outline-none hover:bg-press hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          </Tooltip>
        )}
      </div>
      <ul aria-label={`Pages ${mascot.name} opened`} className="ml-[15px] pl-2 border-l border-dotted border-faint">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <JobTabTip tab={tab}>
              {(preview) => (
                <button
                  type="button"
                  {...preview}
                  aria-current={tab.isActive ? "page" : undefined}
                  onClick={() => !tab.isActive && void switchTab(tab.id)}
                  className={cn(row, "h-[30px] text-14", tab.isActive ? "bg-sheet text-ink shadow-up" : "text-ink hover:bg-hover")}
                >
                  {/* The group's own row is what moves while the job works. */}
                  <span className={LEADING_SLOT}>
                    <TabIcon tab={tab} still large />
                  </span>
                  <span className="flex-1 truncate">{tab.title || "New tab"}</span>
                </button>
              )}
            </JobTabTip>
          </li>
        ))}
      </ul>
    </li>
  );
};

// The tab row's version of the job block: a tray-toned group with the mascot's face and the job's name, then its tabs,
// and the waiting pips in `ask` at its end while it needs you. Pressing the face or the name opens the chat.
export const JobGroupRow: React.FC<{ chatId: string; chatTab: TabInfo | undefined; tabs: TabInfo[] }> = ({ chatId, chatTab, tabs }) => {
  const { chats, needsYou } = useLibrary();
  const { find } = useMascots();
  const { switchTab } = useBrowser();
  const chat = chats.find(({ id }) => id === chatId);
  const mascot = find(chat?.mascotId ?? null);
  const asking = needsYou.some(({ id }) => id === chatId);
  const title = chat?.title ?? chatTab?.title ?? "A job";
  const open = () => (chatTab ? void switchTab(chatTab.id) : void window.chromeAPI.browser.openPage("chat", { param: chatId, title }));
  const focus = "outline-none focus-visible:ring-2 focus-visible:ring-focus app-region-no-drag";

  return (
    <li
      aria-label={`${title}, ${asking ? `${mascot.name} needs you` : `${mascot.name} is working`}`}
      className="h-9 mx-[3px] pl-1 pr-0.5 min-w-0 shrink flex items-center gap-0.5 rounded-tile bg-tray"
    >
      <Tooltip words={title} whenCut>
        <button
          type="button"
          aria-current={chatTab?.isActive ? "page" : undefined}
          onClick={open}
          className={cn(
            "h-[30px] pl-1 pr-2 min-w-0 shrink-0 flex items-center gap-[7px] rounded-row text-14 text-ink",
            chatTab?.isActive ? "bg-sheet shadow-rim" : "hover:bg-hover",
            focus,
          )}
        >
          <Berry mood={asking ? "asking" : "fetching"} size={20} mascot={mascot} />
          <span className="max-w-[124px] truncate">{title}</span>
        </button>
      </Tooltip>
      <ul aria-label={`Pages ${mascot.name} opened`} className="min-w-0 flex items-center gap-0.5">
        {tabs.map((tab) => (
          <li key={tab.id} className="min-w-9 flex-[0_1_136px]">
            <JobTabTip tab={tab}>
              {(preview) => (
                <button
                  type="button"
                  {...preview}
                  aria-current={tab.isActive ? "page" : undefined}
                  onClick={() => !tab.isActive && void switchTab(tab.id)}
                  className={cn(
                    "w-full h-[30px] px-2.5 flex items-center gap-2 rounded-row text-14",
                    tab.isActive ? "bg-sheet text-ink shadow-rim" : "text-ink-2 hover:bg-hover hover:text-ink",
                    focus,
                  )}
                >
                  {/* The group's face is what moves while the job works. */}
                  <span className={LEADING_SLOT}>
                    <TabIcon tab={tab} still />
                  </span>
                  <span className="flex-1 min-w-0 truncate">{tab.title || "New tab"}</span>
                </button>
              )}
            </JobTabTip>
          </li>
        ))}
      </ul>
      {asking && <Pips pattern="waiting" className="mx-1.5 shrink-0 text-ask" />}
    </li>
  );
};
