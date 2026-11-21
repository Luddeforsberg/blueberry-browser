import React, { useEffect, useState } from "react";
import type { ChatStep, MascotProfile, SaidOnTheWay, UsedPage } from "@shared/library";
import { siteOf } from "@shared/sites";
import { NO_KEY } from "@shared/aiKey";
import { ArrowUpRight, Check, Cloud, Copy, Repeat } from "lucide-react";
import { stepsWord } from "../workLine";
import { useShell } from "../contexts/useShell";
import { STOPPED_STEP } from "../stepTrail";
import { Button } from "@common/components/Button";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";
import type { Mood } from "@common/components/moods";
import { Favicon } from "./Favicon";
import { siteIcon } from "./siteIcon";
import { SentAttachments } from "./AttachmentChips";
import type { SentAttachment } from "@shared/attachments";
import { RememberedLine } from "./MemoryInChat";
import type { RoutineFormValues } from "../routinesView";
import { SaveAsRoutineCard } from "./SaveAsRoutine";
import { openSettings } from "../openSettings";
import { Tooltip } from "@common/components/Tooltip";
import { IconSwap } from "@common/components/IconSwap";
import { FOCUS } from "./chipClass";
import { Markdown } from "./Markdown";
import { LiveWords, StepLine, WorkingLine, FoldedLine } from "./ReplySteps";
export { QuestionCard, HandoffCard, ChatApprovalCard } from "./QuestionCards";
export { LiveWords, StepTrail } from "./ReplySteps";
export { Markdown } from "./Markdown";

// Your own words, on `sheet-2` at the right, with a small corner where a tail would be (DESIGN.md section 10, Main chat).
// Yours, at the right, with what went with it over it.
export const UserMessage: React.FC<{ content: string; attached?: readonly SentAttachment[] | undefined }> = ({ content, attached }) => (
  <div className="flex flex-col items-end gap-1.5 animate-fade-in">
    {attached && attached.length > 0 && (
      <div className="max-w-[80%]">
        <SentAttachments attached={attached} />
      </div>
    )}
    <div className="max-w-[76%] px-3.5 py-2.5 rounded-sheet rounded-br-[5px] bg-sheet-2 text-15 text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
      {content}
    </div>
  </div>
);

// What a job said it's doing, in its mascot's own words, while it works. Its answer replaces it.
export const StatusLine: React.FC<{ text: string }> = ({ text }) => (
  <p role="status" className="text-14 text-ink-2 line-clamp-2">
    {text}
  </p>
);

// What a reply is doing between its steps: thinking, or waiting for an answer to a card. Present tense, two dots. With
// no steps yet the mascot's face beside it is the pips, so the words stand alone (`bare`).
const statusRow = (waiting: boolean, bare = false) => {
  const words = waiting ? "Waiting for you.." : "Thinking..";
  // Waiting is in `ask`, like the face's pips beside it.
  if (bare)
    return waiting ? (
      <span className="font-mono text-11.5 text-ask">{words}</span>
    ) : (
      <LiveWords className="font-mono text-11.5">{words}</LiveWords>
    );
  return waiting ? (
    <StepLine pips="waiting" live ask>
      {words}
    </StepLine>
  ) : (
    <StepLine pips="think" live>
      {words}
    </StepLine>
  );
};

// What a job found: each page it used as a chip on `sheet` with `chip`, its icon, title and site. Each opens as the
// user's own tab.
const PageChips: React.FC<{ pages: UsedPage[] }> = ({ pages }) => (
  <ul aria-label="Pages it used" className="flex flex-wrap gap-1.5">
    {pages.map((page) => (
      <li key={page.url} className="min-w-0 max-w-full flex">
        <Tooltip words={page.url}>
          <button
            type="button"
            onClick={() => void window.chromeAPI.browser.createTab(page.url)}
            className={cn(
              "h-[30px] max-w-full pl-[7px] pr-2 inline-flex items-center gap-2 rounded-[10px] bg-sheet dark:bg-sheet-2 text-13 text-ink shadow-chip whitespace-nowrap transition-[background-color,transform] duration-fast hover:[background-image:linear-gradient(var(--hover),var(--hover))] active:scale-[.96]",
              FOCUS,
            )}
          >
            <Favicon src={siteIcon(page.url)} site={page.url} />
            <span className="min-w-0 truncate max-w-56">{page.title || page.url}</span>
            {siteOf(page.url) && <span className="shrink-0 text-ink-2">{siteOf(page.url)}</span>}
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
          </button>
        </Tooltip>
      </li>
    ))}
  </ul>
);

