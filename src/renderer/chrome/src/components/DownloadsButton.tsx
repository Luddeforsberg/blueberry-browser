import React, { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { DownloadInfo } from "@shared/ipc";
import { fractionDone, isActive } from "./downloadStatus";
import { ToolBarButton } from "./ToolBarButton";
import { SHORTCUTS } from "@shared/shortcuts";
import { cn } from "@common/lib/utils";
import { useDownloads } from "./useDownloads";
import { isNew, useUnseenDownloads } from "./downloadsSeen";

const percent = (download: DownloadInfo): string => {
  const fraction = fractionDone(download.receivedBytes, download.totalBytes);
  return fraction === null ? "" : ` ${Math.round(fraction * 100)}%`;
};

const ending = (download: DownloadInfo): string => `${download.filename} ${download.state === "completed" ? "done" : "didn’t finish"}`;

// The ring is all active downloads together. With no sizes known it stays full, because it can't say how far. A dot marks
// what ended since the user last looked at Downloads, and `arrivals` counts the downloads that started, so the arrow
// drops in again for each. `small` is the horizontal toolbar's 28px button.
export const DownloadsProgress: React.FC<{
  downloads: DownloadInfo[];
  unseen?: DownloadInfo[];
  arrivals?: number;
  onClick?: () => void;
  small?: boolean | undefined;
}> = ({ downloads, unseen = [], arrivals = 0, onClick, small = false }) => {
  const active = downloads.filter(isActive);
  const fraction = fractionDone(
    active.reduce((sum, download) => sum + download.receivedBytes, 0),
    active.reduce((sum, download) => sum + download.totalBytes, 0),
  );
  const label =
    active.length > 0
      ? `Downloads: ${active.map((download) => `${download.filename}${percent(download)}`).join(", ")}`
      : unseen.length > 0
        ? `Downloads: ${unseen.map(ending).join(", ")}`
        : "Downloads";

  return (
    <ToolBarButton
      label={label}
      tip="Downloads"
      shortcut={SHORTCUTS.downloads}
      onClick={onClick}
      className={small ? "relative size-7" : "relative"}
    >
      <Download
        key={arrivals}
        className={cn(active.length > 0 ? "size-3" : "size-4", arrivals > 0 && "motion-safe:animate-drop")}
        aria-hidden
      />
      {active.length === 0 && unseen.length > 0 && (
        <span aria-hidden className={cn("absolute size-[7px] rounded-full bg-ink", small ? "top-1 right-1" : "top-1.5 right-1.5")} />
      )}
      {active.length > 0 && (
        <svg viewBox="0 0 24 24" className={cn("absolute size-6 -rotate-90", small ? "inset-0.5" : "inset-1")} aria-hidden>
          <circle cx="12" cy="12" r="10.5" fill="none" strokeWidth="2" className="stroke-line" />
          {/* Nothing yet draws no arc at all: a round cap on nothing would still be a dot. */}
          {fraction !== 0 && (
            <circle
              cx="12"
              cy="12"
              r="10.5"
              fill="none"
              strokeWidth="2"
              pathLength={1}
              strokeDasharray={`${fraction ?? 1} 1`}
              strokeLinecap="round"
              className="stroke-ink transition-[stroke-dasharray] duration-panel"
            />
          )}
        </svg>
      )}
    </ToolBarButton>
  );
};

export const DownloadsButton: React.FC<{ small?: boolean }> = ({ small }) => {
  const downloads = useDownloads();
  const unseen = useUnseenDownloads(downloads);
  const known = useRef(new Set<string>());
  const [arrivals, setArrivals] = useState(0);

  useEffect(() => {
    const arrived = downloads.filter((download) => !known.current.has(download.id));
    arrived.forEach((download) => known.current.add(download.id));
    if (arrived.some(isNew)) setArrivals((count) => count + 1);
  }, [downloads]);

  return (
    <DownloadsProgress
      downloads={downloads}
      unseen={unseen}
      arrivals={arrivals}
      small={small}
      onClick={() => void window.chromeAPI.browser.openPage("downloads")}
    />
  );
};
