import React, { useId } from "react";
import type { ChatApproval, MascotProfile } from "@shared/library";
import { CircleHelp, Lock } from "lucide-react";
import { ApprovalCard, CardInShell, Keycap, WhyLine } from "@common/components/ApprovalCard";
import { useCardKeys } from "@common/components/cardKeys";
import { useShell } from "../contexts/useShell";
import { Button } from "@common/components/Button";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { useBrowser } from "../contexts/useBrowser";
import { useAssistantName } from "./useAssistantName";
import { Tooltip } from "@common/components/Tooltip";
import { FOCUS } from "./chipClass";
import { approvalWords, HANDOFF_TITLE } from "./approvalWords";

// Part of the message layout (ChatMessage.tsx): the cards a job asks with, a question or a handoff.

type SpokenProps = { chatId: string; approval: ChatApproval; mascot?: MascotProfile | undefined };

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
const HandoffActions: React.FC<{
  tabId?: string | undefined;
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
