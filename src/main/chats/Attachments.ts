import { randomUUID } from "crypto";
import { open } from "fs/promises";
import { basename } from "path";
import {
  ATTACHMENT_WORDS,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
  MAX_FILES,
  STAGED_FILE_MS,
  type FileChip,
  type FileKind,
  type SentAttachment,
} from "../../shared/attachments";
import { cleanFileName, sniffFile } from "./fileKind";
import { fieldsOf } from "../../shared/fields";

// A file the user added to a prompt box, read and checked in main and kept here until it's sent with a message or let
// go. Nothing of its contents goes back to a renderer: only its chip.
export interface PreparedFile {
  kind: FileKind;
  name: string;
  // For a picture or a PDF, what goes to the model, as main made it. Null for text.
  data: Buffer | null;
  mime: string | null;
  // For a text file, its words, cut to the limit.
  text: string | null;
  fact: string | null;
  thumbnail: string | null;
}

interface Staged extends PreparedFile {
  stagedAt: number;
}

// A picture as it goes: scaled to the limit, in a format a provider takes, with a small thumbnail for its chip. Null if
// it can't be opened. Electron's in the app, a stand-in in tests.
export type PreparePicture = (bytes: Buffer) => { data: Buffer; mime: string; thumbnail: string } | null;

export const sentAttachment = (file: PreparedFile): SentAttachment => ({
  kind: file.kind,
  name: file.name,
  fact: file.fact,
  thumbnail: file.thumbnail,
});

// Only the first byte past the limit is ever read, which is enough to say it's too big.
const readUpToLimit = async (path: string): Promise<Buffer | null> => {
  try {
    const handle = await open(path, "r");
    try {
      if (!(await handle.stat()).isFile()) return null;
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let read = 0;
      while (read < buffer.length) {
        const { bytesRead } = await handle.read(buffer, read, buffer.length - read, read);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      return buffer.subarray(0, read);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
};

const pages = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

// A file that won't go, with why, and an id that names nothing main keeps.
const refused = (name: unknown, problem: string): FileChip => ({
  id: randomUUID(),
  kind: null,
  name: cleanFileName(name, MAX_FILE_NAME_LENGTH),
  fact: null,
  factInFull: null,
  thumbnail: null,
  problem,
});

export class Attachments {
  private readonly staged = new Map<string, Staged>();

  constructor(
    // The system's own dialog, opened by main. Answers with what the user chose, which never leaves main.
    private readonly pickFiles: () => Promise<string[]>,
    private readonly preparePicture: PreparePicture,
    private readonly now: () => number = Date.now,
  ) {}

  // What was read, judged. Refused files get a chip with the reason and are never kept.
  prepare(name: unknown, bytes: Buffer): PreparedFile | { name: string; problem: string } {
    const clean = cleanFileName(name, MAX_FILE_NAME_LENGTH);
    const sniffed = sniffFile(bytes);
    if ("refused" in sniffed) return { name: clean, problem: sniffed.refused };
    if (sniffed.kind === "text") {
      return {
        kind: "text",
        name: clean,
        data: null,
        mime: null,
        text: sniffed.text,
        fact: sniffed.cut ? ATTACHMENT_WORDS.cutShort : null,
        thumbnail: null,
      };
    }
    if (sniffed.kind === "pdf") {
      return {
        kind: "pdf",
        name: clean,
        data: bytes,
        mime: "application/pdf",
        text: null,
        fact: sniffed.pages === null ? null : pages(sniffed.pages),
        thumbnail: null,
      };
    }
    const picture = this.preparePicture(bytes);
    if (!picture) return { name: clean, problem: ATTACHMENT_WORDS.brokenPicture };
    return { kind: "picture", name: clean, data: picture.data, mime: picture.mime, text: null, fact: null, thumbnail: picture.thumbnail };
  }

  // Each file chosen in the system's dialog, read one at a time, and only while there's room. `kept` is what the box
  // holds already, so the count is main's to keep.
  async chooseFiles(kept: unknown): Promise<FileChip[]> {
    const paths = await this.pickFiles();
    const room = this.roomFor(kept);
    const chips: FileChip[] = [];
    for (const path of paths) {
      const name = basename(path);
      chips.push(room.left > 0 ? this.stageOne(name, await readUpToLimit(path), room) : refused(name, ATTACHMENT_WORDS.tooMany));
    }
    return chips;
  }

  // Files dropped or pasted onto the box, as their bytes. Never a path.
  addFiles(files: unknown, kept: unknown): FileChip[] {
    if (!Array.isArray(files)) return [];
    const room = this.roomFor(kept);
    return files.map((file) => {
      const { name, bytes } = fieldsOf(file);
      if (room.left <= 0) return refused(name, ATTACHMENT_WORDS.tooMany);
      return this.stageOne(name, bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null, room);
    });
  }

  private roomFor(kept: unknown): { left: number } {
    this.letGoOfOld();
    const already = (Array.isArray(kept) ? kept : []).filter((id) => typeof id === "string" && this.staged.has(id));
    return { left: MAX_FILES - new Set(already).size };
  }

  // One file, judged and kept if it may go. A refused one takes no room, so only one that's kept counts.
  private stageOne(name: unknown, bytes: Buffer | null, room: { left: number }): FileChip {
    const id = randomUUID();
    const prepared = bytes ? this.prepare(name, bytes) : { name, problem: ATTACHMENT_WORDS.unreadable };
    if ("problem" in prepared) return refused(prepared.name, prepared.problem);
    room.left--;
    this.staged.set(id, { ...prepared, stagedAt: this.now() });
    const factInFull = prepared.fact === ATTACHMENT_WORDS.cutShort ? ATTACHMENT_WORDS.cutShortInFull : prepared.fact;
    return { id, kind: prepared.kind, name: prepared.name, fact: prepared.fact, factInFull, thumbnail: prepared.thumbnail, problem: null };
  }

  discard(id: unknown): void {
    if (typeof id === "string") this.staged.delete(id);
  }

  // The files these ids name, for a message, or null if any isn't one main kept, is named twice, or there are too many.
  // They stay here until `drop`, so a message that's refused can still be sent again.
  peek(ids: readonly string[]): PreparedFile[] | null {
    this.letGoOfOld();
    if (ids.length > MAX_FILES || new Set(ids).size !== ids.length) return null;
    const files = ids.map((id) => this.staged.get(id));
    return files.every((file): file is Staged => file !== undefined) ? files.map(({ stagedAt: _, ...file }) => file) : null;
  }

  drop(ids: readonly string[]): void {
    ids.forEach((id) => this.staged.delete(id));
  }

  private letGoOfOld(): void {
    const oldest = this.now() - STAGED_FILE_MS;
    this.staged.forEach((file, id) => {
      if (file.stagedAt < oldest) this.staged.delete(id);
    });
  }
}
