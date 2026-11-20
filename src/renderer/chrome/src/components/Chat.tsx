import React from "react";
import { useBrowser } from "../contexts/useBrowser";
import { useChat } from "../contexts/useChat";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { BerrySpot } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { AssistantMessage, ChatApprovalCard, UserMessage, WentWrong, type ReplyActions } from "./ChatMessage";
import { didWork } from "./didWork";
import { useFollowReply } from "./useFollowReply";
import { chatRoutine } from "../routinesView";
import { MemoryOffers } from "./MemoryInChat";
import { PageChip } from "./AttachmentChips";
import { ChatComposer } from "./ChatComposer";
import { answerInBox } from "./answerInBox";
import { siteAllowed } from "@shared/mascots";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// The chat panel's conversation: the same messages, steps, cards and prompt box as the main chat, beside a page.
export const Chat: React.FC = () => {
  const {
    transcript: { entries, running, error },
    chatId,
    title,
    approval,
    sendMessage,
    stop,
    pageAccess: enabled,
    setPageAccess: change,
    draft,
    takeDraft,
    mascotId,
  } = useChat();
  const { find, chosen, choose } = useMascots();
  // A chat not started yet goes to whoever is chosen. After that, it stays with the mascot it started with.
  const mascot = chatId ? find(mascotId) : chosen;
  const library = useLibrary();
  // An offer to remember arrives after the reply has ended, and has to be followed down like a step.
  const offers = library.memory.offers.filter((offer) => offer.sourceId === chatId).length;
  const messages = entries.map(({ message }) => message);
  const last = messages.at(-1);
  const scrollerRef = useFollowReply(
    messages.filter((message) => message.role === "user").length,
    // Null once it's over, so ending counts as a change and what comes under the reply is followed too.
    running ? last?.content : null,
    (last?.steps?.length ?? 0) + (approval ? 1 : 0) + offers,
  );
  const name = useAssistantName(mascot);
  const { activeTab } = useBrowser();
  const host = activeTab && !activeTab.page ? hostOf(activeTab.url) : null;
  const canUseSite = !!activeTab && siteAllowed(activeTab.url, mascot.sites);
  const heldByUser = library.needsYou.some(({ approval }) => !!activeTab && approval.handoff?.tabId === activeTab.id);

  // While a question waits, the prompt box is where it's answered.
  const question = approval?.question ? approval : null;
  const actions: ReplyActions = {
    onSay: (words) => void sendMessage(words, mascot.id),
    routineFromChat: chatId && didWork(messages) ? () => chatRoutine(title ?? "", messages, mascotId) : undefined,
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
            <BerrySpot size={40} mascot={mascot} />
            <p className="text-14 text-ink-2">Ask about this page, or anything else.</p>
          </div>
        ) : (
          <div className="px-3.5 pt-2 pb-4 flex flex-col gap-6">
            {entries.map(({ key, message, streaming, error: failed }, index) =>
              message.role === "user" ? (
                <UserMessage key={key} content={message.content} attached={message.attached} />
              ) : (
                <AssistantMessage
                  key={key}
                  content={message.content}
                  steps={message.steps}
                  said={message.said}
                  startedAt={message.startedAt}
                  took={message.took}
                  isStreaming={streaming}
                  waiting={approval !== null}
                  mascot={mascot}
                  error={failed ?? undefined}
                  memoryIds={message.memoryIds}
                  pages={message.pages}
                  actions={!running && index === entries.length - 1 ? actions : undefined}
                />
              ),
            )}
            {chatId && approval && (
              <div className="-mt-2">
                <ChatApprovalCard chatId={chatId} approval={approval} mascot={mascot} />
              </div>
            )}
            {error && <WentWrong message={error} mascot={mascot} actions={actions} />}
            {!running && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
          </div>
        )}
      </div>

      <div className="px-3.5 pb-3.5 pt-1">
        <ChatComposer
          onSend={(message, attached) =>
            chatId && question ? answerInBox(chatId, question.id, message, attached) : sendMessage(message, mascot.id, attached)
          }
          answering={!!question}
          mascot={mascot}
          onChooseMascot={chatId ? undefined : choose}
          draft={draft}
          onDraftTaken={takeDraft}
          disabled={running && !question}
          onStop={running ? stop : undefined}
          placeholder={
            question
              ? question.answers?.length
                ? `Answer ${name}, or pick one above`
                : `Answer ${name}`
              : name === "Assistant"
                ? "Write a message"
                : running
                  ? `Tell ${name} something while it works`
                  : `Tell ${name} something`
          }
          attachment={
            heldByUser ? (
              <p className="basis-full px-2 py-1 text-13 text-ink-2">{name} can’t see this tab while it’s with you.</p>
            ) : host && !canUseSite ? (
              <p className="basis-full px-2 py-1 text-13 text-ink-2">
                {name} isn’t allowed on {host}, so it can’t see this page.
              </p>
            ) : enabled && host ? (
              <PageChip title={activeTab?.title || host} host={host} favicon={activeTab?.favicon} onRemove={() => change(false)} />
            ) : undefined
          }
          attach={{
            chatId,
            mascot,
            place: "here",
            // The page in front, while it isn't a chip already.
            thisPage:
              host && !enabled
                ? {
                    site: host,
                    favicon: activeTab?.favicon ?? null,
                    problem: heldByUser ? "It’s with you for now" : !canUseSite ? `${name} isn’t allowed on ${host}` : null,
                    onAdd: () => change(true),
                  }
                : undefined,
          }}
        />
      </div>
    </div>
  );
};
