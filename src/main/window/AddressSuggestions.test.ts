import type { View } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { AddressSuggestion, AddressSuggestionsShown } from "../../shared/ipc";

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("electron", () => ({}));
vi.mock("./chromeView", () => ({
  createChromeView: () => {
    let visible = false;
    return {
      view: {
        setVisible: (shown: boolean) => (visible = shown),
        getVisible: () => visible,
        setBounds: () => {},
        webContents: { isDestroyed: () => false, send: (_: string, payload: unknown) => sent.push(payload), close: () => {} },
      },
    };
  },
}));

const { AddressSuggestions } = await import("./AddressSuggestions");

const row = (title: string): AddressSuggestion => ({ kind: "bookmark", title, url: `https://${title}.example/`, favicon: null });
const request = (...titles: string[]) => ({ rows: titles.map(row), selected: 0, field: { x: 0, y: 0, width: 300, height: 30 } });
const lastShown = () => sent.filter(Boolean).at(-1) as AddressSuggestionsShown;

describe("AddressSuggestions", () => {
  it("acts on the row pressed in the list that was drawn, never the one at that place in a newer list", () => {
    const list = new AddressSuggestions({ addChildView: () => {} } as unknown as View);
    const window = { width: 1200, height: 800 };
    list.show(request("drawn"), window);
    const drawn = lastShown().listId;
    // A late history answer reaches main before the view has drawn it.
    list.show(request("newer"), window);
    expect(list.pick(drawn, 0)).toBeNull();

    const newest = lastShown().listId;
    list.close();
    // A press can land after the field's blur closed the list, and still counts, once.
    expect(list.pick(newest, 0)).toEqual(row("newer"));
    expect(list.pick(newest, 0)).toBeNull();
    list.show(request("again"), window);
    expect(list.pick(lastShown().listId, 1)).toBeNull();
    expect(list.pick("1", 0)).toBeNull();
  });
});
