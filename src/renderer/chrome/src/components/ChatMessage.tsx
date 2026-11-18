import React, { useEffect, useId, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { ChatApproval, ChatStep, MascotProfile, SaidOnTheWay, UsedPage } from "@shared/library";
import { linkSite } from "@shared/publishing";
import { NO_KEY } from "@shared/aiKey";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Cloud, Copy, Lock, Repeat } from "lucide-react";
import { ApprovalCard, CardInShell, Keycap, WhyLine } from "@common/components/ApprovalCard";
import { useCardKeys } from "@common/components/cardKeys";
import { clock, foldedWords, keptWhenFolded, latestEntries, stepsWord, workEntries, type WorkEntry } from "../workLine";
import { useShell } from "../contexts/useShell";
import { STOPPED_STEP, trailFor } from "../stepTrail";
import { Button } from "@common/components/Button";
import { Pips } from "@common/components/Pips";
import { STEP_PIPS, type PipMark, type PipPattern } from "@common/components/pipPatterns";
import { useStill } from "@common/components/motion";
import { cn } from "@common/lib/utils";
import { useBrowser } from "../contexts/useBrowser";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
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
import { approvalWords, HANDOFF_TITLE } from "./approvalWords";

// `fromStranger` is for what someone else wrote: nothing in it can load anything or take you anywhere. An image is
// only its description, a link is its words and its site as text, and raw HTML shows as text, which ReactMarkdown does
// by itself as long as no plugin here parses it.
const STRANGER_COMPONENTS: Components = {
  img: ({ alt }) => <span>{alt}</span>,
  a: ({ children, href }) => {
    const site = href ? linkSite(href) : null;
    const words = String(children);
    if (!site || words === site) return <span>{children}</span>;
    return (
      <span>
        {words === href ? (
          site
        ) : (
          <>
            {children} ({site})
          </>
        )}
      </span>
    );
  },
};

