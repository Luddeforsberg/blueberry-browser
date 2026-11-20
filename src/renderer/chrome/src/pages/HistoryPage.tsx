import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { HistoryCursor, HistoryEntry } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { cn } from "@common/lib/utils";
import { Berry } from "../components/Berry";
import { useAssistantName } from "../components/useAssistantName";
import { Favicon } from "../components/Favicon";
import { EmptyPage, PageFrame, PageHeader, SearchField } from "../components/PageFrame";
import { OFF_ROW_HIDE, ON_ROW, ON_ROW_SHOW, ROW } from "../components/pageRows";
import { SettingsGroup } from "../components/SettingsRow";
import { foldVisits, groupByDay, siteOf, type VisitRun } from "./historyDays";
import { Tooltip } from "@common/components/Tooltip";

// DESIGN.md section 10, History: a page in a tab, with a group for each day, newest first, and a row of one line for
// each visit, with no hairlines.

const SEARCH_DELAY_MS = 150;
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus";
const LINE = cn(ROW, ON_ROW, "h-9 flex items-center gap-2.5");
const TIME = "font-mono text-11.5 text-ink-3 tabular-nums";

const timeOf = (visitedAt: number) => new Date(visitedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// One visit: the site's icon, the title, the site, and the time at the end. Pressing it opens the page in a new tab, and
// on the row you're on Remove takes the time's place.
export const HistoryRow: React.FC<{
  entry: HistoryEntry;
  onOpen: () => void;
  onDelete: () => void;
  // Inside a folded group, the site is said once already.
  inGroup?: boolean;
}> = ({ entry, onOpen, onDelete, inGroup = false }) => {
  const title = entry.title || siteOf(entry.url);
  return (
    <li className={cn(LINE, "has-[>button:first-child:active]:bg-press")}>
      <button type="button" aria-label={title} onClick={onOpen} className={cn("absolute inset-0 rounded-[inherit]", FOCUS)} />
      <span className="contents pointer-events-none">
        <Favicon src={entry.favicon} site={entry.url} />
        <span className="min-w-0 truncate text-14 text-ink">{title}</span>
        {!inGroup && <span className="min-w-0 shrink-[2] truncate text-13 text-ink-3">{siteOf(entry.url)}</span>}
        <span className="flex-1" />
      </span>
      <span className="shrink-0 grid justify-items-end items-center [&>*]:[grid-area:1/1]">
        <span className={cn(TIME, "pointer-events-none", OFF_ROW_HIDE)}>{timeOf(entry.visitedAt)}</span>
        <Tooltip words="Remove">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${title} from history`}
            onClick={onDelete}
            className={cn("relative size-7 -mr-1 text-ink-3", ON_ROW_SHOW)}
          >
            <X strokeWidth={1.75} />
          </Button>
        </Tooltip>
      </span>
    </li>
  );
};

// Visits in a row to the same site, as one row with the site, how many pages and the time of the newest, which opens in
// place to show them.
const VisitGroup: React.FC<{ run: VisitRun; onOpen: (entry: HistoryEntry) => void; onDelete: (entry: HistoryEntry) => void }> = ({
  run,
  onOpen,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const newest = run.entries[0];
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(LINE, "w-full text-left active:bg-press", FOCUS)}
      >
        <Favicon src={newest.favicon} site={newest.url} />
        <span className="min-w-0 truncate text-14 text-ink">{run.site}</span>
        <span className="shrink-0 text-13 text-ink-3 tabular-nums">{run.entries.length} pages</span>
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 shrink-0 text-faint transition-transform duration-fast", open && "rotate-180")}
          strokeWidth={1.75}
        />
        <span className="flex-1" />
        <span className={TIME}>{timeOf(newest.visitedAt)}</span>
      </button>
      {open && (
        <ul aria-label={`Visits to ${run.site}`} className="ml-[26px]">
          {run.entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} inGroup onOpen={() => onOpen(entry)} onDelete={() => onDelete(entry)} />
          ))}
        </ul>
      )}
    </li>
  );
};

// Every page visited, by day, newest first. It's only here, on this computer.
export const HistoryPage: React.FC = () => {
  const browser = window.chromeAPI.browser;
  const isBerry = useAssistantName() === "Berry";
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [next, setNext] = useState<HistoryCursor | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (text: string, before: HistoryCursor | null) => {
      try {
        const page = await browser.searchHistory({ query: text, before: before ?? undefined });
        setEntries((shown) => (before ? [...(shown ?? []), ...page.entries] : page.entries));
        setNext(page.next);
        setFailed(false);
      } catch (error) {
        console.error("Failed to load history:", error);
        setFailed(true);
      }
    },
    [browser],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(query, null), query ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const remove = async (id: number) => {
    await browser.deleteHistoryEntry(id);
    setEntries((shown) => shown?.filter((entry) => entry.id !== id) ?? null);
  };

  const clear = async () => {
    if (await browser.clearHistory()) await load(query, null);
  };

  const open = (entry: HistoryEntry) => void browser.createTab(entry.url);
  const searching = query.trim() !== "";

  return (
    <PageFrame>
      <PageHeader
        title="History"
        search={<SearchField label="Search history" value={query} onChange={setQuery} />}
        actions={
          <Button variant="ghost" disabled={!entries?.length && !query} onClick={() => void clear()}>
            Clear…
          </Button>
        }
      />

      {failed && (
        <p role="alert" className="mt-6 px-2 text-14 text-ask">
          Your history couldn’t be read. Close this tab and try again.
        </p>
      )}

      {entries?.length === 0 &&
        !failed &&
        (searching ? (
          <p className="mt-6 px-2 text-14 text-ink-2">No pages match “{query.trim()}”.</p>
        ) : (
          <EmptyPage face={<Berry mood="rest" size={56} />}>
            {isBerry ? "Nothing here yet. Pages you visit are kept here, on this computer, until you clear them." : "Nothing here yet."}
          </EmptyPage>
        ))}

      {groupByDay(entries ?? []).map((day) => (
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
            {/* A search shows every match, so nothing it found is folded away. */}
            {(searching
              ? day.entries.map((entry): VisitRun => ({ key: String(entry.id), site: "", entries: [entry] }))
              : foldVisits(day.entries)
            ).map((run) =>
              run.entries.length === 1 ? (
                <HistoryRow
                  key={run.key}
                  entry={run.entries[0]}
                  onOpen={() => open(run.entries[0])}
                  onDelete={() => void remove(run.entries[0].id)}
                />
              ) : (
                <VisitGroup key={run.key} run={run} onOpen={open} onDelete={(entry) => void remove(entry.id)} />
              ),
            )}
          </ul>
        </SettingsGroup>
      ))}

      {next && (
        <div className="mt-5 flex justify-center">
          <Button variant="raised" onClick={() => void load(query, next)}>
            Show more
          </Button>
        </div>
      )}
    </PageFrame>
  );
};