// A reply's action: an icon with its name in a tooltip, and no outline, so the reply stays the thing to read.
const ReplyAction: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <Tooltip words={label}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "size-7 shrink-0 grid place-items-center rounded-row text-ink-3 transition-[background-color,color,transform] duration-fast hover:bg-hover hover:text-ink active:bg-press active:scale-[.96]",
        FOCUS,
      )}
    >
      {children}
    </button>
  </Tooltip>
);

const CopyAction: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <ReplyAction label={copied ? "Copied" : "Copy"} onClick={() => void navigator.clipboard.writeText(content).then(() => setCopied(true))}>
      <IconSwap
        shown={copied ? "copied" : "copy"}
        icons={{ copy: <Copy className="size-[15px]" strokeWidth={1.75} />, copied: <Check className="size-[15px]" strokeWidth={1.75} /> }}
      />
    </ReplyAction>
  );
};

// What the last reply in a chat can do next, which an earlier one doesn't offer again.
export interface ReplyActions {
  // Carries on after Stop, or tries again after it went wrong, by saying so as the user.
  onSay: (words: string) => void;
  // Only after a job that did some work: a reply that's just an answer has nothing to repeat. What to do and who does
  // it, from the chat, for the card under the reply that asks only when.
  routineFromChat?: (() => RoutineFormValues) | undefined;
}

// Where a chat runs, said only when it isn't here, or who started it when it wasn't the user. Quiet, over its first reply.
export interface ReplyOrigin {
  words: string;
  cloud: boolean;
}

const OriginLine: React.FC<{ origin: ReplyOrigin }> = ({ origin }) => (
  <p className="-mb-3 h-[22px] flex items-center gap-1.5 font-mono text-11.5 text-ink-3">
    {origin.cloud && <Cloud aria-hidden className="size-[13px] shrink-0" strokeWidth={1.75} />}
    <span className="min-w-0 truncate">{origin.words}</span>
  </p>
);

// A reply's face, beside its first line (DESIGN.md section 10). In the main chat it hangs in the gutter so the words keep
// their column, and in the panel it's smaller and in line. Beside a Working block it lines up with the heading. With
// Berry hidden there's no face, and the words take its place.
const WithFace: React.FC<{
  mascot?: MascotProfile | undefined;
  mood: Mood;
  still?: boolean;
  gutter: boolean;
  besideHeading?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ mascot, mood, still, gutter, besideHeading = false, className, children }) => {
  const { showBerry } = useShell().settings;
  const place = gutter ? cn("absolute -left-9", besideHeading ? "top-[9px]" : "top-0") : besideHeading ? "mt-[11px]" : "mt-0.5";
  return (
    <div className={cn("group/reply flex animate-fade-in", gutter ? "relative" : "gap-2")}>
      {showBerry && <Berry mood={mood} size={gutter ? 24 : 20} mascot={mascot} still={still} className={cn("shrink-0", place)} />}
      <div className={cn("min-w-0 flex-1", className)}>{children}</div>
    </div>
  );
};

// A line of its own and what to do about it, in a reply: for stopped and went wrong. The reply's face says which.
const TroubleLine: React.FC<{ words: string; alert?: boolean; children?: React.ReactNode }> = ({ words, alert, children }) => (
  <div>
    <p role={alert ? "alert" : undefined} className="text-15 text-ink [overflow-wrap:anywhere]">
      {words}
    </p>
    {children && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{children}</div>}
  </div>
);

// What went wrong, in plain words, with Try again. The folded line above it opens the steps it got through. With no
// key, trying again can't work, so it's Add a key, which opens Settings where the key is kept.
const WhatWentWrong: React.FC<{ message: string; actions?: ReplyActions | undefined }> = ({ message, actions }) => (
  <TroubleLine words={message} alert>
    {message === NO_KEY ? (
      <Button onClick={() => openSettings("ai-service")}>Add a key</Button>
    ) : (
      actions && <Button onClick={() => actions.onSay("Try again")}>Try again</Button>
    )}
  </TroubleLine>
);

