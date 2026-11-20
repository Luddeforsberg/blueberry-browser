import React from "react";
import { Folder } from "lucide-react";
import { Button } from "@common/components/Button";
import { DownloadRow } from "../components/DownloadRow";
import { useDownloads } from "../components/useDownloads";
import { EmptyPage, PageFrame, PageHeader } from "../components/PageFrame";
import { SettingsGroup } from "../components/SettingsRow";
import { byDay } from "./historyDays";

// DESIGN.md section 10, Downloads: a page in a tab, with a group for each day, newest first. Open folder shows the
// folder files are saved to, which main knows, so nothing here names a path.
export const DownloadsPage: React.FC = () => {
  const downloads = useDownloads();

  return (
    <PageFrame>
      <PageHeader
        title="Downloads"
        actions={
          <Button variant="ghost" onClick={() => void window.chromeAPI.downloads.openFolder()}>
            <Folder className="size-3.5" strokeWidth={1.75} />
            Open folder
          </Button>
        }
      />
      {downloads.length === 0 ? (
        <EmptyPage>Nothing here yet. Files you download are saved straight to your folder and listed here.</EmptyPage>
      ) : (
        byDay(downloads, (download) => download.startedAt).map((day) => (
          <SettingsGroup
            list
            key={day.key}
            label={
              <>
                {day.label} <span className="font-normal text-faint">{day.date}</span>
              </>
            }
          >
            <ul aria-label={day.label}>
              {day.items.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  onAction={(action) => void window.chromeAPI.downloads.act(download.id, action)}
                />
              ))}
            </ul>
          </SettingsGroup>
        ))
      )}
    </PageFrame>
  );
};
