import { describe, expect, it, vi } from "vitest";
import { ATTACHMENT_WORDS, MAX_FILE_BYTES, MAX_FILES, type FileChip } from "@shared/attachments";
import { FileStaging, type Dropped, type StagingCalls } from "./fileStaging";

const chip = (id: string, problem: string | null = null): FileChip => ({
  id,
  kind: problem ? null : "text",
  name: `${id}.txt`,
  fact: null,
  factInFull: null,
  thumbnail: null,
  problem,
});

// A file whose bytes are only read when asked, so a test can see which were.
const file = (name: string, size = 10) => {
  const read = vi.fn(() => ({ arrayBuffer: async () => new ArrayBuffer(Math.min(size, MAX_FILE_BYTES + 1)) }));
  return { name, size, slice: read, read } as unknown as Dropped & { read: ReturnType<typeof vi.fn> };
};

// Main as a stand-in that keeps up to five and answers only when the test lets it.
const main = () => {
  let made = 0;
  const kept = new Set<string>();
  const answers: Array<() => void> = [];
  const stage = (count: number, already: string[]): FileChip[] => {
    let room = MAX_FILES - already.filter((id) => kept.has(id)).length;
    return Array.from({ length: count }, () => {
      const id = `f${++made}`;
      if (room-- <= 0) return chip(id, ATTACHMENT_WORDS.tooMany);
      kept.add(id);
      return chip(id);
    });
  };
  const calls: StagingCalls & { discard: ReturnType<typeof vi.fn> } = {
    chooseFiles: (already) => new Promise((resolve) => answers.push(() => resolve(stage(3, already)))),
    addFiles: (files, already) => new Promise((resolve) => answers.push(() => resolve(stage(files.length, already)))),
    discard: vi.fn(async (id: string) => void kept.delete(id)),
  };
  return { calls, kept, answers };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the files in a prompt box", () => {
  it("reads only the files there's room for, and refuses the rest by their count and size", async () => {
    const server = main();
    const staging = new FileStaging(server.calls, () => {});
    const files = [1, 2, 3, 4, 5, 6].map((n) => file(`${n}.txt`));
    const big = file("big.mov", MAX_FILE_BYTES + 1);
    const done = staging.drop([big, ...files]);
    await settle();
    server.answers.shift()?.();
    await done;

    expect(files.slice(0, 5).every(({ read }) => read.mock.calls.length === 1)).toBe(true);
    expect(files[5]?.read).not.toHaveBeenCalled();
    expect(big.read).not.toHaveBeenCalled();
    expect(staging.files.map(({ name, problem }) => [name, problem])).toEqual([
      ["big.mov", ATTACHMENT_WORDS.tooBig],
      ["f1.txt", null],
      ["f2.txt", null],
      ["f3.txt", null],
      ["f4.txt", null],
      ["f5.txt", null],
      ["6.txt", ATTACHMENT_WORDS.tooMany],
    ]);
  });

  it("adds one at a time, so a second drop counts what the first kept", async () => {
    const server = main();
    const staging = new FileStaging(server.calls, () => {});
    const first = staging.drop([1, 2, 3].map((n) => file(`a${n}`)));
    const second = staging.drop([1, 2, 3].map((n) => file(`b${n}`)));
    await settle();
    expect(server.answers).toHaveLength(1);
    server.answers.shift()?.();
    await first;
    await settle();
    server.answers.shift()?.();
    await second;

    expect(staging.kept()).toHaveLength(MAX_FILES);
    expect(staging.files.filter(({ problem }) => problem === ATTACHMENT_WORDS.tooMany)).toHaveLength(1);
  });

  it("lets go of what an add brings back after its box has gone, even with the box there again, and never starts one queued", async () => {
    const server = main();
    const staging = new FileStaging(server.calls, () => {});
    const choosing = staging.choose();
    const queued = staging.choose();
    await settle();
    staging.close();
    staging.start();
    server.answers.shift()?.();
    await choosing;
    await queued;

    expect(server.answers).toHaveLength(0);
    expect(staging.files).toEqual([]);
    expect(server.kept.size).toBe(0);
    expect(server.calls.discard.mock.calls.map(([id]) => id)).toEqual(["f1", "f2", "f3"]);
  });

  it("lets go of only what was in the box as a message went, keeping a file added while it was on its way", async () => {
    const server = main();
    const staging = new FileStaging(server.calls, () => {});
    const first = staging.drop([file("a")]);
    await settle();
    server.answers.shift()?.();
    await first;
    const sent = staging.files.map(({ id }) => id);

    const added = staging.drop([file("b")]);
    await settle();
    server.answers.shift()?.();
    await added;
    staging.letGo(sent);

    expect(staging.files.map(({ id }) => id)).toEqual(["f2"]);
    expect(server.calls.discard.mock.calls.map(([id]) => id)).toEqual(["f1"]);
  });
});
