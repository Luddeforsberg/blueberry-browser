import { Latest, OneAtATime, type Turn } from "@shared/lateWork";
import { ATTACHMENT_WORDS, MAX_FILE_BYTES, MAX_FILES, type FileChip } from "@shared/attachments";

// The files in one prompt box, owned here from the moment one is asked for until main has let go of it. Main decides
// what each file is and keeps its count too: this only decides what's worth sending it.

export interface StagingCalls {
  chooseFiles: (kept: string[]) => Promise<FileChip[]>;
  addFiles: (files: { name: string; bytes: Uint8Array }[], kept: string[]) => Promise<FileChip[]>;
  discard: (id: string) => Promise<void>;
}

// A dropped or pasted file: its name and size are known at once, and its bytes are read only once it has a place.
export type Dropped = Pick<File, "name" | "size" | "slice">;

let localIds = 0;
const refused = (name: string, problem: string): FileChip => ({
  id: `refused-${++localIds}`,
  kind: null,
  name,
  fact: null,
  factInFull: null,
  thumbnail: null,
  problem,
});

// Adds go one at a time, so each counts what the one before it kept. Each belongs to the box as it was when it was
// asked for: one still waiting its turn after that box has gone never starts, and one that comes back after it is let
// go of at once, even if the box is there again by then.
export class FileStaging {
  private chips: FileChip[] = [];
  private readonly adds = new OneAtATime();
  private readonly boxes = new Latest();
  private box: Turn = this.boxes.next();

  constructor(
    private readonly calls: StagingCalls,
    private readonly changed: (chips: FileChip[]) => void,
  ) {}

  get files(): readonly FileChip[] {
    return this.chips;
  }

  // What main keeps for this box.
  kept(): string[] {
    return this.chips.filter((chip) => !chip.problem).map((chip) => chip.id);
  }

  choose(): Promise<void> {
    return this.add(async () => this.calls.chooseFiles(this.kept()));
  }

  // Only the bytes go, never a path, and only of the files there's room for, no more of each than it takes to say it's
  // too big. The rest are refused by their size and count alone, so a hundred files dropped read five.
  drop(list: readonly Dropped[]): Promise<void> {
    return this.add(async () => {
      let room = MAX_FILES - this.kept().length;
      const read = await Promise.all(
        list.map(async (file) => {
          if (file.size > MAX_FILE_BYTES) return refused(file.name, ATTACHMENT_WORDS.tooBig);
          if (room <= 0) return refused(file.name, ATTACHMENT_WORDS.tooMany);
          room--;
          try {
            return { name: file.name, bytes: new Uint8Array(await file.slice(0, MAX_FILE_BYTES + 1).arrayBuffer()) };
          } catch {
            // A folder, or a file that went while it was read.
            return refused(file.name, ATTACHMENT_WORDS.unreadable);
          }
        }),
      );
      const readable = read.flatMap((one) => ("bytes" in one ? [one] : []));
      const answered = readable.length > 0 ? await this.calls.addFiles(readable, this.kept()) : [];
      // Main answers each file in the order it was given, so the chips stay in the order they were dropped.
      let next = 0;
      return read.map((one) => ("bytes" in one ? (answered[next++] ?? refused(one.name, ATTACHMENT_WORDS.unreadable)) : one));
    });
  }

  remove(id: string): void {
    const chip = this.chips.find((one) => one.id === id);
    if (!chip) return;
    this.set(this.chips.filter((one) => one !== chip));
    if (!chip.problem) void this.calls.discard(id);
  }

  // Main has taken a message, and these were in the box as it went: those that went are its now, and those that didn't
  // go are let go of with them. Anything added since stays.
  letGo(ids: readonly string[]): void {
    const gone = this.chips.filter((chip) => ids.includes(chip.id));
    if (gone.length === 0) return;
    this.set(this.chips.filter((chip) => !gone.includes(chip)));
    this.discard(gone);
  }

  // The box is there, again after StrictMode takes it away to check.
  start(): void {
    if (!this.box.current) this.box = this.boxes.next();
  }

  // The box has gone, so everything main keeps for it is let go of, now and as any add still out comes back.
  close(): void {
    this.boxes.end();
    this.discard(this.chips);
    this.chips = [];
  }

  private add(work: () => Promise<FileChip[]>): Promise<void> {
    const box = this.box;
    return this.adds.run(async () => {
      if (!box.current) return;
      const chips = await work();
      if (!box.current) this.discard(chips);
      else if (chips.length > 0) this.set([...this.chips, ...chips]);
    });
  }

  private discard(chips: readonly FileChip[]): void {
    for (const chip of chips) if (!chip.problem) void this.calls.discard(chip.id);
  }

  private set(chips: FileChip[]): void {
    this.chips = chips;
    this.changed(chips);
  }
}
