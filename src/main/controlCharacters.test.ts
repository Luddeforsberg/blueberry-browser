import { describe, expect, it } from "vitest";
import { replaceControlCharacters } from "./controlCharacters";

const char = (code: number) => String.fromCharCode(code);

describe("replaceControlCharacters", () => {
  it("replaces U+0000 to U+001F and U+007F, each with the replacement", () => {
    for (const code of [0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f]) {
      expect(replaceControlCharacters(`a${char(code)}b`, "_")).toBe("a_b");
    }
    expect(replaceControlCharacters(`${char(0)}${char(0x1f)}${char(0x7f)}`, " ")).toBe("   ");
  });

  it("leaves the characters on either side of those ranges", () => {
    for (const code of [0x20, 0x7e, 0x80, 0x85, 0x9f, 0xa0]) {
      expect(replaceControlCharacters(`a${char(code)}b`, "_")).toBe(`a${char(code)}b`);
    }
  });

  it("keeps characters outside the basic plane whole, and a lone surrogate as it is", () => {
    expect(replaceControlCharacters("🫐\u0000🫐", "_")).toBe("🫐_🫐");
    expect(replaceControlCharacters("a\ud83eb", "_")).toBe("a\ud83eb");
  });

  it("gives back an empty string, and one with nothing to replace, unchanged", () => {
    expect(replaceControlCharacters("", "_")).toBe("");
    expect(replaceControlCharacters("plain words", "_")).toBe("plain words");
  });
});
