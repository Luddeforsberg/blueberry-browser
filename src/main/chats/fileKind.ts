import { ATTACHMENT_WORDS, MAX_FILE_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARACTERS } from "../../shared/attachments";

// What a file is, told from its contents alone. Its name and whatever type a renderer claims for it are never asked,
// so an executable named `.png` is an executable. Plain, so it's tested without Electron.

export type Sniffed =
  | { kind: "picture"; format: "png" | "jpeg" }
  | { kind: "pdf"; pages: number | null }
  | { kind: "text"; text: string; cut: boolean }
  | { refused: string };

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
  bytes.length >= at + signature.length && signature.every((byte, index) => bytes[at + index] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const latin1 = (bytes: Uint8Array, from = 0, to = bytes.length) =>
  Buffer.from(bytes.buffer, bytes.byteOffset + from, Math.max(0, Math.min(to, bytes.length) - from)).toString("latin1");

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = ascii("%PDF-");

// Pictures a provider could take but main can't scale down, so they'd go at any size.
const OTHER_PICTURES: ReadonlyArray<readonly number[]> = [
  ascii("GIF87a"),
  ascii("GIF89a"),
  [0x42, 0x4d],
  [0x49, 0x49, 0x2a, 0x00],
  [0x4d, 0x4d, 0x00, 0x2a],
  [0x00, 0x00, 0x01, 0x00],
];
const PICTURE_BRANDS = ["heic", "heix", "hevc", "mif1", "msf1", "avif"];
const SOUNDS: ReadonlyArray<readonly number[]> = [ascii("ID3"), ascii("OggS"), ascii("fLaC"), [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]];
const VIDEOS: ReadonlyArray<readonly number[]> = [[0x1a, 0x45, 0xdf, 0xa3]];

const pictureOrVideo = (bytes: Uint8Array): string | null => {
  if (OTHER_PICTURES.some((signature) => startsWith(bytes, signature))) return ATTACHMENT_WORDS.picture;
  if (startsWith(bytes, ascii("RIFF")) && bytes.length >= 12) {
    const form = latin1(bytes, 8, 12);
    if (form === "WEBP") return ATTACHMENT_WORDS.picture;
    if (form === "WAVE") return ATTACHMENT_WORDS.sound;
    if (form === "AVI ") return ATTACHMENT_WORDS.video;
  }
  // ISO media: a picture in HEIC or AVIF, a video in anything else, and M4A for sound.
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = latin1(bytes, 8, 12);
    if (PICTURE_BRANDS.includes(brand)) return ATTACHMENT_WORDS.picture;
    return brand.startsWith("M4A") ? ATTACHMENT_WORDS.sound : ATTACHMENT_WORDS.video;
  }
  if (VIDEOS.some((signature) => startsWith(bytes, signature))) return ATTACHMENT_WORDS.video;
  if (SOUNDS.some((signature) => startsWith(bytes, signature))) return ATTACHMENT_WORDS.sound;
  return null;
};

// Pages by their page objects, which a PDF that packs its objects into compressed streams doesn't show. Null then, and
// the chip says nothing rather than a wrong count.
const pdfPages = (text: string): number | null => {
  const pages = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
  return pages > 0 ? pages : null;
};

const UTF16 = { le: [0xff, 0xfe], be: [0xfe, 0xff] };

const decode = (bytes: Uint8Array): string | null => {
  try {
    if (startsWith(bytes, UTF16.le)) return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
    if (startsWith(bytes, UTF16.be)) return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
    // The decoder takes a leading byte order mark off by itself.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

// Control characters other than tabs, line and page breaks and escape are what binary data is made of. A few can be in
// a log.
const isBinaryControl = (code: number) => (code < 0x20 && ![0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1b].includes(code)) || code === 0x7f;
const MAX_CONTROL_SHARE = 0.001;
const looksLikeText = (text: string): boolean => {
  let controls = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code === 0) return false;
    if (isBinaryControl(code)) controls++;
  }
  return controls <= text.length * MAX_CONTROL_SHARE;
};

const SVG = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype\s+svg[^>]*>\s*)?<svg[\s>]/i;

// Cut at a whole character, never through a pair that makes one.
const cutText = (text: string): { text: string; cut: boolean } => {
  if (text.length <= MAX_TEXT_CHARACTERS) return { text, cut: false };
  const end = /[\uDC00-\uDFFF]/.test(text.charAt(MAX_TEXT_CHARACTERS)) ? MAX_TEXT_CHARACTERS - 1 : MAX_TEXT_CHARACTERS;
  return { text: text.slice(0, end), cut: true };
};

export const sniffFile = (bytes: Uint8Array): Sniffed => {
  if (bytes.length === 0) return { refused: ATTACHMENT_WORDS.empty };
  if (bytes.length > MAX_FILE_BYTES) return { refused: ATTACHMENT_WORDS.tooBig };
  if (startsWith(bytes, PNG)) return { kind: "picture", format: "png" };
  if (startsWith(bytes, JPEG)) return { kind: "picture", format: "jpeg" };
  if (startsWith(bytes, PDF)) {
    const text = latin1(bytes);
    // A PDF with a password can't be read by anything it would go to.
    if (/\/Encrypt\s/.test(text)) return { refused: ATTACHMENT_WORDS.lockedPdf };
    const pages = pdfPages(text);
    if (pages !== null && pages > MAX_PDF_PAGES) return { refused: ATTACHMENT_WORDS.longPdf };
    return { kind: "pdf", pages };
  }
  const media = pictureOrVideo(bytes);
  if (media) return { refused: media };
  const text = decode(bytes);
  if (text === null || !looksLikeText(text)) return { refused: ATTACHMENT_WORDS.notAKind };
  // Markup that draws a picture is still a picture to whoever attached it, and its text would read as nonsense.
  if (SVG.test(text.slice(0, 4096))) return { refused: ATTACHMENT_WORDS.svg };
  return { kind: "text", ...cutText(text) };
};

// Control characters, and the ones that hide or reorder text, so a name reads as what it is.
const hidden = (code: number) =>
  code < 0x20 ||
  code === 0x7f ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0xfeff;

// What's left of a name once anything that could pass for a path, a line break or hidden text is taken out.
export const cleanFileName = (name: unknown, maxLength: number): string => {
  const raw = typeof name === "string" ? name : "";
  const base = raw.split(/[\\/]/).at(-1) ?? "";
  const clean = [...base.replace(/\s+/g, " ")]
    .filter((char) => !hidden(char.codePointAt(0) ?? 0))
    .join("")
    .trim();
  return [...clean].slice(0, maxLength).join("") || "Untitled";
};
