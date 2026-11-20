import React, { useEffect, useState } from "react";
import type { DesktopPanelState } from "@shared/ipc";
import { TooltipProvider } from "@common/components/Tooltip";
import { useDesktopTheme } from "./useDesktopTheme";
import { desktop } from "./desktopPanelParts";
import { GrownBox } from "./DesktopBox";
import { Sheets } from "./DesktopSheets";
import { useFromMain } from "@common/lib/latest";

// The window beside the drop that can take the keyboard without bringing Blueberry forward: the prompt box, or the tray
// and the ask. A click anywhere in it that isn't on them, or Esc, closes it, and what was typed is kept.
export const DesktopPanelApp: React.FC = () => {
  const [state] = useFromMain<DesktopPanelState | null>(null, desktop().panelState, desktop().onPanelState);
  const [draft, setDraft] = useState("");
  const theme = useDesktopTheme();
  const mac = theme?.platform === "mac";

  const sheets = state?.open === "sheets";
  useEffect(() => {
    if (!sheets) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void desktop().closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheets]);

  if (!state?.open) return null;
  return (
    <TooltipProvider mac={mac}>
      <div
        className="fixed inset-0"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) void desktop().closePanel();
        }}
      >
        {state.open === "box" ? <GrownBox state={state} mac={mac} draft={draft} setDraft={setDraft} /> : <Sheets state={state} mac={mac} />}
      </div>
    </TooltipProvider>
  );
};
