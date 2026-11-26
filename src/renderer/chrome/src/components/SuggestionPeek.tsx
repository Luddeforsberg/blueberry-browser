import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@common/lib/utils";
import type { SuggestionRow } from "../newTabSuggestions";

// DESIGN.md section 10, New tab: resting on a suggestion shows all of it in a popover under the row, which can only be
// read. It's the exact words that go in the box, or for a finished chat the start of what its mascot wrote, then why.

// Enough of a reply to tell what it is, as plain words: the popover isn't the chat.
const REPLY_START = 320;
const plainStart = (reply: string): string => {
  const words = reply
    .replace(/[#*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return words.length > REPLY_START ? `${words.slice(0, REPLY_START).trimEnd()}…` : words;
};

// What the row would put in the box or a form. A finished chat's words are read from it once the popover opens.
const wordsOf = (row: SuggestionRow): string | null => {
  if (row.kind === "try") return row.prompt;
  if (row.kind === "pick-up") return null;
  const { suggestion } = row;
  return suggestion.kind === "prompt" ? suggestion.prompt : suggestion.draft.instructions;
};

const useReplyStart = (row: SuggestionRow, open: boolean): string | null => {
  const chatId = row.kind === "pick-up" ? row.chat.id : null;
  const [start, setStart] = useState<{ chatId: string; words: string } | null>(null);
  useEffect(() => {
    if (!open || !chatId || start?.chatId === chatId) return;
    let current = true;
    void window.chromeAPI.library.getChat(chatId).then((chat) => {
      const reply = chat?.messages.findLast(({ role }) => role === "assistant")?.content;
      if (current && reply) setStart({ chatId, words: plainStart(reply) });
    });
    return () => {
      current = false;
    };
  }, [open, chatId, start?.chatId]);
  return start?.chatId === chatId ? start.words : null;
};

export const SuggestionPeek: React.FC<{ id: string; row: SuggestionRow; why: string | null; open: boolean }> = ({ id, row, why, open }) => {
  const reply = useReplyStart(row, open);
  const words = wordsOf(row) ?? reply;
  const ref = useRef<HTMLDivElement>(null);
  // Under the row, or over it where the window ends first.
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    const row = ref.current?.parentElement?.getBoundingClientRect();
    if (!open || !box || !row) return;
    setAbove(row.bottom + box.height + 12 > window.innerHeight && row.top - box.height - 12 > 0);
  }, [open, words]);
  if (!open || (!words && !why)) return null;
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 left-[51px] w-[min(440px,calc(100%-51px))] rounded-[22px] bg-sheet shadow-lift px-4 py-3.5",
        above ? "bottom-full mb-1 animate-menu-in-above" : "top-full mt-1 animate-menu-in",
      )}
    >
      {words && <p className="text-15 leading-[22px] text-ink whitespace-pre-line line-clamp-[10]">{words}</p>}
      {why && <p className={cn("text-13 leading-[19px] text-ink-3", words && "mt-2")}>{why}</p>}
    </div>
  );
};
