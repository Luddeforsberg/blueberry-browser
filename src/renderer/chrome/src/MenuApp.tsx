import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardPaste,
  Code,
  Copy,
  Download,
  Link,
  Pencil,
  Pin,
  Printer,
  Redo2,
  RotateCw,
  Scissors,
  SquareArrowOutUpRight,
  TextSelect,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { AskCard, MenuEntry, MenuIcon, MenuPlacement, MenuShown, MenuViewState, ThemeState } from "@shared/ipc";
import { Button } from "@common/components/Button";
import { Mascot } from "@common/components/Mascot";
import { cn } from "@common/lib/utils";
import { MenuRule, MenuSheet } from "./components/MenuSheet";
import { leadsWithGlyph, menuRowClass } from "./components/menuRows";
import { useFromMain, useLatest } from "@common/lib/latest";

const api = () => window.chromeAPI.menu;

// How long the pointer rests on a row before its submenu opens, or another closes.
const REST_MS = 150;

const ICONS: Record<Exclude<MenuIcon, "berry">, LucideIcon> = {
  rename: Pencil,
  delete: Trash2,
  back: ArrowLeft,
  forward: ArrowRight,
  reload: RotateCw,
  copy: Copy,
  cut: Scissors,
  paste: ClipboardPaste,
  undo: Undo2,
  redo: Redo2,
  "select-all": TextSelect,
  link: Link,
  "new-tab": SquareArrowOutUpRight,
  save: Download,
  "show-how": CircleDot,
  print: Printer,
  inspect: Code,
  pin: Pin,
  bookmark: Bookmark,
  open: AppWindow,
};

type Row = Extract<MenuEntry, { kind: "row" }>;

// Every sheet of a menu: the menu at "", and each submenu at the place of its row, "3" or "3.1".
const sheetsOf = (entries: MenuEntry[], path = ""): Array<{ path: string; entries: MenuEntry[] }> => [
  { path, entries },
  ...entries.flatMap((entry, index) =>
    entry.kind === "row" && entry.submenu ? sheetsOf(entry.submenu, path === "" ? String(index) : `${path}.${index}`) : [],
  ),
];

const rowPath = (sheet: string, index: number) => (sheet === "" ? String(index) : `${sheet}.${index}`);
const parentOf = (path: string) => path.split(".").slice(0, -1).join(".");
// The open submenus a row leaves open: those above it, and its own.
const chainTo = (sheet: string, row: Row, path: string): string[] => {
  const above = sheet === "" ? [] : sheet.split(".").map((_, at, parts) => parts.slice(0, at + 1).join("."));
  return row.submenu ? [...above, path] : above;
};

const RowGlyph: React.FC<{ row: Row; plain: boolean }> = ({ row, plain }) => {
  if (row.checked) return <Check aria-hidden className="size-[15px] shrink-0" strokeWidth={2} />;
  if (row.icon === "berry") return <Mascot size={15} hidden={plain} className="shrink-0" />;
  const Icon = row.icon && ICONS[row.icon];
  return Icon ? (
    <Icon aria-hidden className={cn("size-[15px] shrink-0", row.enabled && !row.danger && "text-ink-2")} strokeWidth={1.75} />
  ) : (
    <span aria-hidden className="size-[15px] shrink-0" />
  );
};

// One row: its icon or check, its words, and its shortcut or a submenu's chevron. Its name is its words alone.
export const MenuEntryRow: React.FC<{
  row: Row;
  path: string;
  lead: boolean;
  plain: boolean;
  open?: boolean;
  onPointerEnter?: () => void;
  onPress: (withKeys: boolean) => void;
}> = ({ row, path, lead, plain, open = false, onPointerEnter, onPress }) => (
  <button
    type="button"
    data-path={path}
    role={row.checked === null ? "menuitem" : "menuitemcheckbox"}
    aria-label={row.label}
    aria-checked={row.checked ?? undefined}
    aria-disabled={!row.enabled || undefined}
    aria-haspopup={row.submenu ? "menu" : undefined}
    aria-expanded={row.submenu ? open : undefined}
    onPointerEnter={(event) => {
      event.currentTarget.focus({ preventScroll: true });
      onPointerEnter?.();
    }}
    onClick={(event) => onPress(event.detail === 0)}
    className={cn(menuRowClass(false, !row.enabled), row.danger && row.enabled && "text-ask", open && "bg-sheet-2")}
  >
    {lead && <RowGlyph row={row} plain={plain} />}
    <span className="flex-1 truncate">{row.label}</span>
    {row.shortcut && <span className="ml-auto pl-[18px] text-12 text-faint">{row.shortcut}</span>}
    {row.submenu && <ChevronRight aria-hidden className="ml-auto size-[14px] shrink-0 text-faint" strokeWidth={1.75} />}
  </button>
);

