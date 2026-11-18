import { describe, expect, it } from "vitest";
import { ATTACHMENT_WORDS, MAX_FILE_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARACTERS } from "../shared/attachments";
import { cleanFileName, sniffFile } from "./fileKind";

const bytes = (...parts: Array<string | number[]>) =>
  Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part))));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("sniffFile", () => {
  it("tells each kind it reads from its contents", () => {
    expect(sniffFile(bytes(PNG, "rest"))).toEqual({ kind: "picture", format: "png" });
    expect(sniffFile(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"))).toEqual({ kind: "picture", format: "jpeg" });
    expect(sniffFile(bytes("%PDF-1.7\n1 0 obj << /Type /Page >> endobj 2 0 obj << /Type /Pages /Count 1 >>"))).toEqual({
      kind: "pdf",
      pages: 1,
    });
    expect(sniffFile(bytes("Flight KL1234, 12 December\n"))).toEqual({ kind: "text", text: "Flight KL1234, 12 December\n", cut: false });
  });

  it("goes by what's in a file, so an executable with a picture's name is still refused", () => {
    // The start of a Windows program, and of a Linux one. Their names are never looked at.
    expect(sniffFile(bytes("MZ", [0x90, 0x00, 0x03, 0x00, 0x00, 0x00]))).toEqual({ refused: ATTACHMENT_WORDS.notAKind });
    expect(sniffFile(bytes([0x7f], "ELF", [0x02, 0x01, 0x01, 0x00]))).toEqual({ refused: ATTACHMENT_WORDS.notAKind });
    expect(sniffFile(bytes("PK", [0x03, 0x04, 0x14, 0x00, 0x00, 0x00]))).toEqual({ refused: ATTACHMENT_WORDS.notAKind });
  });

  it("refuses the pictures, videos and sounds it can't scale or read, saying which", () => {
    expect(sniffFile(bytes("GIF89a", [1, 0, 1, 0]))).toEqual({ refused: ATTACHMENT_WORDS.picture });
    expect(sniffFile(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toEqual({ refused: ATTACHMENT_WORDS.picture });
    expect(sniffFile(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]))).toEqual({ refused: ATTACHMENT_WORDS.picture });
    expect(sniffFile(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0]))).toEqual({ refused: ATTACHMENT_WORDS.video });
    expect(sniffFile(bytes([0x1a, 0x45, 0xdf, 0xa3], "webm"))).toEqual({ refused: ATTACHMENT_WORDS.video });
    expect(sniffFile(bytes("ID3", [4, 0, 0]))).toEqual({ refused: ATTACHMENT_WORDS.sound });
    expect(sniffFile(bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({
      refused: ATTACHMENT_WORDS.svg,
    });
  });

  it("refuses an empty file, and one past the size limit, but not one at it", () => {
    expect(sniffFile(new Uint8Array(0))).toEqual({ refused: ATTACHMENT_WORDS.empty });
    expect(sniffFile(bytes("a"))).toMatchObject({ kind: "text" });
    const atLimit = Buffer.concat([Buffer.from(PNG), Buffer.alloc(MAX_FILE_BYTES - PNG.length)]);
    expect(sniffFile(atLimit)).toEqual({ kind: "picture", format: "png" });
    expect(sniffFile(Buffer.concat([atLimit, Buffer.from([0])]))).toEqual({ refused: ATTACHMENT_WORDS.tooBig });
  });

  it("reads text only if it decodes as text, and cuts it at the limit at a whole character", () => {
    expect(sniffFile(bytes([0xc3, 0x28, 0x41]))).toEqual({ refused: ATTACHMENT_WORDS.notAKind });
    expect(sniffFile(bytes("a", [0, 0, 0], "b"))).toEqual({ refused: ATTACHMENT_WORDS.notAKind });
    expect(sniffFile(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Hej då", "utf16le")]))).toEqual({
      kind: "text",
      text: "Hej då",
      cut: false,
    });
    expect(sniffFile(bytes([0xef, 0xbb, 0xbf], "with a mark"))).toEqual({ kind: "text", text: "with a mark", cut: false });

    const exactly = "x".repeat(MAX_TEXT_CHARACTERS);
    expect(sniffFile(Buffer.from(exactly))).toEqual({ kind: "text", text: exactly, cut: false });
    const over = sniffFile(Buffer.from(`${exactly}y`));
    expect(over).toEqual({ kind: "text", text: exactly, cut: true });
    // An emoji is two code units. Cut through it would leave half a character.
    const emoji = sniffFile(Buffer.from(`${"x".repeat(MAX_TEXT_CHARACTERS - 1)}😀tail`));
    expect(emoji).toEqual({ kind: "text", text: "x".repeat(MAX_TEXT_CHARACTERS - 1), cut: true });
  });

  it("refuses a locked PDF and one longer than a provider reads, and counts nothing it can't see", () => {
    expect(sniffFile(bytes("%PDF-1.4\ntrailer << /Encrypt 5 0 R >>"))).toEqual({ refused: ATTACHMENT_WORDS.lockedPdf });
    const pages = (count: number) => bytes(`%PDF-1.4\n${"<< /Type /Page >>\n".repeat(count)}`);
    expect(sniffFile(pages(MAX_PDF_PAGES))).toEqual({ kind: "pdf", pages: MAX_PDF_PAGES });
    expect(sniffFile(pages(MAX_PDF_PAGES + 1))).toEqual({ refused: ATTACHMENT_WORDS.longPdf });
    expect(sniffFile(bytes("%PDF-1.7\n<< /Type /ObjStm >> stream"))).toEqual({ kind: "pdf", pages: null });
  });
});

describe("cleanFileName", () => {
  it("keeps only the last part of a name, without hidden or breaking characters", () => {
    expect(cleanFileName("C:\\Users\\me\\itinerary.pdf", 120)).toBe("itinerary.pdf");
    expect(cleanFileName("../../etc/passwd", 120)).toBe("passwd");
    expect(cleanFileName("evil\u202Egnp.exe", 120)).toBe("evilgnp.exe");
    expect(cleanFileName("two\nlines.txt", 120)).toBe("two lines.txt");
    expect(cleanFileName(42, 120)).toBe("Untitled");
    expect(cleanFileName("a".repeat(200), 120)).toHaveLength(120);
  });
});
