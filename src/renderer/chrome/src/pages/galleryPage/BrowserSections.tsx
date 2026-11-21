import React from "react";
import { Pin, Star } from "lucide-react";
import { ToolBarButton } from "../../components/ToolBarButton";
import { ApprovalCard, WhyLine } from "@common/components/ApprovalCard";
import { whyWords } from "../../askingWords";
import { PermissionCard } from "@common/components/PermissionCard";
import { PageTrouble } from "../../components/PageTrouble";
import { TabIcon } from "../../components/TabIcon";
import { HistoryRow } from "../HistoryPage";
import { FindBarCard } from "../../components/FindBarCard";
import { ZoomButton } from "../../components/Toolbar";
import { WaitingCard, WaitingRow } from "../NeedsYouPage";
import { DownloadRow } from "../../components/DownloadRow";
import { DownloadsProgress } from "../../components/DownloadsButton";
import { Section } from "./Section";
import { SAMPLE_DOWNLOAD, SAMPLE_DOWNLOADS, SAMPLE_WAITING } from "./gallerySamples";

// What the browser shows around a page: history, trouble, cards, downloads and the toolbar's buttons.
export const BrowserSections: React.FC = () => (
  <>
    <Section title="History">
      <ul className="max-w-xl rounded-sheet bg-sheet shadow-up overflow-hidden">
        <HistoryRow
          entry={{ id: 1, url: "https://en.wikipedia.org/wiki/Jackdaw", title: "Jackdaw", favicon: null, visitedAt: Date.now() }}
          onOpen={() => undefined}
          onDelete={() => undefined}
        />
      </ul>
    </Section>

    <Section title="A page in trouble">
      <div className="grid grid-cols-2 gap-3">
        <div className="h-72 rounded-sheet border">
          <PageTrouble trouble="crashed" onReload={() => undefined} />
        </div>
        <div className="h-72 rounded-sheet border">
          <PageTrouble trouble="unresponsive" onReload={() => undefined} />
        </div>
        <div className="h-72 rounded-sheet border">
          <PageTrouble trouble={{ url: "https://example.com/missing", description: "ERR_NAME_NOT_RESOLVED" }} onReload={() => undefined} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-13 text-ink-2">
        <TabIcon tab={{ page: null, favicon: null, isLoading: false, berryWorking: false, trouble: "crashed" }} /> Its tab shows this until
        it’s reloaded.
      </div>
    </Section>

    <Section title="Approval card">
      <div className="max-w-sm">
        <ApprovalCard
          question="I’d like to open github.com in a new tab"
          exactly="Open https://github.com/acme/checkout/pull/412?diff=split in a new tab"
          mark="?diff=split"
          note={<WhyLine>{whyWords({ reason: "carries-data", mark: "?diff=split" })}</WhyLine>}
          onConfirm={() => undefined}
          onDeny={() => undefined}
        />
      </div>
    </Section>

    <Section title="Needs you">
      <div className="max-w-[620px] flex flex-col gap-3">
        {SAMPLE_WAITING.slice(0, 2).map((item) => (
          <WaitingCard key={item.approval.id} item={item} now={4 * 60_000} onAnswered={() => undefined} />
        ))}
        <ul className="rounded-sheet bg-sheet shadow-up overflow-hidden">
          {SAMPLE_WAITING.map((item) => (
            <WaitingRow key={item.approval.id} item={item} now={4 * 60_000} onOpen={() => undefined} />
          ))}
        </ul>
      </div>
    </Section>

    <Section title="Site permission card">
      <div className="max-w-sm flex flex-col gap-4">
        <PermissionCard prompt={{ origin: "https://example.com", permissions: ["camera", "microphone"] }} onDecide={() => undefined} />
        <PermissionCard prompt={{ origin: "http://example.com:8080", permissions: ["screen"] }} onDecide={() => undefined} />
      </div>
    </Section>

    <Section title="Downloads">
      <div className="flex items-center gap-3">
        <DownloadsProgress downloads={[]} />
        <DownloadsProgress downloads={SAMPLE_DOWNLOADS.slice(0, 1)} />
        <DownloadsProgress downloads={SAMPLE_DOWNLOADS.slice(1, 2)} />
        <DownloadsProgress downloads={[{ ...SAMPLE_DOWNLOAD, id: "starting", receivedBytes: 0 }]} />
        <DownloadsProgress downloads={[]} unseen={SAMPLE_DOWNLOADS.filter((download) => download.id === "finished")} />
        <DownloadsProgress
          downloads={SAMPLE_DOWNLOADS.slice(0, 1)}
          unseen={SAMPLE_DOWNLOADS.filter((download) => download.id === "finished")}
        />
      </div>
      <ul className="mt-4 rounded-sheet bg-sheet shadow-up">
        {SAMPLE_DOWNLOADS.map((download) => (
          <DownloadRow key={download.id} download={download} onAction={() => undefined} />
        ))}
      </ul>
    </Section>

    <Section title="Bookmark button">
      <div className="flex items-center gap-3">
        <ToolBarButton Icon={Star} label="Bookmark this page" onClick={() => undefined} />
        <ToolBarButton label="Remove bookmark" toggled className="bg-transparent hover:bg-transparent" onClick={() => undefined}>
          <Star className="size-4 fill-current text-ink" strokeWidth={1.75} />
        </ToolBarButton>
        <ToolBarButton Icon={Star} label="Bookmark this page (unavailable on internal pages)" active={false} />
      </div>
    </Section>

    <Section title="Pin button">
      <div className="flex items-center gap-3">
        <ToolBarButton Icon={Pin} label="Pin this page" onClick={() => undefined} />
        <ToolBarButton label="Unpin this page" toggled onClick={() => undefined}>
          <Pin className="size-4 fill-current" />
        </ToolBarButton>
        <ToolBarButton Icon={Pin} label="Pin this page (unavailable on internal pages)" active={false} />
      </div>
    </Section>

    <Section title="Zoom level">
      <ZoomButton percent={125} onReset={() => undefined} />
    </Section>

    <Section title="Find bar">
      <div className="flex flex-col gap-3 max-w-sm">
        <FindBarCard value="" onChange={() => undefined} result={null} onStep={() => undefined} onClose={() => undefined} />
        <FindBarCard
          value="berry"
          onChange={() => undefined}
          result={{ active: 2, total: 14 }}
          onStep={() => undefined}
          onClose={() => undefined}
        />
        <FindBarCard
          value="blueberry"
          onChange={() => undefined}
          result={{ active: 0, total: 0 }}
          onStep={() => undefined}
          onClose={() => undefined}
        />
      </div>
    </Section>
  </>
);