// A menu main opened over the window or the desktop. It's drawn hidden first, so main can place every sheet inside the
// window, and only then shown. Pressing a row sends its id and nothing else: main does the rest.
const OwnMenu: React.FC<{ menu: MenuShown }> = ({ menu }) => {
  const [placed, setPlaced] = useState<MenuPlacement | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const sheets = useRef(new Map<string, HTMLDivElement>());
  const rest = useRef<number>(undefined);
  const all = sheetsOf(menu.entries);

  // Measured once, for the menu main sent, and placed as main answers for the newest of it.
  const placing = useLatest();
  useLayoutEffect(() => {
    const sizes = sheetsOf(menu.entries).map(({ path }) => {
      const sheet = sheets.current.get(path);
      const row = path === "" ? null : sheets.current.get(parentOf(path))?.querySelector<HTMLElement>(`[data-path="${path}"]`);
      return { path, width: sheet?.offsetWidth ?? 0, height: sheet?.offsetHeight ?? 0, rowTop: row?.offsetTop ?? 0 };
    });
    const turn = placing.next();
    void api()
      .place(menu.id, sizes)
      .then((placed) => turn.current && setPlaced(placed));
  }, [menu, placing]);

  useEffect(() => () => window.clearTimeout(rest.current), []);

  const dismiss = () => void api().dismiss(menu.id);
  const focusRow = (path: string) => sheets.current.get(parentOf(path))?.querySelector<HTMLElement>(`[data-path="${path}"]`)?.focus();
  const openSubmenu = (chain: string[], withKeys: boolean) => {
    window.clearTimeout(rest.current);
    setOpen(chain);
    if (withKeys)
      requestAnimationFrame(() =>
        sheets.current
          .get(chain.at(-1) ?? "")
          ?.querySelector<HTMLElement>("[role^=menuitem]")
          ?.focus(),
      );
  };

  const press = (sheet: string, row: Row, path: string, withKeys: boolean) => {
    if (row.submenu) openSubmenu(chainTo(sheet, row, path), withKeys);
    else if (row.enabled) void api().choose(menu.id, row.id);
  };

  return (
    // Pressing anywhere in the view but a sheet closes the menu, as a press outside the view does.
    <div className="h-full" onPointerDown={(event) => event.target === event.currentTarget && dismiss()}>
      {all.map(({ path, entries }) => {
        const shown = placed !== null && (path === "" || open.includes(path));
        const leads = leadsWithGlyph(entries);
        return (
          <MenuSheet
            key={path}
            label={menu.label}
            at={placed?.[path] ?? { x: 0, y: 0 }}
            hidden={!shown}
            autoFocus={path === ""}
            view={placed ? "placed" : "measuring"}
            sheetRef={(element) => {
              if (element) sheets.current.set(path, element);
              else sheets.current.delete(path);
            }}
            className="w-max min-w-[180px] max-w-[360px]"
            onClose={dismiss}
            onKey={(event) => {
              // A key wins over the pointer: a submenu waiting on the pointer's rest doesn't open after it.
              window.clearTimeout(rest.current);
              const target = event.target instanceof HTMLElement ? event.target.dataset.path : undefined;
              if (path !== "" && (event.key === "ArrowLeft" || event.key === "Escape")) {
                event.preventDefault();
                setOpen(open.filter((each) => each !== path && !each.startsWith(`${path}.`)));
                focusRow(path);
                return true;
              }
              if (event.key === "ArrowRight" && target) {
                const index = Number(target.split(".").at(-1));
                const row = entries[index];
                if (row?.kind === "row" && row.submenu) {
                  event.preventDefault();
                  openSubmenu(chainTo(path, row, target), true);
                }
                return true;
              }
              return false;
            }}
          >
            {entries.map((entry, index) => {
              if (entry.kind === "rule") return <MenuRule key={index} />;
              const at = rowPath(path, index);
              return (
                <MenuEntryRow
                  key={entry.id}
                  row={entry}
                  path={at}
                  lead={leads}
                  plain={menu.mascotsHidden}
                  open={open.includes(at)}
                  onPointerEnter={() => {
                    window.clearTimeout(rest.current);
                    const chain = chainTo(path, entry, at);
                    rest.current = window.setTimeout(() => setOpen(chain), REST_MS);
                  }}
                  onPress={(withKeys) => press(path, entry, at, withKeys)}
                />
              );
            })}
          </MenuSheet>
        );
      })}
    </div>
  );
};

