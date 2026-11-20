// What can go with a message from the prompt box's +: an open tab, or a file. Every limit is here, and main applies all
// of them itself. A renderer only draws what main tells it, and anything it asks beyond these is refused.

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TABS = 5;
// A text file goes in as text, so it's cut to this many characters, about ten pages, and its chip says so.
export const MAX_TEXT_CHARACTERS = 40_000;
// Pictures are scaled down to this longest side before they're kept or sent, to bound what each one costs.
export const MAX_PICTURE_SIDE = 1568;
// What a picture may weigh once scaled, under the smallest provider limit on one picture.
export const MAX_PICTURE_BYTES = 3_500_000;
// The provider with the lowest limit reads at most this many pages of PDF in one request.
export const MAX_PDF_PAGES = 100;
// The chip's thumbnail is 18px, drawn at twice that for sharp screens.
export const THUMBNAIL_SIDE = 36;
export const MAX_FILE_NAME_LENGTH = 120;
// A file chosen but never sent is let go after this long.
export const STAGED_FILE_MS = 60 * 60 * 1000;

export type FileKind = "picture" | "pdf" | "text";

// A file in the box, as the renderer draws it. Its contents never leave main: only this does, and the thumbnail main
// made. With `problem` it was refused, has no use as an id, and never goes.
export interface FileChip {
  id: string;
  kind: FileKind | null;
  name: string;
  // A short fact worth saying, such as "3 pages" or "cut short".
  fact: string | null;
  // Said in full to assistive technology and as a tooltip, where `fact` is a shortening.
  factInFull: string | null;
  thumbnail: string | null;
  problem: string | null;
}

// One of the user's tabs, as the + menu lists it. With `problem` it can't be added, and says why.
export interface TabChoice {
  id: string;
  title: string;
  site: string;
  favicon: string | null;
  problem: string | null;
}

// What went with a message, saved with it and shown over it. Names only: a tab's address can carry a token, and a
// file's contents stay in main.
export type SentAttachment =
  | { kind: "tab"; title: string; site: string }
  | { kind: FileKind; name: string; fact: string | null; thumbnail: string | null };

// Said on a chip or a menu row, in the user's words. Main is the only one that decides which applies.
export const ATTACHMENT_WORDS = {
  tooMany: `${MAX_FILES} files at most`,
  tooBig: `Bigger than ${MAX_FILE_BYTES / 1024 / 1024} MB`,
  empty: "This file is empty",
  unreadable: "Couldn’t be read",
  notAKind: "Only pictures, PDFs and text files can be read",
  picture: "Only PNG and JPEG pictures can be read",
  svg: "SVG pictures can’t be read",
  video: "Videos can’t be read",
  sound: "Sound can’t be read",
  lockedPdf: "This PDF is locked",
  longPdf: `PDFs over ${MAX_PDF_PAGES} pages can’t be read`,
  brokenPicture: "This picture couldn’t be opened",
  tabToCloud: "A tab here can’t go along to the cloud",
  fileToCloud: "A file can’t go along to the cloud",
  cutShort: "cut short",
  cutShortInFull: `Only the first ${MAX_TEXT_CHARACTERS.toLocaleString("en-GB")} characters go with it`,
} as const;
