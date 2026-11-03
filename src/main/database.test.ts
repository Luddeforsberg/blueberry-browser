import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ChatStore } from "./ChatStore";
import { openStore, type StoreProblem } from "./database";
import { HistoryStore } from "./HistoryStore";

const tempFile = (name = "chats.db") => join(mkdtempSync(join(tmpdir(), "blueberry-db-")), name);

const open = (file: string) => {
  const problems: StoreProblem[] = [];
  const store = openStore(file, (path) => new ChatStore(path), (problem) => problems.push(problem));
  return { store, problems };
};

const savedChat = (file: string) => {
  // `new ChatStore` never closes its handle, and Windows won't move a file that's open, so this saves elsewhere and
  // copies the result. It checkpoints through a handle of its own.
  const source = tempFile();
  const store = new ChatStore(source);
  store.createChat("Keep me");
  const db = new DatabaseSync(source);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  copyFileSync(source, file);
};

describe("openStore", () => {
  it("opens a missing file, and a healthy one, without a word", () => {
    expect(open(tempFile()).problems).toEqual([]);

    const file = tempFile();
    savedChat(file);

    const { store, problems } = open(file);
    expect(problems).toEqual([]);
    expect(store.summaries().map((chat) => chat.title)).toEqual(["Keep me"]);
  });

  it("moves a file that isn't a database aside, keeps its bytes and starts empty", () => {
    const file = tempFile();
    writeFileSync(file, "this is not a database, not even a little".repeat(100));
    writeFileSync(`${file}-wal`, "an old log");

    const { store, problems } = open(file);
    expect(store.summaries()).toEqual([]);
    expect(problems).toHaveLength(1);
    const movedTo = problems[0].movedTo!;
    expect(readFileSync(movedTo, "utf8")).toContain("not a database");
    expect(readFileSync(`${movedTo}-wal`, "utf8")).toBe("an old log");

    store.createChat("A new start");
    expect(open(file).problems).toEqual([]);
  });

  it("notices damage deep in a file that still opens", () => {
    const file = tempFile();
    savedChat(file);
    const bytes = readFileSync(file);
    // Everything after the first page: the header is fine, so opening it works.
    writeFileSync(file, Buffer.concat([bytes.subarray(0, 4096), Buffer.alloc(bytes.length - 4096, 0xff)]));

    const { store, problems } = open(file);
    expect(problems).toHaveLength(1);
    expect(problems[0].movedTo).not.toBeNull();
    expect(store.summaries()).toEqual([]);
  });

  it("reads changes still in the write-ahead log, as after a crash", () => {
    const file = tempFile();
    const store = new ChatStore(file);
    store.createChat("Only in the log");
    expect(readFileSync(`${file}-wal`).length).toBeGreaterThan(0);

    const { store: opened, problems } = open(file);
    expect(problems).toEqual([]);
    expect(opened.summaries().map((chat) => chat.title)).toEqual(["Only in the log"]);
  });

  it("treats an empty file as a new database", () => {
    const file = tempFile();
    writeFileSync(file, "");
    expect(open(file).problems).toEqual([]);
  });

  it("leaves a file alone when the trouble isn't damage, and carries on in memory", () => {
    const file = tempFile();
    savedChat(file);

    const problems: StoreProblem[] = [];
    let attempts = 0;
    const store = openStore(
      file,
      (path) => {
        if (attempts++ === 0) throw Object.assign(new Error("database is locked"), { errcode: 5 });
        return new ChatStore(path);
      },
      (problem) => problems.push(problem)
    );

    expect(problems).toEqual([{ movedTo: null }]);
    expect(store.summaries()).toEqual([]);
    // Reading a database can leave SQLite's empty helper files beside it, so this only looks for the file moving.
    expect(readdirSync(join(file, "..")).filter((name) => name.includes("corrupt"))).toEqual([]);
    expect(new ChatStore(file).summaries()).toHaveLength(1);
  });

  it("tells the store when it isn't opening what was saved", () => {
    const opened = (prepare: (file: string) => void, fail = false) => {
      const file = tempFile();
      prepare(file);
      const recovered: boolean[] = [];
      let attempts = 0;
      openStore(
        file,
        (path, isRecovered) => {
          if (fail && attempts++ === 0) throw Object.assign(new Error("database is locked"), { errcode: 5 });
          recovered.push(isRecovered);
          return new ChatStore(path);
        },
        () => {}
      );
      return recovered;
    };
    expect(opened(savedChat)).toEqual([false]);
    expect(opened((file) => writeFileSync(file, "not a database".repeat(100)))).toEqual([true]);
    expect(opened(savedChat, true)).toEqual([true]);
  });

  it("recovers the history database the same way", () => {
    const file = tempFile("history.db");
    writeFileSync(file, "garbage".repeat(1000));
    const problems: StoreProblem[] = [];
    const store = openStore(file, (path) => new HistoryStore(path), (problem) => problems.push(problem));

    expect(problems[0].movedTo).toContain("history.db.corrupt-");
    expect(existsSync(problems[0].movedTo!)).toBe(true);
    store.record("https://a.example/", "A", null, 1);
    expect(store.recent()).toHaveLength(1);
  });
});
