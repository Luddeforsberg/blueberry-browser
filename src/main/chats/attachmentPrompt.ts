import type { ReplyBlock, ReplyContent } from "./agent";
import type { StoredFile } from "./ChatStore";
import { ATTACHMENT_WORDS } from "../../shared/attachments";

// How what the user gave a message goes to the model: each page and file in a tag saying what it is, before their words.
// The system prompt says anything in those tags is untrusted. Plain, so it's tested without a model.

const MAX_PAGE_TEXT_LENGTH = 4000;

export interface PageSnapshot {
  url: string;
  text: string | null;
  screenshot: string | null;
  // Said after the page, as ours rather than the page's.
  note?: string | undefined;
}

const attribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ");
// A file can hold its own closing tag, to make what follows look like the user's words.
const inside = (text: string, tag: string) => text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");

export const pageBlocks = (page: PageSnapshot): ReplyBlock[] => {
  const text = page.text ? `\n${inside(page.text.slice(0, MAX_PAGE_TEXT_LENGTH), "page")}\n` : "";
  return [
    ...(page.screenshot ? [{ type: "image_url" as const, image_url: { url: page.screenshot } }] : []),
    { type: "text", text: `<page url="${page.url}">${text}</page>${page.note ? `\n${page.note}` : ""}` },
  ];
};

export const fileBlocks = (file: StoredFile): ReplyBlock[] => {
  const cut = file.kind === "text" && file.fact === ATTACHMENT_WORDS.cutShort ? ` note="${ATTACHMENT_WORDS.cutShortInFull}"` : "";
  const pages = file.kind === "pdf" && file.fact ? ` pages="${attribute(file.fact)}"` : "";
  const open = `<file name="${attribute(file.name)}" kind="${file.kind}"${pages}${cut}>`;
  if (file.kind === "text") return [{ type: "text", text: `${open}\n${inside(file.text ?? "", "file")}\n</file>` }];
  if (!file.data) return [];
  const data = file.data.toString("base64");
  const body: ReplyBlock =
    file.kind === "picture"
      ? { type: "image_url", image_url: { url: `data:${file.mime};base64,${data}` } }
      : { type: "pdf", name: file.name, data };
  return [{ type: "text", text: open }, body, { type: "text", text: "</file>" }];
};

// A user's message with what went with it in front. With nothing, it's the message as it was.
export const withAttached = (content: ReplyContent, before: readonly ReplyBlock[]): ReplyContent => {
  if (before.length === 0) return content;
  return [...before, ...(typeof content === "string" ? [{ type: "text" as const, text: content }] : content)];
};
