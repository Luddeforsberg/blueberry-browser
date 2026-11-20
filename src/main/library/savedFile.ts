import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { entriesOf, fieldsOf } from "../../shared/fields";

// Every file a store keeps is written, moved and removed here, and nowhere else (eslint.fences.mjs).
//
// A write goes beside the file and is renamed over it, so a crash or a full disk never leaves half a file: the file is
// either what it was or what was written. `saveFile` and `removeFile` never throw. They say whether it happened, and lint
// refuses a call that drops the answer, so nothing can say it was saved unless it was. A failed write leaves the file as
// it was, so a store that keeps what it saved last knows exactly what the next launch will read.

declare const saved: unique symbol;
// Whether a write or a removal happened. A boolean, marked so that eslint.saved.mjs can refuse any call that returns
// one and drops it, here or in a store passing it on.
export type Saved = boolean & { readonly [saved]: true };
const outcome = (happened: boolean) => happened as Saved;
// For a change that leaves the file as it is: what was asked is already what's saved.
export const NOTHING_TO_SAVE = outcome(true);
// For a change that isn't made, so nothing is saved: one that's refused, or would lose something already on file.
export const CANT_SAVE = outcome(false);

// The one way to drop whether it was saved, for a save nobody was told about, so not saving only means what `meaning`
// says. A store whose callers must know returns the `Saved` instead.
export const bestEffort = (saved: Saved, meaning: string): void => {
  if (!saved) console.error(meaning);
};

// Files that are there but couldn't be read or moved aside this launch. Writing over one would lose what may be the
// user's only copy, so it's moved aside before the first save, and nothing is saved there while it can't be.
const unread = new Set<string>();

// `contents` can be a function, for anything that can fail on the way, such as encrypting, so it's not saved either.
export const saveFile = (file: string, contents: string | Uint8Array | (() => string | Uint8Array), { secret = false } = {}): Saved => {
  if (unread.has(file)) {
    if (existsSync(file) && moveAside(file).movedTo === null) {
      console.error(`Couldn't save ${basename(file)} without writing over one that couldn't be read.`);
      return outcome(false);
    }
    unread.delete(file);
  }
  const temp = `${file}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, typeof contents === "function" ? contents() : contents, secret ? { mode: 0o600 } : {});
    renameSync(temp, file);
    return outcome(true);
  } catch (error) {
    console.error(`Couldn't save ${basename(file)}:`, error);
    try {
      rmSync(temp, { force: true });
    } catch {
      // The next write replaces it.
    }
    return outcome(false);
  }
};

// True once the file isn't there, including when it never was. A secret's copies moved aside go too, so removing a key
// or a sign-in leaves none of it behind.
export const removeFile = (file: string, { secret = false } = {}): Saved => {
  try {
    rmSync(file, { force: true });
    if (secret) {
      const aside = `${basename(file)}.corrupt-`;
      for (const name of readdirSync(dirname(file))) if (name.startsWith(aside)) rmSync(join(dirname(file), name), { force: true });
    }
    unread.delete(file);
    return outcome(true);
  } catch (error) {
    console.error(`Couldn't remove ${basename(file)}:`, error);
    return outcome(false);
  }
};

// Where a damaged file went. Null means it's where it was. `split` means moving it stopped partway and couldn't be
// undone, so some of its parts are at `movedTo` and the rest are still where they were.
export type MovedAside = { movedTo: null } | { movedTo: string; split: boolean };

// Moves a file and the parts beside it (`file` plus each suffix), in the order given, to a new name, never deleting
// any. If one won't move, the ones before it are put back.
export const moveAside = (file: string, suffixes: string[] = [""]): MovedAside => {
  const movedTo = `${file}.corrupt-${Date.now()}`;
  const moved: string[] = [];
  try {
    for (const suffix of suffixes) {
      if (!existsSync(file + suffix)) continue;
      renameSync(file + suffix, movedTo + suffix);
      moved.push(suffix);
    }
    return moved.length > 0 ? { movedTo, split: false } : { movedTo: null };
  } catch (error) {
    console.error(`Couldn't move ${basename(file)} aside:`, error);
    const stuck = moved.reverse().filter((suffix) => {
      try {
        renameSync(movedTo + suffix, file + suffix);
        return false;
      } catch {
        return true;
      }
    });
    return stuck.length > 0 ? { movedTo, split: true } : { movedTo: null };
  }
};

// The file's text, or undefined when there's none to read, or it couldn't be read.
export const readTextFile = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (fieldsOf(error).code === "ENOENT") return undefined;
    console.error(`Couldn't read ${basename(file)}:`, error);
    unread.add(file);
    return undefined;
  }
};

// What was saved, still to be checked, or undefined when there's nothing to read. A file that's there but isn't JSON is
// moved aside, never deleted, so the next save can't write over what may be the user's only copy.
export const readJsonFile = (file: string): unknown => {
  const text = readTextFile(file);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    const { movedTo } = moveAside(file);
    if (movedTo === null) unread.add(file);
    console.error(`${basename(file)} isn't readable, so it starts empty.${movedTo ? ` The old file is at ${movedTo}.` : ""}`);
    return undefined;
  }
};

// A saved list, each entry checked by `parse`. One that doesn't check out is left out, and the log says how many.
export const savedEntries = <T>(file: string, value: unknown, parse: (entry: unknown) => T | null): T[] => {
  const { entries, dropped } = entriesOf(value, parse);
  if (dropped > 0)
    console.error(`Left out ${dropped} saved ${dropped === 1 ? "entry" : "entries"} of ${basename(file)} that couldn't be read.`);
  return entries;
};
