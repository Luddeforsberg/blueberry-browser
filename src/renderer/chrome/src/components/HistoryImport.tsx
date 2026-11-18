import React, { useRef } from "react";
import { Check } from "lucide-react";
import type { ImportSource } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { Pips } from "@common/components/Pips";
import { StatusPill } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { Favicon } from "./Favicon";
import { More, SettingsGroup, SettingsRow } from "./SettingsRow";
import { useHistoryImport } from "./useHistoryImport";

// What happens, in the one place both screens say it. The detail has to match `buildDigest` in suggestionDigest.ts.
const IMPORT_NOTES = [
  "Only addresses, page titles and visit times from the last 90 days come across, from every profile, never passwords or cookies.",
  "It stays on this computer, apart from a summary Suggestions sends to the AI service.",
];
const IMPORT_DETAIL =
  "That summary covers the last two weeks: site names and page titles in the order you visited them, what you searched for, and your chat and routine titles. Never page text or full addresses. Local addresses, and sites it recognises as banks or mail, are left out. You can turn Suggestions off in Settings.";

export type HistoryImport = ReturnType<typeof useHistoryImport>;

// The browser's own app icon, read by main from the app on this computer, or its letter where that couldn't be read.
const AppIcon: React.FC<{ source: ImportSource }> = ({ source }) =>
  source.icon ? (
    <span aria-hidden className="size-[34px] shrink-0 grid place-items-center rounded-[9px] bg-sheet dark:bg-sheet-2 shadow-chip">
      <img src={source.icon} alt="" className="size-[22px] object-contain" />
    </span>
  ) : (
    <span aria-hidden className="w-[34px] shrink-0 grid place-items-center">
      <Favicon site={source.name} className="size-6 rounded-[7px] text-12" />
    </span>
  );

// The browsers found, a choice of one. The chosen row is a sheet with an `ink` ring, and while its history comes across,
// its end has the pips moving, then how many visits came across with a Done pill.
export const SourceRows: React.FC<{ history: HistoryImport; className?: string }> = ({ history, className }) => {
  const { sources, source, choose, busy, added, done, message } = history;
  const group = useRef<HTMLDivElement>(null);
  if (!sources || !source) return null;
  const step = (by: number) => {
    if (busy) return;
    const next = sources[(sources.indexOf(source) + by + sources.length) % sources.length];
    choose(next.id);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[sources.indexOf(next)]?.focus();
  };
  return (
    <>
      <div
        ref={group}
        role="radiogroup"
        aria-label="Browser to bring history from"
        aria-busy={busy}
        onKeyDown={(event) => {
          const by = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
          if (!by) return;
          event.preventDefault();
          step(by);
        }}
        className={cn("flex flex-col gap-1.5", className)}
      >
        {sources.map((each) => {
          const on = each.id === source.id;
          return (
            <button
              key={each.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(each.id)}
              className={cn(
                "h-[58px] pl-3 pr-3.5 flex items-center gap-3 rounded-[14px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                on ? "shadow-[0_0_0_1.5px_rgb(var(--ink))]" : "shadow-[inset_0_0_0_1px_var(--line)]",
                !on && !busy && "hover:bg-hover",
              )}
            >
              <AppIcon source={each} />
              <span className="flex-1 min-w-0">
                <span className="block text-14 font-medium text-ink truncate">{each.name}</span>
                <span className="block text-13 text-ink-2 truncate">
                  {on && added ? added : each.profiles === 1 ? "1 profile" : `${each.profiles} profiles`}
                </span>
              </span>
              {on && busy ? (
                <span className="mr-0.5 shrink-0 flex items-center gap-2 font-mono text-11.5 text-ink-2">
                  <Pips pattern="think" />
                  Bringing it in..
                </span>
              ) : on && done ? (
                <StatusPill tone="on">Done</StatusPill>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-[18px] shrink-0 grid place-items-center rounded-full",
                    on ? "bg-ink text-ground" : "shadow-[inset_0_0_0_1.5px_rgb(var(--faint))]",
                  )}
                >
                  {on && <Check className="size-[11px]" strokeWidth={2.6} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p role="status" className="sr-only">
        {busy ? "Bringing it in.." : done ? message : ""}
      </p>
    </>
  );
};

// Settings > Privacy > Bring in history. Privacy only leads here when there's a browser to bring from.
export const BringInHistory: React.FC = () => {
  const history = useHistoryImport();
  const { sources, source, busy, bringIn, message, done } = history;
  const failed = !!message && !done;
  return (
    <>
      <p className="mt-1 max-w-[520px] text-14 leading-[1.45] text-ink-2">
        {IMPORT_NOTES.join(" ")} <More text={IMPORT_DETAIL} />
      </p>
      {sources && source ? (
        <div className="mt-5">
          <SourceRows history={history} />
          {/* Once it's in, the row says so. Choosing another browser offers it again. */}
          {!done && (
            <div className="mt-3 flex items-start justify-end gap-4">
              {failed && (
                <p role="alert" className="flex-1 text-13 text-ask">
                  {message}
                </p>
              )}
              <Button variant="raised" disabled={busy} onClick={() => void bringIn()}>
                {failed ? "Try again" : "Bring it in"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        sources && (
          <SettingsGroup>
            <SettingsRow
              id="setting-import"
              title="No other browser found"
              description="Blueberry can bring history in from Chromium browsers on this computer."
            />
          </SettingsGroup>
        )
      )}
    </>
  );
};
