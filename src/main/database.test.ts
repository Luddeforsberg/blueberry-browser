import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "fs";
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
  const store = new ChatStore(file);
  store.createChat("Keep me");
  // `new ChatStore` never closes its handle, so this checkpoints through a handle of its own.
  const db = new DatabaseSync(file);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
};

describe("openStore", () => {
  it("opens a missing file, and a healthy one, without a word", () => {
    const file = tempFile();
    expect(open(file).problems).toEqual([]);
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
    const before = readdirSync(join(file, ".."));

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
    expect(readdirSync(join(file, ".."))).toEqual(before);
    expect(new ChatStore(file).summaries()).toHaveLength(1);
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
