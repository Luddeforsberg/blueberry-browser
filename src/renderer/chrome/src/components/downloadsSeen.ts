import { useSyncExternalStore } from "react";
import type { DownloadInfo } from "@shared/ipc";

// Which downloads ended since the user last looked at Downloads, so the toolbar can mark them. Only one started during
// this launch counts, since a file from before isn't news. The page is only mounted while it's the tab in front, and
// marks everything it shows as seen.
const launchedAt = Date.now();
const seen = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

// Finished, or failed in a way it can't carry on from. Cancelling is the user's own doing, so it isn't news.
const ended = (download: DownloadInfo): boolean =>
  download.state === "completed" || (download.state === "interrupted" && !download.canResume);

export const isNew = (download: DownloadInfo): boolean => download.startedAt >= launchedAt;

export const markDownloadsSeen = (downloads: DownloadInfo[]) => {
  const fresh = downloads.filter((download) => ended(download) && !seen.has(download.id));
  if (fresh.length === 0) return;
  fresh.forEach((download) => seen.add(download.id));
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useUnseenDownloads = (downloads: DownloadInfo[]): DownloadInfo[] => {
  useSyncExternalStore(subscribe, () => version);
  return downloads.filter((download) => ended(download) && isNew(download) && !seen.has(download.id));
};