// DESIGN.md section 8, Asking first: a card in the middle of the window over a dim. The keyboard starts on Cancel, so
// Enter never does the thing by accident, Tab stays inside the card, and Escape or a press on the dim is no.
const Ask: React.FC<{ ask: AskCard }> = ({ ask }) => {
  const answer = (yes: boolean) => void api().answer(ask.id, yes);
  return (
    <div
      className="h-full grid place-items-center bg-dim p-4"
      onPointerDown={(event) => event.target === event.currentTarget && answer(false)}
    >
      <AskSheet ask={ask} onAnswer={answer} />
    </div>
  );
};

// The card itself. `focusCancel` is off only where it's shown as a sample, in the component gallery.
export const AskSheet: React.FC<{ ask: AskCard; onAnswer: (yes: boolean) => void; focusCancel?: boolean }> = ({
  ask,
  onAnswer: answer,
  focusCancel = true,
}) => {
  const card = useRef<HTMLDivElement>(null);
  // The keyboard starts on Cancel, but its ring only shows once a key is used, so a card opened with the pointer has none.
  const [keys, setKeys] = useState(false);
  const ring = keys ? undefined : "focus-visible:ring-0";
  const ids = { question: `ask-${ask.id}-question`, detail: `ask-${ask.id}-detail` };
  return (
    <div
      ref={card}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={ids.question}
      aria-describedby={ids.detail}
      onKeyDown={(event) => {
        setKeys(true);
        if (event.key === "Escape") {
          event.preventDefault();
          answer(false);
        } else if (event.key === "Tab") {
          const buttons = [...(card.current?.querySelectorAll<HTMLElement>("button") ?? [])];
          const at = buttons.findIndex((button) => button === document.activeElement);
          event.preventDefault();
          buttons[(at + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        }
      }}
      className="w-[400px] max-w-full p-[22px] pb-[18px] rounded-menu bg-sheet text-ink shadow-ask animate-menu-in"
    >
      {ask.mascot && (
        <div className="size-[52px] mb-3.5 rounded-sheet bg-sheet-2 grid place-items-center">
          <Mascot size={38} mood="oops" look={ask.mascot.look} name={ask.mascot.name} hidden={ask.mascot.hidden} />
        </div>
      )}
      <h2 id={ids.question} className="mb-1.5 text-[16px] leading-[22px] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
        {ask.question}
      </h2>
      <p id={ids.detail} className="text-[13.5px] leading-[1.5] text-ink-2 whitespace-pre-line [overflow-wrap:anywhere]">
        {ask.detail}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        {ask.action === null ? (
          <Button autoFocus={focusCancel} className={ring} onClick={() => answer(false)}>
            OK
          </Button>
        ) : (
          <>
            <Button variant="raised" autoFocus={focusCancel} className={ring} onClick={() => answer(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => answer(true)}>
              {ask.action}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// The menu view: one of our menus, or Asking first, as main says, over everything else.
export const MenuApp: React.FC = () => {
  const [state] = useFromMain<MenuViewState>(null, api().current, api().onShown);

  const [theme] = useFromMain<ThemeState | null>(null, window.chromeAPI.theme.getTheme, window.chromeAPI.theme.onThemeUpdated);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme?.isDark ?? false);
  }, [theme?.isDark]);

  if (!state) return null;
  return state.kind === "menu" ? <OwnMenu key={state.menu.id} menu={state.menu} /> : <Ask key={state.ask.id} ask={state.ask} />;
};