// A mascot's reply: plain text on the sheet, with its face beside it. While it works, one line leads it with its steps
// under; once it's done, that line folds where it is, above the answer, and what it found comes after the answer, then
// Copy and Save as routine on the last reply.
export const AssistantMessage: React.FC<{
  content: string;
  steps?: ChatStep[] | undefined;
  // What it wrote between its steps, where it wrote it.
  said?: SaidOnTheWay[] | undefined;
  isStreaming?: boolean | undefined;
  // A card is waiting for the user's answer.
  waiting?: boolean;
  mascot?: MascotProfile;
  // This reply went wrong on the way, and this is what happened.
  error?: string | undefined;
  // What its mascot went into this reply remembering.
  memoryIds?: string[] | undefined;
  // The pages its job opened, which closed when it ended.
  pages?: UsedPage[] | undefined;
  // When the running reply started, and how long a finished one took, where that's known.
  startedAt?: number | undefined;
  took?: number | undefined;
  // Set on the last reply only.
  actions?: ReplyActions | undefined;
  // Set on the first reply only, where there's something to say.
  origin?: ReplyOrigin | undefined;
  // While the working view is hidden.
  onShowWork?: (() => void) | undefined;
  // In the main chat, where the face hangs in the gutter.
  gutter?: boolean;
}> = ({
  content,
  steps = [],
  said = [],
  isStreaming = false,
  waiting = false,
  mascot,
  error,
  memoryIds,
  pages = [],
  startedAt,
  took,
  actions,
  origin,
  onShowWork,
  gutter = false,
}) => {
  const [routine, setRoutine] = useState<RoutineFormValues | null>(null);
  const { showBerry } = useShell().settings;
  const failed = error !== undefined;
  const working = isStreaming && (steps.length > 0 || said.length > 0);
  // While it runs: between steps, with no words yet, it says what it's doing. A step waiting on the user is already
  // the live one. With no working line the face is the pips, so the words stand alone.
  const status = isStreaming && !content && !steps.some((step) => !step.done) ? statusRow(waiting, !working && showBerry) : null;
  // Once it's done: a stopped reply says so in place of its last step.
  const stopped = !isStreaming && steps.at(-1)?.text === STOPPED_STEP;
  const done = stopped ? steps.slice(0, -1) : steps;
  // While it runs the face is the pips, which hold still beside the working line, whose live step is what moves.
  const mood: Mood = failed ? "oops" : !isStreaming ? "rest" : waiting ? "asking" : "thinking";

  // One tree whether it's running or done, with the words in the same place, so they aren't drawn again when it ends.
  return (
    <WithFace mascot={mascot} mood={mood} still={working} gutter={gutter} className="flex flex-col gap-4">
      {origin && <OriginLine origin={origin} />}
      {mascot && <RememberedLine ids={memoryIds} />}
      {isStreaming ? (
        working ? (
          <WorkingLine steps={steps} said={said} status={status} startedAt={startedAt} onShowWork={onShowWork} />
        ) : (
          status && (
            <div role="status" className="h-6 flex items-center">
              {status}
            </div>
          )
        )
      ) : (
        done.length > 0 && <FoldedLine steps={done} said={said} took={took} />
      )}
      {content && <Markdown content={content} />}
      {!isStreaming && pages.length > 0 && <PageChips pages={pages} />}
      {stopped && (
        <TroubleLine words={done.length ? `You stopped this after ${stepsWord(done.length)}.` : "You stopped this."}>
          {actions && (
            <Button variant="raised" onClick={() => actions.onSay("Carry on")}>
              Carry on
            </Button>
          )}
        </TroubleLine>
      )}
      {failed && <WhatWentWrong message={error} actions={actions} />}
      {/* Only while the pointer or the keyboard is in this reply. The row keeps its height, so nothing moves. */}
      {actions && !isStreaming && !stopped && !failed && content && (
        <div className="-mt-3.5 -ml-1.5 h-7 flex gap-0.5 opacity-0 transition-opacity duration-fast group-hover/reply:opacity-100 group-focus-within/reply:opacity-100">
          <CopyAction content={content} />
          {actions.routineFromChat && (
            <ReplyAction label="Save as routine" onClick={() => setRoutine(routine ?? actions.routineFromChat?.() ?? null)}>
              <Repeat aria-hidden className="size-[15px]" strokeWidth={1.75} />
            </ReplyAction>
          )}
        </div>
      )}
      {routine && actions?.routineFromChat && <SaveAsRoutineCard from={routine} onClose={() => setRoutine(null)} />}
    </WithFace>
  );
};

// A chat that went wrong before there was a reply to say so in: the face in Oops, and what happened.
export const WentWrong: React.FC<{ message: string; mascot?: MascotProfile; actions?: ReplyActions; gutter?: boolean }> = ({
  message,
  mascot,
  actions,
  gutter = false,
}) => (
  <WithFace mascot={mascot} mood="oops" gutter={gutter}>
    <WhatWentWrong message={message} actions={actions} />
  </WithFace>
);

// Why something failed, worded with what to do about it.
export const ChatError: React.FC<{ message: string }> = ({ message }) => (
  <p role="alert" className="text-14 text-ask animate-fade-in">
    {message}
  </p>
);
