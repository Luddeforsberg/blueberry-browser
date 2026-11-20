import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonFile, saveFile } from "./savedFile";

// A read or a rename this says no to fails as a busy or locked file would.
const refuse = vi.hoisted<{ read: (file: string) => boolean; rename: (from: string) => boolean }>(() => ({
  read: () => false,
  rename: () => false,
}));
vi.mock("fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("fs")>();
  const busy = () => Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      if (typeof args[0] === "string" && refuse.read(args[0])) throw busy();
      return fs.readFileSync(...args);
    },
    renameSync: (from: string, to: string) => {
      if (refuse.rename(from)) throw busy();
      fs.renameSync(from, to);
    },
  };
});
afterEach(() => {
  refuse.read = () => false;
  refuse.rename = () => false;
});

const savedFileWith = (contents: string) => {
  const folder = mkdtempSync(join(tmpdir(), "blueberry-saved-"));
  const file = join(folder, "list.json");
  writeFileSync(file, contents);
  const besideIt = () => readdirSync(folder).filter((name) => name !== "list.json");
  return { file, movedAside: () => besideIt().map((name) => readFileSync(join(folder, name), "utf8")) };
};

describe("saveFile", () => {
  it("moves a file it couldn't read aside before saving over it, and saves nothing while it can't", () => {
    const { file, movedAside } = savedFileWith('["the only copy"]');
    refuse.read = (path) => path === file;
    expect(readJsonFile(file)).toBeUndefined();
    refuse.read = () => false;

    refuse.rename = (from) => from === file;
    expect(saveFile(file, "[]")).toBe(false);
    expect(readFileSync(file, "utf8")).toBe('["the only copy"]');

    refuse.rename = () => false;
    expect(saveFile(file, "[]")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("[]");
    expect(movedAside()).toEqual(['["the only copy"]']);
    // Once it's out of the way, saving is as usual.
    expect(saveFile(file, "[1]")).toBe(true);
    expect(movedAside()).toHaveLength(1);
  });

  it("the same for one that isn't JSON and couldn't be moved aside when it was read", () => {
    const { file, movedAside } = savedFileWith("not json");
    refuse.rename = (from) => from === file;
    expect(readJsonFile(file)).toBeUndefined();
    expect(saveFile(file, "[]")).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("not json");

    refuse.rename = () => false;
    expect(saveFile(file, "[]")).toBe(true);
    expect(movedAside()).toEqual(["not json"]);
  });
});