export const Markdown: React.FC<{ content: string; fromStranger?: boolean; className?: string }> = ({
  content,
  fromStranger,
  className,
}) => (
  <div className={cn("prose max-w-none prose-pre:p-3 prose-pre:overflow-x-auto", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code: ({ node, className, children, ...props }) => {
          const inline = !className;
          return inline ? (
            <code className="bg-sheet-2 px-1 py-0.5 rounded-row" {...props}>
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        a: ({ children, href }) => (
          <a href={href} className="text-ink hover:underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        ...(fromStranger ? STRANGER_COMPONENTS : {}),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

// Your own words, on `sheet-2` at the right, with a small corner where a tail would be (DESIGN.md section 10, Main chat).
// Yours, at the right, with what went with it over it.
export const UserMessage: React.FC<{ content: string; attached?: readonly SentAttachment[] }> = ({ content, attached }) => (
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

// Words for work happening right now: a band of `ink` passes through them. With the pips beside them they're one thing
// moving (DESIGN.md section 7), and they hold still as the pips do, in plain `ink`.
export const LiveWords: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => {
  const still = useStill();
  return (
    <span className={cn(still ? "text-ink" : "bg-shimmer bg-[length:260%_100%] bg-clip-text text-transparent animate-shimmer", className)}>
      {children}
    </span>
  );
};

// What a job said it's doing, in its mascot's own words, while it works. Its answer replaces it.
export const StatusLine: React.FC<{ text: string }> = ({ text }) => (
  <p role="status" className="text-14 text-ink-2 line-clamp-2">
    {text}
  </p>
);

// One line of what a mascot did or is doing, in its words, after a pip mark. The live one has moving pips and its
// words shimmer, and finished ones are `ink-3`.
const StepLine: React.FC<{ pips: PipPattern | PipMark; live?: boolean; ask?: boolean; children: React.ReactNode }> = ({
  pips,
  live = false,
  ask = false,
  children,
}) => (
  <span className={cn("flex items-start gap-3 font-mono text-11.5", live ? "text-ink" : "text-ink-3")}>
    <span className={cn("h-4 shrink-0 flex items-center", ask && "text-ask")}>
      <Pips pattern={pips} />
    </span>
    {live ? (
      <LiveWords className="min-w-0 [overflow-wrap:anywhere]">{children}</LiveWords>
    ) : (
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    )}
  </span>
);

const StepItem: React.FC<{ step: ChatStep }> = ({ step }) => {
  const { live, done } = STEP_PIPS[step.kind ?? "plain"];
  return (
    <li>
      <StepLine pips={step.done ? done : live} live={!step.done} ask={!step.done && step.kind === "ask"}>
        {step.shown ?? step.text}
        {!step.done && <span className="sr-only"> (in progress)</span>}
      </StepLine>
    </li>
  );
};

const StepList: React.FC<{ steps: ChatStep[] }> = ({ steps }) => (
  <ol aria-label="Steps" className="flex flex-col gap-[9px]">
    {steps.map((step, index) => (
      <StepItem key={index} step={step} />
    ))}
  </ol>
);

// The quiet line that stands for steps not showing, and opens them.
const FoldLine: React.FC<{ open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ open, onToggle, children }) => (
  <button
    type="button"
    aria-expanded={open}
    onClick={onToggle}
    className={cn(
      "-mx-1.5 px-1.5 h-6 w-fit flex items-center gap-1.5 rounded-row font-mono text-11.5 text-ink-2 transition-colors hover:text-ink",
      FOCUS,
    )}
  >
    <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-fast", !open && "-rotate-90")} strokeWidth={1.75} />
    {children}
  </button>
);

// What a mascot did on the way to a reply, outside a chat: a routine's run keeps this.
export const StepTrail: React.FC<{ steps: ChatStep[]; running?: boolean; cutShort?: boolean }> = ({
  steps,
  running = false,
  cutShort = false,
}) => {
  const [open, setOpen] = useState(false);
  const { shown, line } = trailFor(steps, { running, cutShort, open });
  return (
    <div className="flex flex-col items-start gap-2">
      {line && (
        <FoldLine open={open} onToggle={() => setOpen(!open)}>
          {line}
        </FoldLine>
      )}
      {shown.length > 0 && <StepList steps={shown.map(({ step }) => step)} />}
    </div>
  );
};

// Ticks while a reply works, in mono like the line it's on.
const Elapsed: React.FC<{ since: number }> = ({ since }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="text-ink-3 tabular-nums">{clock(now - since)}</span>;
};

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

// Steps of one kind in a row on one site, as one line that opens to show them.
const GroupItem: React.FC<{ entry: Extract<WorkEntry, { kind: "group" }> }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn("-mx-1 px-1 max-w-full flex items-center gap-1 rounded-row text-left transition-colors hover:bg-hover", FOCUS)}
      >
        <StepLine pips={STEP_PIPS[entry.stepKind].done}>{entry.words}</StepLine>
        <ChevronRight
          aria-hidden
          className={cn("size-3 shrink-0 text-faint transition-transform duration-fast", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <ol aria-label={entry.words} className="mt-2 pl-[22px] flex flex-col gap-2">
          {entry.steps.map((step, index) => (
            <StepItem key={index} step={step} />
          ))}
        </ol>
      )}
    </li>
  );
};

// The steps and what the mascot said between them, where it said it, in its own voice at 15px.
const Entries: React.FC<{ entries: WorkEntry[]; status?: React.ReactNode }> = ({ entries, status }) => (
  <ol aria-label="Steps" className="flex flex-col gap-2">
    {entries.map((entry, index) =>
      entry.kind === "said" ? (
        <li key={index} className="py-0.5 text-15 leading-[1.55] text-ink-2 [overflow-wrap:anywhere]">
          {entry.text}
        </li>
      ) : entry.kind === "group" ? (
        <GroupItem key={index} entry={entry} />
      ) : (
        <StepItem key={index} step={entry.step} />
      ),
    )}
    {status && <li>{status}</li>}
  </ol>
);

// The line that leads a reply for its job's whole life (DESIGN.md section 10, Main chat). While it works: the moving
// pips, Working and how long, then its latest steps, and the line opens the rest.
const WorkingLine: React.FC<{
  steps: ChatStep[];
  said: SaidOnTheWay[];
  status: React.ReactNode;
  startedAt?: number;
  onShowWork?: () => void;
}> = ({ steps, said, status, startedAt, onShowWork }) => {
  const [open, setOpen] = useState(false);
  const entries = workEntries(steps, said);
  const { shown, hidden } = latestEntries(entries);
  const head = (
    <>
      <span className="h-4 shrink-0 flex items-center">
        <Pips pattern="think" />
      </span>
      <span className="flex items-center gap-2">
        Working
        {startedAt !== undefined && <Elapsed since={startedAt} />}
      </span>
    </>
  );
  return (
    <section aria-label="Working" className="flex flex-col gap-2">
      <div className="h-6 flex items-center gap-2">
        {hidden ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Working, showing every step" : "Working, show the earlier steps"}
            onClick={() => setOpen(!open)}
            className={cn(
              "-mx-1 px-1 h-6 min-w-0 flex items-center gap-3 rounded-row font-mono text-11.5 text-ink transition-colors hover:bg-hover",
              FOCUS,
            )}
          >
            {head}
            <ChevronRight
              aria-hidden
              className={cn("size-3 text-faint transition-transform duration-fast", open && "rotate-90")}
              strokeWidth={1.75}
            />
          </button>
        ) : (
          <p className="h-6 min-w-0 flex items-center gap-3 font-mono text-11.5 text-ink">{head}</p>
        )}
        {/* Brings back the working view after Hide work. */}
        {onShowWork && (
          <button
            type="button"
            onClick={onShowWork}
            className={cn(
              "ml-auto -mr-1.5 h-6 px-1.5 shrink-0 rounded-row text-13 text-ink-3 transition-colors hover:bg-hover hover:text-ink",
              FOCUS,
            )}
          >
            Show work
          </button>
        )}
      </div>
      <div role="status">
        <Entries entries={open ? entries : shown} status={status} />
      </div>
    </section>
  );
};

// When it ends, the line folds where it is: "Worked 0:48", then "7 steps on klm.com" and a faint arrow, in `ink-3`.
// Pressing it opens the steps in place, above the answer. Folded, the steps worth seeing on any trail still show.
const FoldedLine: React.FC<{ steps: ChatStep[]; said: SaidOnTheWay[]; took?: number }> = ({ steps, said, took }) => {
  const [open, setOpen] = useState(false);
  const words = foldedWords(steps, took);
  const kept = keptWhenFolded(steps);
  return (
    <section aria-label="How it got there" className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-1 px-1 h-6 w-fit max-w-full flex items-center gap-2 rounded-row font-mono text-11.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink-2",
          FOCUS,
        )}
      >
        {words.worked && <span className="shrink-0 tabular-nums">{words.worked}</span>}
        <span className="min-w-0 truncate">{words.steps}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3 shrink-0 text-faint transition-transform duration-fast", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open ? <Entries entries={workEntries(steps, said)} /> : kept.length > 0 && <StepList steps={kept} />}
    </section>
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
            {linkSite(page.url) && <span className="shrink-0 text-ink-2">{linkSite(page.url)}</span>}
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
  routineFromChat?: () => RoutineFormValues;
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
  mascot?: MascotProfile;
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
const WhatWentWrong: React.FC<{ message: string; actions?: ReplyActions }> = ({ message, actions }) => (
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
  steps?: ChatStep[];
  // What it wrote between its steps, where it wrote it.
  said?: SaidOnTheWay[];
  isStreaming?: boolean;
  // A card is waiting for the user's answer.
  waiting?: boolean;
  mascot?: MascotProfile;
  // This reply went wrong on the way, and this is what happened.
  error?: string;
  // What its mascot went into this reply remembering.
  memoryIds?: string[];
  // The pages its job opened, which closed when it ended.
  pages?: UsedPage[];
  // When the running reply started, and how long a finished one took, where that's known.
  startedAt?: number;
  took?: number;
  // Set on the last reply only.
  actions?: ReplyActions;
  // Set on the first reply only, where there's something to say.
  origin?: ReplyOrigin;
  // While the working view is hidden.
  onShowWork?: () => void;
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

// Thinking, before a reply has anything to show, where there's no reply yet to show it in. The face is the pips.
export const ThinkingMessage: React.FC<{ mascot?: MascotProfile; waiting?: boolean }> = ({ mascot, waiting = false }) => {
  const { showBerry } = useShell().settings;
  return (
    <WithFace mascot={mascot} mood={waiting ? "asking" : "thinking"} gutter={false}>
      <div role="status" className="h-6 flex items-center">
        {statusRow(waiting, showBerry)}
      </div>
    </WithFace>
  );
};

type SpokenProps = { chatId: string; approval: ChatApproval; mascot?: MascotProfile };

const LETTERS = ["A", "B", "C"];

// What never goes through a question, behind a ? at the end of the shell so the card stays the question. Its tooltip
// says it, under the mark, so it never covers an answer, and a screen reader hears it as the mark's description.
const SECRETS = "Passwords and codes go in the page, never here.";
const SecretsHint: React.FC = () => {
  const id = useId();
  return (
    <span className="flex shrink-0">
      <Tooltip words={SECRETS}>
        <button
          type="button"
          aria-label="About passwords and codes"
          aria-describedby={id}
          className={cn("press size-7 grid place-items-center rounded-row text-ink-3 hover:bg-hover hover:text-ink", FOCUS)}
        >
          <CircleHelp aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </Tooltip>
      <span id={id} className="sr-only">
        {SECRETS}
      </span>
    </span>
  );
};

// A mascot needs something only the user knows, and carries on with the answer: a card in a shell, with the answers it
// offered as rows to press. There's no field in it: in a chat the prompt box is where you answer. On Needs you, which
// has no prompt box, `field` goes under the answers. While the keyboard is on the card, A, B and C pick an answer, and
// the rows show those keys only then. Secrets go in the page, never here.
export const QuestionCard: React.FC<{
  approval: ChatApproval;
  name: string;
  onAnswer: (words: string) => void;
  onSkip: () => void;
  head?: React.ReactNode;
  field?: React.ReactNode;
  // Said in the shell before the ?, such as Open the chat.
  more?: React.ReactNode;
  focusOnShow?: boolean;
}> = ({ approval, name, onAnswer, onSkip, head, field, more, focusOnShow = false }) => {
  const answers = (approval.answers ?? []).slice(0, LETTERS.length);
  const { region, on } = useCardKeys({ onPick: (index) => onAnswer(answers[index]), picks: answers.length, focusOnShow });
  const showKeys = on !== "none" && on !== "field";
  return (
    <CardInShell
      label={`${name} is asking`}
      region={region}
      note={
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <Button variant="ghost" size="sm" className="-ml-2 px-2" onClick={onSkip}>
            Skip
          </Button>
          <span className="flex-1" />
          {more}
          <SecretsHint />
        </span>
      }
    >
      {head}
      <h3 className={cn("text-15 font-medium text-ink", (answers.length > 0 || field) && "mb-2")}>{approval.text}</h3>
      {answers.length > 0 && (
        <ul aria-label="Answers" className="-mx-1.5 -mb-1 flex flex-col gap-0.5">
          {answers.map((answer, index) => (
            <li key={answer} className="flex">
              <button
                type="button"
                aria-keyshortcuts={showKeys ? LETTERS[index] : undefined}
                onClick={() => onAnswer(answer)}
                className={cn(
                  "h-10 flex-1 min-w-0 px-2.5 flex items-center gap-[11px] rounded-tile bg-card-2 text-left text-14 text-ink transition-[background-color,transform] duration-fast hover:[background-image:linear-gradient(var(--hover),var(--hover))] active:scale-[.99]",
                  FOCUS,
                )}
              >
                {showKeys && <Keycap>{LETTERS[index]}</Keycap>}
                <span className="min-w-0 truncate">{answer}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {field && <div className={cn(answers.length > 0 && "mt-3")}>{field}</div>}
    </CardInShell>
  );
};

const ChatQuestionCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
  const name = useAssistantName(mascot);
  const send = (allow: boolean, answer?: string) => void window.chromeAPI.chat.decide(chatId, approval.id, allow, answer);
  return <QuestionCard approval={approval} name={name} onAnswer={(words) => send(true, words)} onSkip={() => send(false)} />;
};

// What the user can do about a tab they've been handed. Words are never typed here, so there's nowhere for a secret to go.
export const HandoffActions: React.FC<{
  tabId?: string;
  onDone: () => void;
  onNotNow: () => void;
}> = ({ tabId, onDone, onNotNow }) => {
  const { tabs, switchTab } = useBrowser();
  const here = tabs.some((tab) => tab.id === tabId && tab.isActive);
  const there = tabs.some((tab) => tab.id === tabId);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!here && there && tabId && <Button onClick={() => void switchTab(tabId)}>Go to the tab</Button>}
      <Button variant={here || !there ? "default" : "raised"} onClick={onDone}>
        I’m done
      </Button>
      <Button variant="ghost" className="px-1.5" onClick={onNotNow}>
        Not now
      </Button>
    </div>
  );
};

// The pips in `ask`, held still beside the line under a card: the live step above already moves.
const WaitingNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <span className="text-ask">
      <Pips pattern="waiting" still />
    </span>
    <span className="min-w-0 truncate">{children}</span>
  </>
);

// Your turn: a sign-in, a code or a captcha only the user can do. The site comes from the tab's address and every word
// from code, so a page can't write any of it. No key answers it: only a press of I'm done gives the tab back.
export const HandoffCard: React.FC<{
  approval: ChatApproval;
  name: string;
  onDone: () => void;
  onNotNow: () => void;
  head?: React.ReactNode;
  note?: React.ReactNode;
  focusOnShow?: boolean;
}> = ({ approval, name, onDone, onNotNow, head, note, focusOnShow = false }) => {
  const { region } = useCardKeys({ focusOnShow });
  const { need = "sign-in", site = "" } = approval.handoff ?? {};
  return (
    <CardInShell label={`${name} needs you`} region={region} note={note ?? <WaitingNote>{name} waits here until you say so</WaitingNote>}>
      {head}
      <h3 className="mb-1.5 flex items-center gap-2 text-15 font-medium text-ink">
        <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {HANDOFF_TITLE[need]} {site}
        </span>
      </h3>
      <p className="mb-3 text-14 leading-[1.45] text-ink-2">
        {name} has stepped back from this tab and can’t see it. What you type goes straight to the site.
      </p>
      <HandoffActions tabId={approval.handoff?.tabId} onDone={onDone} onNotNow={onNotNow} />
    </CardInShell>
  );
};

const ChatHandoffCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
  const name = useAssistantName(mascot);
  const send = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow);
  return <HandoffCard approval={approval} name={name} onDone={() => send(true)} onNotNow={() => send(false)} />;
};

// An action a mascot wants to take, which waits here until the user answers. The keyboard is never put on it here, so
// Enter in the prompt box always sends what's typed.
export const ChatApprovalCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
  const name = useAssistantName(mascot);
  const { showBerry } = useShell().settings;
  const decide = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow);
  if (approval.question) return <ChatQuestionCard chatId={chatId} approval={approval} mascot={mascot} />;
  if (approval.handoff) return <ChatHandoffCard chatId={chatId} approval={approval} mascot={mascot} />;
  const { question, exactly, mark, why } = approvalWords(approval, name, showBerry);
  return (
    <ApprovalCard
      question={question}
      exactly={exactly}
      mark={mark}
      note={why && <WhyLine>{why}</WhyLine>}
      onConfirm={() => decide(true)}
      onDeny={() => decide(false)}
    />
  );
};

// Why something failed, worded with what to do about it.
export const ChatError: React.FC<{ message: string }> = ({ message }) => (
  <p role="alert" className="text-14 text-ask animate-fade-in">
    {message}
  </p>
);
