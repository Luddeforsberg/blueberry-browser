import { describe, expect, it, vi } from "vitest";
import { AskBook, buildMenu, MenuBook, toElectronMenu, type OwnMenuItem } from "./ownMenu";
import type { MenuEntry } from "../shared/ipc";

const rows = (entries: MenuEntry[]) => entries.map((entry) => (entry.kind === "rule" ? "-" : entry.label));
const row = (entries: MenuEntry[], label: string) => {
  const found = entries.find((entry) => entry.kind === "row" && entry.label === label);
  if (found?.kind !== "row") throw new Error(`No ${label}`);
  return found;
};

describe("buildMenu", () => {
  it("drops hidden rows, and keeps separators only between two groups", () => {
    const { entries } = buildMenu(
      [
        { type: "separator" },
        { label: "Back", click: () => {} },
        { type: "separator" },
        { type: "separator" },
        { label: "Hidden", visible: false, click: () => {} },
        { type: "separator" },
        { label: "Reload", click: () => {} },
        { type: "separator" },
      ],
      { mac: false }
    );
    expect(rows(entries)).toEqual(["Back", "-", "Reload"]);
  });

  it("gives an empty list nothing to draw", () => {
    expect(buildMenu([], { mac: false }).entries).toEqual([]);
    expect(buildMenu([{ type: "separator" }, { label: "Gone", visible: false }], { mac: false }).entries).toEqual([]);
  });

  it("writes shortcuts as this computer does, and says which rows are switches", () => {
    const items: OwnMenuItem[] = [
      { label: "Copy", accelerator: "CmdOrCtrl+C", click: () => {} },
      { label: "Hide Berry", type: "checkbox", checked: true, click: () => {} },
      { label: "Keep Berry Still", type: "checkbox", click: () => {} },
    ];
    expect(row(buildMenu(items, { mac: false }).entries, "Copy").shortcut).toBe("Ctrl C");
    expect(row(buildMenu(items, { mac: true }).entries, "Copy").shortcut).toBe("⌘C");
    const { entries } = buildMenu(items, { mac: false });
    expect([row(entries, "Copy").checked, row(entries, "Hide Berry").checked, row(entries, "Keep Berry Still").checked]).toEqual([null, true, false]);
  });

  it("keeps an action only for rows that can be used, so an id for anything else does nothing", () => {
    const { entries, actions } = buildMenu(
      [
        { label: "Forward", enabled: false, click: () => {} },
        { label: "No Spelling Suggestions" },
        { label: "Reload", click: () => {} },
      ],
      { mac: false }
    );
    expect(row(entries, "Forward").enabled).toBe(false);
    expect(row(entries, "No Spelling Suggestions").enabled).toBe(false);
    expect(actions.has(row(entries, "Forward").id)).toBe(false);
    expect(actions.has(row(entries, "No Spelling Suggestions").id)).toBe(false);
    expect(actions.has(row(entries, "Reload").id)).toBe(true);
  });

  it("gives every row its own id, submenus too, and a submenu's row runs nothing itself", () => {
    const save = vi.fn();
    const { entries, actions } = buildMenu(
      [
        { label: "File", submenu: [{ label: "Save", click: save }] },
        { label: "Empty", submenu: [{ label: "Gone", visible: false }] },
      ],
      { mac: false }
    );
    expect(rows(entries)).toEqual(["File"]);
    const file = row(entries, "File");
    const saveRow = row(file.submenu ?? [], "Save");
    expect(file.id).not.toBe(saveRow.id);
    expect(actions.has(file.id)).toBe(false);
    actions.get(saveRow.id)?.();
    expect(save).toHaveBeenCalledOnce();
  });

  it("runs an editing row on what the caller says had the keyboard", () => {
    const copy = vi.fn();
    const { entries, actions } = buildMenu([{ label: "Copy", role: "copy" }], { mac: false, role: (name) => () => copy(name) });
    actions.get(row(entries, "Copy").id)?.();
    expect(copy).toHaveBeenCalledWith("copy");
    // With nothing to run it on, it can't be used.
    expect(row(buildMenu([{ label: "Copy", role: "copy" }], { mac: false }).entries, "Copy").enabled).toBe(false);
  });
});

describe("toElectronMenu", () => {
  it("keeps what the menu bar needs: roles, keys, switches and submenus", () => {
    const [edit] = toElectronMenu([
      {
        label: "Edit",
        submenu: [
          { label: "Copy", icon: "copy", accelerator: "CmdOrCtrl+C", role: "copy" },
          { type: "separator" },
          { id: "h", label: "Horizontal Tabs", type: "checkbox", checked: true, click: () => {} },
        ],
      },
    ]);
    // Electron drops the submenu of an item typed "normal", and with it the menu bar and every shortcut in it.
    expect(edit.type).toBe("submenu");
    expect(edit.submenu).toEqual([
      expect.objectContaining({ label: "Copy", role: "copy", accelerator: "CmdOrCtrl+C" }),
      { type: "separator" },
      expect.objectContaining({ id: "h", type: "checkbox", checked: true }),
    ]);
    // Our icon names mean nothing to Electron, which would read a string as a file.
    expect(edit.submenu).not.toContainEqual(expect.objectContaining({ icon: expect.anything() }));
    expect(Array.isArray(edit.submenu) && typeof edit.submenu[2].click).toBe("function");
  });
});

describe("MenuBook", () => {
  const ids = () => {
    let count = 0;
    return () => `menu-${++count}`;
  };

  it("runs a row once, for the menu it came with", () => {
    const book = new MenuBook(ids());
    const action = vi.fn();
    const id = book.start(new Map([["1", action]]));
    expect(book.take(id, "1")).toBe(action);
    expect(book.take(id, "1")).toBeNull();
    expect(book.id).toBeNull();
  });

  it("ignores an id from an older menu, an unknown row and anything that isn't a string", () => {
    const book = new MenuBook(ids());
    const old = book.start(new Map([["1", () => {}]]));
    const current = book.start(new Map([["1", () => {}]]));
    expect(book.take(old, "1")).toBeNull();
    expect(book.take(current, "2")).toBeNull();
    expect(book.take(current, 1)).toBeNull();
    expect(book.take(undefined, "1")).toBeNull();
    expect(book.take(current, "1")).not.toBeNull();
  });

  it("closes only the menu named, and nothing once it's closed", () => {
    const book = new MenuBook(ids());
    const id = book.start(new Map([["1", () => {}]]));
    expect(book.end("menu-0")).toBe(false);
    expect(book.end(id)).toBe(true);
    expect(book.end()).toBe(false);
    expect(book.take(id, "1")).toBeNull();
  });
});

describe("AskBook", () => {
  it("is yes only for its own id and exactly true", async () => {
    const book = new AskBook(() => "ask-1");
    const { id, answer } = book.start();
    expect(book.answer("ask-2", true)).toBe(false);
    expect(book.answer(id, "yes")).toBe(true);
    await expect(answer).resolves.toBe(false);
  });

  it("answers once", async () => {
    const book = new AskBook(() => "ask-1");
    const { id, answer } = book.start();
    expect(book.answer(id, true)).toBe(true);
    expect(book.answer(id, false)).toBe(false);
    await expect(answer).resolves.toBe(true);
  });

  it("takes a second question, or the view going, as no to the first", async () => {
    let count = 0;
    const book = new AskBook(() => `ask-${++count}`);
    const first = book.start();
    const second = book.start();
    await expect(first.answer).resolves.toBe(false);
    expect(book.answer(first.id, true)).toBe(false);
    book.cancel();
    await expect(second.answer).resolves.toBe(false);
    expect(book.id).toBeNull();
  });
});
