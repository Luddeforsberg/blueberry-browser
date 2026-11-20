import { useState } from "react";
import type { HistoryImportResult, ImportSource } from "@shared/ipc";
import { useFromMain } from "@common/lib/latest";

const cameAcross = (added: number) =>
  added === 0 ? "Nothing new came across" : `${added.toLocaleString()} ${added === 1 ? "visit came" : "visits came"} across`;

export const useHistoryImport = () => {
  const [sources] = useFromMain<ImportSource[] | null>(null, window.chromeAPI.browser.importSources);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ result: HistoryImportResult; name: string } | null>(null);
  const source = sources?.find(({ id }) => id === chosenId) ?? sources?.[0] ?? null;

  const choose = (id: string) => {
    // What's coming across is the chosen browser's, so the choice holds until it's in.
    if (busy) return;
    setChosenId(id);
    setOutcome(null);
  };

  const bringIn = async () => {
    if (!source || busy) return;
    setBusy(true);
    const result = await window.chromeAPI.browser.importHistory(source.id).catch((): HistoryImportResult => ({ ok: false }));
    setOutcome({ result, name: source.name });
    setBusy(false);
  };

  const message = !outcome
    ? null
    : !outcome.result.ok
      ? `I couldn’t read ${outcome.name}’s history. Close ${outcome.name} and try again.`
      : `${cameAcross(outcome.result.added)} from ${outcome.name}.`;

  return {
    sources,
    source,
    choose,
    busy,
    bringIn,
    message,
    // What the chosen row says once it's in.
    added: outcome?.result.ok ? cameAcross(outcome.result.added) : null,
    done: outcome?.result.ok ?? false,
  };
};
