import { randomUUID } from "crypto";
import type { MenuItemConstructorOptions } from "electron";
import type { MenuEntry, MenuIcon } from "../shared/ipc";
import { menuShortcut } from "../shared/shortcuts";

// The editing commands the app's menu offers, which act on whatever had the keyboard.
export type EditRole = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

// A menu as main describes it (DESIGN.md section 8, Menus). Our menu view draws it, and the app's menu, the Mac's menu
// bar, is made from the same description through `toElectronMenu`.
export type OwnMenuItem =
  | { type: "separator" }
  | {
      type?: "normal" | "checkbox";
      id?: string;
      label: string;
      icon?: MenuIcon;
      enabled?: boolean;
      visible?: boolean;
      checked?: boolean;
      // Deletes or removes. It goes last, after a separator.
      danger?: boolean;
      accelerator?: string;
      role?: EditRole;
      click?: () => void;
      submenu?: OwnMenuItem[];
    };

type Row = Exclude<OwnMenuItem, { type: "separator" }>;
const isRow = (item: OwnMenuItem): item is Row => item.type !== "separator";

export interface BuiltMenu {
  entries: MenuEntry[];
  // What each row does, by its id. Rows that can't be used now have nothing here.
  actions: Map<string, () => void>;
}

// The rows the menu view draws, each with an id that means something only in this one menu, and what each id does,
// which stays in main. Hidden rows go, and separators only ever split two groups.
export const buildMenu = (items: OwnMenuItem[], options: { mac: boolean; role?: (role: EditRole) => () => void }): BuiltMenu => {
  const actions = new Map<string, () => void>();
  let next = 0;
  const build = (list: OwnMenuItem[]): MenuEntry[] => {
    const entries: MenuEntry[] = [];
    for (const item of list) {
      if (!isRow(item)) {
        if (entries.length > 0 && entries.at(-1)?.kind !== "rule") entries.push({ kind: "rule" });
        continue;
      }
      if (item.visible === false) continue;
      const submenu = item.submenu ? build(item.submenu) : null;
      if (submenu && submenu.length === 0) continue;
      const action = submenu ? undefined : item.role ? options.role?.(item.role) : item.click;
      const enabled = (item.enabled ?? true) && (submenu !== null || action !== undefined);
      const id = String(++next);
      if (enabled && action) actions.set(id, action);
      entries.push({
        kind: "row",
        id,
        label: item.label,
        icon: item.icon ?? null,
        enabled,
        checked: item.type === "checkbox" ? item.checked === true : null,
        danger: item.danger === true,
        shortcut: item.accelerator ? menuShortcut(item.accelerator, options.mac) : null,
        submenu,
      });
    }
    if (entries.at(-1)?.kind === "rule") entries.pop();
    return entries;
  };
  return { entries: build(items), actions };
};

// The same description for Electron, for the Mac's menu bar and the keys the menu holds everywhere.
export const toElectronMenu = (items: OwnMenuItem[]): MenuItemConstructorOptions[] =>
  items.map((item) => {
    if (!isRow(item)) return { type: "separator" };
    const { click } = item;
    return {
      id: item.id,
      label: item.label,
      // Electron reads a submenu only from an item whose type is "submenu" or left out, never "normal".
      type: item.type ?? (item.submenu ? "submenu" : "normal"),
      checked: item.checked,
      enabled: item.enabled,
      visible: item.visible,
      accelerator: item.accelerator,
      role: item.role,
      click: click && (() => click()),
      submenu: item.submenu && toElectronMenu(item.submenu),
    };
  });

// The one menu that's open, and what its rows do. A row acts once, only for the menu it was sent in: a new menu, a
// close, or an id main never gave all leave nothing to run.
export class MenuBook {
  private open: { id: string; actions: Map<string, () => void> } | null = null;

  constructor(private readonly newId: () => string = randomUUID) {}

  get id(): string | null {
    return this.open?.id ?? null;
  }

  start(actions: Map<string, () => void>): string {
    const id = this.newId();
    this.open = { id, actions };
    return id;
  }

  // What the row does, taken once, which closes the menu.
  take(menuId: unknown, rowId: unknown): (() => void) | null {
    if (!this.open || menuId !== this.open.id || typeof rowId !== "string") return null;
    const action = this.open.actions.get(rowId);
    if (!action) return null;
    this.open = null;
    return action;
  }

  // Closes the menu, or only the one named. Says whether one closed.
  end(menuId?: unknown): boolean {
    if (!this.open || (menuId !== undefined && menuId !== this.open.id)) return false;
    this.open = null;
    return true;
  }
}

// The one question that's asking first. Only an answer for its own id settles it, and only `true` is yes. Anything else
// that ends it, such as another question or the window closing, is no.
export class AskBook {
  private pending: { id: string; resolve: (yes: boolean) => void } | null = null;

  constructor(private readonly newId: () => string = randomUUID) {}

  get id(): string | null {
    return this.pending?.id ?? null;
  }

  start(): { id: string; answer: Promise<boolean> } {
    this.cancel();
    const id = this.newId();
    const answer = new Promise<boolean>((resolve) => (this.pending = { id, resolve }));
    return { id, answer };
  }

  answer(askId: unknown, yes: unknown): boolean {
    if (!this.pending || askId !== this.pending.id) return false;
    const { resolve } = this.pending;
    this.pending = null;
    resolve(yes === true);
    return true;
  }

  cancel(): void {
    if (this.pending) this.answer(this.pending.id, false);
  }
}
