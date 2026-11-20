import { useEffect } from "react";
import type { DownloadInfo } from "@shared/ipc";
import { useFromMain } from "@common/lib/latest";

// Main pushes every change. Coming back to the window checks again, since files can go while it's away.
export const useDownloads = (): DownloadInfo[] => {
  const [downloads, , readAgain] = useFromMain<DownloadInfo[]>([], window.chromeAPI.downloads.list, window.chromeAPI.downloads.onUpdated);

  useEffect(() => {
    window.addEventListener("focus", readAgain);
    return () => window.removeEventListener("focus", readAgain);
  }, [readAgain]);

  return downloads;
};
