import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { sanitizeSession, savedEntries, SessionStore, type Session } from "./Session";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "blueberry-session-")), "session.json");

const web = (url: string) => ({ url, title: "T", favicon: null, entries: [{ url, title: "T" }], index: 0 });

const session = (overrides: Partial<Session> = {}): Session => ({
  tabs: [web("https://a.example/")],
  active: 0,
  sidebarOpen: true,
  chatOpen: false,
  width: 1000,
  height: 700,
  ...overrides,
});

describe("savedEntries", () => {
  it("drops page state, which can hold posted passwords", () => {
    const { entries } = savedEntries([{ url: "https://a.example/", title: "A", pageState: "c2VjcmV0" } as never], 0);
    expect(entries).toEqual([{ url: "https://a.example/", title: "A" }]);
  });

  it("drops pages that can't be restored and keeps the index on the same page", () => {
    expect(
      savedEntries(
        [
          { url: "chrome://crash", title: "" },
          { url: "https://a.example/", title: "A" },
          { url: "about:blank", title: "" },
          { url: "https://b.example/", title: "B" },
        ],
        3
      )
    ).toEqual({
      entries: [
        { url: "https://a.example/", title: "A" },
        { url: "https://b.example/", title: "B" },
      ],
      index: 1,
    });
  });

  it("has nothing to restore with no entries, or a current page that can't be restored", () => {
    expect(savedEntries([], 0)).toEqual({ entries: [], index: 0 });
    expect(savedEntries([{ url: "https://a.example/", title: "" }], -1)).toEqual({ entries: [], index: 0 });
    expect(savedEntries([{ url: "https://a.example/", title: "" }], 1)).toEqual({ entries: [], index: 0 });
    expect(savedEntries([{ url: "about:blank", title: "" }], 0)).toEqual({ entries: [], index: 0 });
  });

  it("keeps at most fifty pages around the current one", () => {
    const entries = Array.from({ length: 51 }, (_, n) => ({ url: `https://a.example/${n}`, title: "" }));

    const atEnd = savedEntries(entries, 50);
    expect(atEnd.entries).toHaveLength(26);
    expect(atEnd.entries[atEnd.index].url).toBe("https://a.example/50");

    const atStart = savedEntries(entries, 0);
    expect(atStart.entries).toHaveLength(50);
    expect(atStart.entries[atStart.index].url).toBe("https://a.example/0");

    expect(savedEntries(entries.slice(0, 50), 0).entries).toHaveLength(50);
  });
});

describe("sanitizeSession", () => {
  it("has no session for anything that isn't one", () => {
    expect(sanitizeSession(null)).toBeNull();
    expect(sanitizeSession({ tabs: "many" })).toBeNull();
    expect(sanitizeSession({ tabs: [] })).toBeNull();
    expect(sanitizeSession({ tabs: [{ url: "chrome://crash" }, { page: "nonsense" }] })).toBeNull();
  });

  it("drops tabs that can't reopen, with the same tab still active", () => {
    const restored = sanitizeSession({
      tabs: [{ url: "javascript:alert(1)" }, web("https://a.example/"), { page: "settings" }, web("https://b.example/")],
      active: 2,
    });
    expect(restored?.tabs).toHaveLength(3);
    expect(restored?.active).toBe(1);
    expect(restored?.tabs[1]).toEqual({ page: "settings", param: null, title: "" });
  });

  it("falls back to the first tab and the usual layout for bad values", () => {
    expect(
      sanitizeSession({ tabs: [web("https://a.example/")], active: 9, sidebarOpen: "no", chatOpen: 1, width: "wide", height: -5 })
    ).toMatchObject({ active: 0, sidebarOpen: true, chatOpen: false, width: 0, height: 0 });
  });

  it("keeps a closed sidebar and an open chat", () => {
    expect(sanitizeSession(session({ sidebarOpen: false, chatOpen: true }))).toMatchObject({
      sidebarOpen: false,
      chatOpen: true,
    });
  });
});

describe("SessionStore", () => {
  it("reads back what it wrote", () => {
    const file = tempFile();
    const store = new SessionStore(file);
    store.saveSoon(() => session({ active: 0 }));
    store.flush();

    expect(new SessionStore(file).load()).toEqual(session());
  });

  it("has nothing to load from a missing or corrupt file", () => {
    const file = tempFile();
    expect(new SessionStore(file).load()).toBeNull();
    writeFileSync(file, "{ not json");
    expect(new SessionStore(file).load()).toBeNull();
  });

  it("removes the file when there is nothing to keep", () => {
    const file = tempFile();
    const store = new SessionStore(file);
    store.saveSoon(() => session());
    store.flush();
    expect(existsSync(file)).toBe(true);

    store.saveSoon(() => null);
    store.flush();
    expect(existsSync(file)).toBe(false);
  });

  it("writes once for many changes, using the newest", () => {
    const file = tempFile();
    const store = new SessionStore(file);
    let reads = 0;
    store.saveSoon(() => (reads++, session({ width: 1 })));
    store.saveSoon(() => (reads++, session({ width: 2 })));
    store.flush();
    store.flush();

    expect(reads).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8")).width).toBe(2);
  });
});
