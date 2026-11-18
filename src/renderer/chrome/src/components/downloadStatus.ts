import type { DownloadInfo } from "@shared/ipc";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export const formatBytes = (bytes: number): string => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
};

// Still running or able to carry on, as opposed to finished for good.
export const isActive = (download: DownloadInfo): boolean =>
  download.state === "progressing" || download.state === "paused" || download.canResume;

// Null when the server didn't give a size.
export const fractionDone = (received: number, total: number): number | null => (total > 0 ? Math.min(received / total, 1) : null);

const progressText = ({ receivedBytes, totalBytes }: DownloadInfo): string =>
  totalBytes > 0 ? `${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)}` : `${formatBytes(receivedBytes)} so far`;

// Status colours always come with words, so colour is never the only signal.
export const downloadStatus = (download: DownloadInfo): { text: string; className: string } => {
  if (download.missing) return { text: "Moved or deleted", className: "text-ink-2" };
  switch (download.state) {
    case "progressing":
      return { text: download.path ? progressText(download) : "Choosing where to save", className: "text-ink-2" };
    case "paused":
      return { text: `Paused, ${progressText(download)}`, className: "text-ink-2" };
    case "completed":
      return { text: formatBytes(download.receivedBytes), className: "text-ink-2" };
    case "cancelled":
      return { text: "Cancelled", className: "text-ink-2" };
    case "interrupted":
      return {
        text: download.canResume ? `Stopped, ${progressText(download)}` : "Didn’t finish",
        className: "text-ask",
      };
  }
};

// How long is left, from how fast it's come so far, only while it's arriving with a known size.
export const timeLeft = (download: DownloadInfo, now = Date.now()): string | null => {
  const { state, receivedBytes, totalBytes, startedAt } = download;
  const elapsed = now - startedAt;
  if (state !== "progressing" || !download.path || totalBytes <= 0 || receivedBytes <= 0 || receivedBytes >= totalBytes || elapsed <= 0)
    return null;
  const seconds = Math.ceil(((totalBytes - receivedBytes) * elapsed) / receivedBytes / 1000);
  if (seconds < 60) return `${seconds} s left`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min left` : `${Math.round(minutes / 60)} h left`;
};

// The kind of file, as its ending: "pdf", "dmg". Null for a name with none, or one too long to be a kind.
export const fileEnding = (filename: string): string | null => {
  const ending = /\.([a-z0-9]{1,4})$/i.exec(filename)?.[1];
  return ending ? ending.toLowerCase() : null;
};
