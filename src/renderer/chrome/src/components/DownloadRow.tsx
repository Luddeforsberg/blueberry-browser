import React from "react";
import { File, Folder, Pause, Play, X } from "lucide-react";
import type { DownloadAction, DownloadInfo } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { cn } from "@common/lib/utils";
import { downloadStatus, fileEnding, fractionDone, isActive, timeLeft } from "./downloadStatus";
import { LINE_BETWEEN, OFF_ROW_HIDE, ON_ROW, ON_ROW_SHOW, ROW } from "./pageRows";
import { Tooltip } from "@common/components/Tooltip";

// DESIGN.md section 10, Downloads: the kind of file on its tile, its name, and one line with its size, the site it came
// from, and while it runs how much has arrived and how long is left. At the end is when it started, or while it runs its
// share. What can be done with a finished one shows on the row you're on, and pressing it opens the file. A running one
// always shows Pause or Resume and Cancel, since it's something to act on while it runs.

const timeOf = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const IconAction: React.FC<{ label: string; title: string; onClick: () => void; children: React.ReactNode }> = ({
  label,
  title,
  onClick,
  children,
}) => (
  <Tooltip words={title}>
    <Button size="icon" variant="ghost" aria-label={label} onClick={onClick} className="relative size-7 text-ink-3">
      {children}
    </Button>
  </Tooltip>
);

export const DownloadRow: React.FC<{
  download: DownloadInfo;
  onAction: (action: DownloadAction) => void;
}> = ({ download, onAction }) => {
  const status = downloadStatus(download);
  const active = isActive(download);
  const openable = download.state === "completed" && !download.missing;
  const fraction = fractionDone(download.receivedBytes, download.totalBytes);
  const ending = fileEnding(download.filename);
  const left = timeLeft(download);
  const act = (action: DownloadAction) => () => onAction(action);
  const name = download.filename;

  return (
    <Tooltip words={name} whenCut>
      <li
        aria-label={name}
        className={cn(
          ROW,
          ON_ROW,
          LINE_BETWEEN,
          "before:left-14 min-h-[60px] py-2.5 flex items-center gap-3",
          openable && "has-[>button:first-child:active]:bg-press",
        )}
      >
        {openable && (
          <button
            type="button"
            aria-label={`Open ${name}`}
            onClick={act("open")}
            className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          />
        )}
        <span
          aria-hidden
          className="size-9 shrink-0 grid place-items-center rounded-row bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)] text-ink-2 pointer-events-none"
        >
          {ending ? <span className="font-mono text-[10.5px] leading-none">{ending}</span> : <File className="size-4" strokeWidth={1.75} />}
        </span>
        <span className="flex-1 min-w-0 pointer-events-none">
          <span
            className={cn(
              "block truncate text-14",
              download.missing ? "text-ink-3 line-through decoration-faint" : "font-medium",
              !download.missing && (openable || active ? "text-ink" : "text-ink-2"),
            )}
          >
            {name}
          </span>
          <span className="block truncate text-13 tabular-nums">
            <span className={status.className}>{status.text}</span>
            {left && <span className="text-ink-2"> · {left}</span>}
            {download.source && <span className="text-ink-2"> · {download.source}</span>}
          </span>
          {active && fraction !== null && (
            <span
              role="progressbar"
              aria-label={`Progress of ${name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(fraction * 100)}
              className="block mt-[7px] h-0.5 rounded-full bg-line overflow-hidden"
            >
              <span
                className="block h-full rounded-full bg-ink transition-[width] duration-panel"
                style={{ width: `${fraction * 100}%` }}
              />
            </span>
          )}
        </span>
        {active ? (
          <span className="relative shrink-0 flex items-center gap-1">
            {fraction !== null && <span className="mr-1 font-mono text-11.5 text-ink-3 tabular-nums">{Math.round(fraction * 100)}%</span>}
            {download.state === "progressing" && download.path && (
              <IconAction label={`Pause ${name}`} title="Pause" onClick={act("pause")}>
                <Pause strokeWidth={1.75} />
              </IconAction>
            )}
            {(download.state === "paused" || download.canResume) && (
              <IconAction label={`Resume ${name}`} title="Resume" onClick={act("resume")}>
                <Play strokeWidth={1.75} />
              </IconAction>
            )}
            <IconAction label={`Cancel ${name}`} title="Cancel" onClick={act("cancel")}>
              <X strokeWidth={1.75} />
            </IconAction>
          </span>
        ) : (
          // When it started, and on the row you're on what can be done in its place.
          <span className="shrink-0 grid justify-items-end items-center [&>*]:[grid-area:1/1]">
            <span className={cn("font-mono text-11.5 text-ink-3 tabular-nums pointer-events-none", OFF_ROW_HIDE)}>
              {timeOf(download.startedAt)}
            </span>
            <span className={cn("relative flex items-center gap-1", ON_ROW_SHOW)}>
              {openable && (
                <>
                  <Button size="sm" variant="raised" className="mr-1" onClick={act("open")}>
                    Open
                  </Button>
                  <IconAction label={`Show ${name} in folder`} title="Show in folder" onClick={act("show")}>
                    <Folder strokeWidth={1.75} />
                  </IconAction>
                </>
              )}
              <IconAction label={`Remove ${name} from the list`} title="Remove from the list" onClick={act("remove")}>
                <X strokeWidth={1.75} />
              </IconAction>
            </span>
          </span>
        )}
      </li>
    </Tooltip>
  );
};
