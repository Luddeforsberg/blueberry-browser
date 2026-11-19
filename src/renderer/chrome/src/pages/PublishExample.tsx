import React from "react";
import { Check } from "lucide-react";
import type { ChatThreadSummary, MascotProfile } from "@shared/library";
import { MAX_EXAMPLE_ANSWER, MAX_EXAMPLE_PROMPT } from "@shared/publishing";
import { cn } from "@common/lib/utils";
import type { PublishValues } from "../mascotsView";
import { INPUT, ROW } from "./PublishField";

// Part of publishing a mascot (PublishMascot.tsx): the example, picked from its chats.

// A radio or a checkbox in our own colours. The real one lies over its whole line, unseen, so the pointer, the keyboard
// and labels work as ever.
const REAL_INPUT = "peer absolute inset-0 m-0 size-full opacity-0";
const Mark: React.FC<{ round?: boolean }> = ({ round = false }) => (
  <span
    aria-hidden
    className={cn(
      "size-4 shrink-0 flex items-center justify-center border bg-sheet transition-colors text-ground",
      round ? "rounded-full" : "rounded-[4px]",
      "peer-checked:bg-ink peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sheet [&>*]:opacity-0 peer-checked:[&>*]:opacity-100",
    )}
  >
    {round ? <span className="size-1.5 rounded-full bg-ground" /> : <Check className="size-3" strokeWidth={3} />}
  </span>
);

const ExampleChoice: React.FC<{ checked: boolean; onPick?: () => void; children: React.ReactNode }> = ({ checked, onPick, children }) => (
  <li>
    <label className="relative flex items-center gap-2 py-2 text-14">
      <input type="radio" name="publish-example" className={REAL_INPUT} checked={checked} readOnly={!onPick} onChange={onPick} />
      <Mark round />
      {children}
    </label>
  </li>
);

// An example from one of its chats, which goes only once it's been read and ticked.
export const ExampleField: React.FC<{
  values: PublishValues;
  set: (patch: Partial<PublishValues>) => void;
  own: ChatThreadSummary[];
  mascot: MascotProfile;
  hasExample: boolean;
  pickChat: (chatId: string | null) => Promise<void>;
}> = ({ values, set, own, mascot, hasExample, pickChat }) => (
  <div className={ROW}>
    <h2 className="text-14 font-medium">An example</h2>
    <p className="mt-0.5 text-14 text-ink-2">
      Optional, and it shows people what it really does. Only these two pieces of text go, as you leave them. The rest of the chat, its
      pages, screenshots and steps stay here.
    </p>
    <ul aria-label="Choose an example" className="mt-2 divide-y">
      <ExampleChoice checked={!hasExample} onPick={() => void pickChat(null)}>
        No example
      </ExampleChoice>
      {values.exampleChatId === "published" && <ExampleChoice checked>The one already published</ExampleChoice>}
      {own.map((chat) => (
        <ExampleChoice key={chat.id} checked={values.exampleChatId === chat.id} onPick={() => void pickChat(chat.id)}>
          <span className="truncate">{chat.title}</span>
        </ExampleChoice>
      ))}
    </ul>
    {own.length === 0 && (
      <p className="text-14 text-ink-2">
        {mascot.name} has no chats yet, so there’s nothing to pick. Chat with it first if you’d like an example.
      </p>
    )}
    {hasExample && (
      <div className="mt-3 flex flex-col gap-3">
        <label className="text-14">
          What you asked
          <textarea
            rows={3}
            maxLength={MAX_EXAMPLE_PROMPT}
            value={values.prompt}
            onChange={(event) => set({ prompt: event.target.value, checked: false })}
            className={cn(INPUT, "mt-1 py-2 resize-y")}
          />
        </label>
        <label className="text-14">
          What it gave you
          <textarea
            rows={8}
            value={values.answer}
            onChange={(event) => set({ answer: event.target.value, checked: false })}
            className={cn(INPUT, "mt-1 py-2 resize-y")}
          />
          <span className={cn("block mt-1 text-13 tabular-nums", values.answer.length > MAX_EXAMPLE_ANSWER ? "text-ask" : "text-ink-2")}>
            {values.answer.length} of {MAX_EXAMPLE_ANSWER} characters
          </span>
        </label>
        <label className="relative flex items-start gap-2 text-14">
          <input
            type="checkbox"
            className={REAL_INPUT}
            checked={values.checked}
            onChange={(event) => set({ checked: event.target.checked })}
          />
          <Mark />
          I’ve read both, and there’s nothing in them I wouldn’t show a stranger.
        </label>
      </div>
    )}
  </div>
);
