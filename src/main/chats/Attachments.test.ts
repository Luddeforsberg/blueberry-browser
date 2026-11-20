import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ATTACHMENT_WORDS, MAX_FILE_BYTES, MAX_FILES, STAGED_FILE_MS } from "../../shared/attachments";
import { Attachments, type PreparePicture } from "./Attachments";
import { defined } from "../../shared/testing";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const fakePicture: PreparePicture = (bytes) => ({ data: bytes, mime: "image/png", thumbnail: "data:image/png;base64,thumb" });
const text = (name: string, words = "some words") => ({ name, bytes: new Uint8Array(Buffer.from(words)) });

const make = (paths: string[] = [], now = () => 0) => new Attachments(async () => paths, fakePicture, now);

describe("Attachments", () => {
  it("keeps up to five files a box holds, and says so on any past that, which never go", () => {
    const attachments = make();
    expect(attachments.addFiles([], [])).toEqual([]);
    const one = attachments.addFiles([text("a.txt")], []);
    expect(one).toMatchObject([{ kind: "text", name: "a.txt", problem: null }]);

    const four = attachments.addFiles(
      [1, 2, 3, 4].map((n) => text(`${n}.txt`)),
      [defined(one[0]).id],
    );
    expect(four.every((chip) => chip.problem === null)).toBe(true);
    const five = [defined(one[0]).id, ...four.map((chip) => chip.id)];
    expect(five).toHaveLength(MAX_FILES);
    expect(attachments.peek(five)).toHaveLength(MAX_FILES);

    const sixth = defined(attachments.addFiles([text("6.txt")], five)[0]);
    expect(sixth.problem).toBe(ATTACHMENT_WORDS.tooMany);
    expect(attachments.peek([...five, sixth.id])).toBeNull();
    expect(attachments.peek([sixth.id])).toBeNull();
  });

  it("counts only what main kept towards the five, so ids made up in a renderer make no room", () => {
    const attachments = make();
    const kept = attachments.addFiles(
      [1, 2, 3, 4, 5].map((n) => text(`${n}.txt`)),
      ["made-up", "made-up-too"],
    );
    expect(kept.every((chip) => chip.problem === null)).toBe(true);
  });

  it("gives back only what a chip needs, never a file's contents", () => {
    const chip = defined(make().addFiles([text("notes.txt", "The secret plan")], [])[0]);
    expect(JSON.stringify(chip)).not.toContain("secret");
    expect(Object.keys(chip).sort()).toEqual(["fact", "factInFull", "id", "kind", "name", "problem", "thumbnail"]);
  });

  it("refuses an id it never gave, one named twice and more than five, so nothing else can be sent", () => {
    const attachments = make();
    const a = defined(attachments.addFiles([text("a.txt")], [])[0]);
    expect(attachments.peek([])).toEqual([]);
    expect(attachments.peek([a.id])).toMatchObject([{ name: "a.txt", text: "some words" }]);
    expect(attachments.peek(["C:/Users/me/secret.txt"])).toBeNull();
    expect(attachments.peek([a.id, a.id])).toBeNull();
    attachments.drop([a.id]);
    expect(attachments.peek([a.id])).toBeNull();
  });

  it("decides what a dropped file is from its bytes, not its name", () => {
    const [program] = make().addFiles([{ name: "holiday.png", bytes: new Uint8Array(Buffer.from("MZ\u0090\u0000\u0003\u0000")) }], []);
    expect(program).toMatchObject({ name: "holiday.png", kind: null, problem: ATTACHMENT_WORDS.notAKind });
    const [picture] = make().addFiles([{ name: "notes.txt", bytes: new Uint8Array(PNG) }], []);
    expect(picture).toMatchObject({ kind: "picture", thumbnail: "data:image/png;base64,thumb", problem: null });
    const notBytes = defined(make().addFiles([{ name: "a.txt", bytes: "C:/a.txt" }], [])[0]);
    expect(notBytes.problem).toBe(ATTACHMENT_WORDS.unreadable);
  });

  it("reads files the user chose in the dialog, up to the limit and refusing one byte past it", async () => {
    const folder = mkdtempSync(join(tmpdir(), "attachments-"));
    const atLimit = join(folder, "at-limit.txt");
    const past = join(folder, "past.txt");
    writeFileSync(atLimit, Buffer.alloc(MAX_FILE_BYTES, "a"));
    writeFileSync(past, Buffer.alloc(MAX_FILE_BYTES + 1, "a"));
    const chips = await make([atLimit, past, folder]).chooseFiles([]);
    expect(chips.map(({ name, problem }) => [name, problem])).toEqual([
      ["at-limit.txt", null],
      ["past.txt", ATTACHMENT_WORDS.tooBig],
      [defined(chips[2]).name, ATTACHMENT_WORDS.unreadable],
    ]);
    expect(chips[0]).toMatchObject({ fact: ATTACHMENT_WORDS.cutShort, factInFull: ATTACHMENT_WORDS.cutShortInFull });
  });

  it("lets go of a file nobody sent after a while", () => {
    let now = 0;
    const attachments = make([], () => now);
    const a = defined(attachments.addFiles([text("a.txt")], [])[0]);
    now = STAGED_FILE_MS + 1;
    expect(attachments.peek([a.id])).toBeNull();
  });
});
