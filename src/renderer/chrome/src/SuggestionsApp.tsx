import React, { useEffect, useState } from "react";
import type { AddressSuggestion, AddressSuggestionsShown, ThemeState } from "@shared/ipc";
import { AppWindow, ArrowRight, Clock, Search, Star } from "lucide-react";
import { Mascot } from "@common/components/Mascot";
import { cn } from "@common/lib/utils";
import { Favicon } from "./components/Favicon";
import { MenuRule } from "./components/MenuSheet";
import { menuRowClass } from "./components/menuRows";
import { shownAddress } from "./addressSuggestions";
import { useFromMain } from "@common/lib/latest";

// The list under the address field, over the page in its own view. Main places it from the layout and says what to
// draw. The keyboard stays in the field: this only shows the rows, and a press hands one back to main.

const ICON = "size-4 shrink-0 text-ink-2";

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="shrink-0 flex gap-1">
    {keys.map((key) => (
      <kbd
        key={key}
        className="h-[18px] min-w-[18px] px-1 grid place-items-center rounded-[5px] bg-sheet-2 font-mono text-11 text-ink-2 ring-1 ring-inset ring-line"
      >
        {key}
      </kbd>
    ))}
  </span>
);

const lead = (row: AddressSuggestion) => {
  switch (row.kind) {
    case "tab":
      return row.url ? <Favicon src={row.favicon} site={row.url} /> : <AppWindow aria-hidden className={ICON} strokeWidth={1.5} />;
    case "bookmark":
      return <Star aria-hidden className={ICON} strokeWidth={1.5} />;
    case "history":
      return <Clock aria-hidden className={ICON} strokeWidth={1.5} />;
    case "search":
      return row.opens ? (
        <ArrowRight aria-hidden className={ICON} strokeWidth={1.5} />
      ) : (
        <Search aria-hidden className={ICON} strokeWidth={1.5} />
      );
    case "ask":
      return <Mascot size={18} look={row.look} name={row.name} hidden={row.hidden} still className="shrink-0" />;
  }
};

const title = (row: AddressSuggestion) => {
  if (row.kind === "search") return row.text;
  if (row.kind === "ask") return `Ask ${row.name === "Assistant" ? "the assistant" : row.name} about “${row.text}”`;
  return row.title;
};

const action = (row: AddressSuggestion) => {
  switch (row.kind) {
    case "tab":
      return "Switch to tab";
    case "bookmark":
      return "Bookmark";
    case "history":
      return row.when;
    case "search":
      return row.opens ? "Open" : "Search";
    case "ask":
      return null;
  }
};

export const SuggestionsApp: React.FC = () => {
  const [theme] = useFromMain<ThemeState | null>(null, window.chromeAPI.theme.getTheme, window.chromeAPI.theme.onThemeUpdated);
  const [shown, setShown] = useState<AddressSuggestionsShown | null>(null);

  useEffect(() => window.chromeAPI.address.onSuggestions(setShown), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme?.isDark ?? false);
  }, [theme?.isDark]);

  if (!theme || !shown) return null;
  const { listId, rows, selected, sheet } = shown;
  const enter = theme.platform === "mac" ? "⌘" : "Ctrl";

  return (
    <div
      role="listbox"
      aria-label="Suggestions"
      style={{ left: sheet.x, top: sheet.y, width: sheet.width, height: sheet.height }}
      className="absolute p-1.5 overflow-hidden rounded-menu bg-sheet text-14 text-ink shadow-lift cursor-default select-none"
    >
      {rows.map((row, index) => {
        const address = row.kind === "tab" || row.kind === "bookmark" || row.kind === "history" ? shownAddress(row.url) : "";
        const words = action(row);
        return (
          <React.Fragment key={`${row.kind}-${index}`}>
            {row.kind === "ask" && <MenuRule />}
            <button
              type="button"
              role="option"
              aria-selected={index === selected}
              tabIndex={-1}
              // On the press, since the field loses the keyboard to this view as it happens and closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                if (event.button === 0) void window.chromeAPI.address.pick(listId, index);
              }}
              className={cn(menuRowClass(false), index === selected && "bg-sheet-2")}
            >
              {lead(row)}
              <span className="flex-1 min-w-0 truncate">
                <span className="font-medium">{title(row)}</span>
                {address && <span className="ml-[9px] text-13 text-ink-2">{address}</span>}
              </span>
              {words && <span className="shrink-0 text-13 text-ink-2">{words}</span>}
              {row.kind === "ask" ? <Keys keys={[enter, "↵"]} /> : index === selected && <Keys keys={["↵"]} />}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
