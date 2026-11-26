import React, { useEffect, useRef, useState } from "react";
import type { TabInfo } from "@shared/ipc";
import { useChatThread } from "../contexts/useChat";
import { AssistantMessage, ChatApprovalCard, UserMessage, WentWrong, type ReplyActions, type ReplyOrigin } from "../components/ChatMessage";
import { didWork } from "../components/didWork";
import { useFollowReply } from "../components/useFollowReply";
import { chatRoutine } from "../routinesView";
import { useAssistantName } from "../components/useAssistantName";
import { MemoryOffers } from "../components/MemoryInChat";
import { ChatComposer } from "../components/ChatComposer";
import { QueuedMessages } from "../components/QueuedMessages";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { WorkingStrip, WorkingView } from "../components/WorkingView";
import { useWorkView } from "../components/useWorkView";
import { RunnerView } from "../components/RunnerView";
import { answerInBox } from "../components/answerInBox";
import { transcriptOf } from "../chatTranscript";

// DESIGN.md section 2: the working view is 420px, with 18px either side of the picture, and goes beside the conversation
// only while that keeps room to read.
const WORK_VIEW = 420;
const PICTURE_WIDTH = WORK_VIEW - 2 * 18;
const ROOM_FOR_WORK = WORK_VIEW + 480;

// The conversation and the prompt box share one column, so they line up however wide the page is. A reply's face hangs
// 36px out from it: 28px either side, or 36px where the page is too narrow for the face to go past the column's edge.
const COLUMN = "w-full max-w-[720px] mx-auto px-[clamp(28px,calc(396px_-_50%),36px)]";

// A full page for talking to a mascot about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
  const chatId = tab.pageParam;
  const thread = useChatThread(chatId);
  const { find } = useMascots();
  // A chat stays with the mascot it started with.
  const mascot = find(thread?.mascotId ?? null);
  const name = useAssistantName(mascot);
  const { entries, running, error, queued } = transcriptOf(thread);
  // Edit on a message waiting to be sent puts its words back in the prompt box.
  const [draft, setDraft] = useState<string | null>(null);
  const messages = entries.map(({ message }) => message);
  const last = messages.at(-1);
  const pageRef = useRef<HTMLDivElement>(null);
  const askingRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  // Hide work holds for this chat, until Show work in the Working block.
  const [workHidden, setWorkHidden] = useState(false);
  useEffect(() => setWorkHidden(false), [chatId]);
  const hasThread = !!chatId && !!thread;
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPageSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(page);
    return () => observer.disconnect();
  }, [hasThread]);
  const roomBeside = pageSize.width >= ROOM_FOR_WORK;
  // Nothing is captured while the view is hidden or has no room.
  const { view: work, frames } = useWorkView(chatId, roomBeside && !workHidden ? PICTURE_WIDTH : 0);
  const library = useLibrary();
  // An offer to remember arrives after the reply has ended, and has to be followed down like a step.
  const offers = library.memory.offers.filter((offer) => offer.sourceId === chatId).length;
  // Only the library's list says whether a chat's jobs go to a cloud tab, not the thread.
  const inCloud = library.chats.some((chat) => chat.id === chatId && chat.cloud);
  const follow = useFollowReply(
    messages.filter((message) => message.role === "user").length,
    // Null once it's over, so ending counts as a change and what comes under the reply is followed too.
    running ? last?.content : null,
    (last?.steps?.length ?? 0) + (thread?.approval ? 1 : 0) + offers,
  );

  // Chats begin on the new tab page, so this is only ever a moment while the chat loads, or one just deleted.
  if (!chatId || !thread) return <div ref={pageRef} className="h-full" />;

  const actions: ReplyActions = {
    onSay: (words) => void window.chromeAPI.chat.send(chatId, words, { seePage: false, mascotId: mascot.id }),
    routineFromChat: didWork(thread.messages) ? () => chatRoutine(thread.title, thread.messages, thread.mascotId) : undefined,
  };

  // While a question waits, the prompt box is where it's answered.
  const question = thread.approval?.question ? thread.approval : null;
  const onRunner = !!thread.runner && running && roomBeside;
  const workBeside = !!work && roomBeside && !workHidden;
  // There's no line on top: where it runs is said only when that's not here, and who started it only when it wasn't the
  // user, over the first reply.
  const origin: ReplyOrigin | undefined =
    thread.runner || inCloud
      ? { words: "in the cloud", cloud: true }
      : thread.from
        ? { words: `from ${thread.from}`, cloud: false }
        : undefined;

  const firstReply = messages.findIndex((message) => message.role === "assistant");

  return (
    <div ref={pageRef} className="h-full flex">
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div {...follow} className="flex-1 min-h-0 overflow-y-auto">
          <div className={`${COLUMN} pt-6 pb-4 flex flex-col gap-6`}>
            {entries.map(({ key, message, streaming, error: failed }, index) =>
              message.role === "user" ? (
                <UserMessage key={key} content={message.content} attached={message.attached} />
              ) : (
                <AssistantMessage
                  key={key}
                  content={message.content}
                  steps={message.steps}
                  said={message.said}
                  isStreaming={streaming}
                  waiting={thread.approval !== null}
                  mascot={mascot}
                  error={failed ?? undefined}
                  memoryIds={message.memoryIds}
                  pages={message.pages}
                  startedAt={message.startedAt}
                  took={message.took}
                  actions={!running && index === entries.length - 1 ? actions : undefined}
                  origin={index === firstReply ? origin : undefined}
                  onShowWork={streaming && work && roomBeside && workHidden ? () => setWorkHidden(false) : undefined}
                  gutter
                />
              ),
            )}
            {thread.approval && (
              <div ref={askingRef} className="-mt-2">
                <ChatApprovalCard chatId={chatId} approval={thread.approval} mascot={mascot} />
              </div>
            )}
            {/* With no room beside the chat, a page handed to the user still has to be somewhere to do it in. */}
            {thread.runner && running && !roomBeside && thread.approval?.handoff && (
              <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
            )}
            {queued.length > 0 && <QueuedMessages chatId={chatId} queued={queued} running={running} onEdit={setDraft} />}
            {error && <WentWrong message={error} mascot={mascot} actions={actions} gutter />}
            {!running && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
          </div>
        </div>

        <div className={`${COLUMN} shrink-0 pb-4`}>
          {work && !roomBeside && work.outcome === null && <WorkingStrip view={work} mascot={mascot} approval={thread.approval} />}
          <ChatComposer
            onSend={(message, attached) =>
              question
                ? answerInBox(chatId, question.id, message, attached)
                : window.chromeAPI.chat.send(chatId, message, { seePage: false, mascotId: mascot.id, ...attached }).then(
                    (sent) => sent !== null,
                    () => false,
                  )
            }
            answering={!!question}
            // A runner chat goes on with this computer off, and a cloud chat works in its own browser there.
            attach={{ chatId, mascot, place: thread.runner ? "runner" : inCloud ? "cloud" : "here" }}
            // A runner chat's next message waits for its job to end.
            disabled={running && !question && !!thread.runner}
            draft={draft}
            onDraftTaken={() => setDraft(null)}
            onStop={running ? () => void window.chromeAPI.chat.stop(chatId) : undefined}
            placeholder={
              question
                ? question.answers?.length
                  ? `Answer ${name}, or pick one above`
                  : `Answer ${name}`
                : name === "Assistant"
                  ? "Write a message"
                  : running && thread.runner
                    ? `${name} is working in the cloud`
                    : running
                      ? `Tell ${name} what to do next`
                      : `Tell ${name} something`
            }
            autoFocus
            mascot={mascot}
          />
        </div>
      </div>
      {onRunner && (
        <aside
          aria-label="What it’s working on"
          className="shrink-0 h-full overflow-y-auto overflow-x-hidden bg-well shadow-[inset_1px_0_0_var(--line)] px-[18px] pt-16 pb-5"
          style={{ width: WORK_VIEW }}
        >
          <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
        </aside>
      )}
      {workBeside && (
        <aside
          aria-label="What it’s working on"
          className="relative shrink-0 h-full overflow-y-auto overflow-x-hidden bg-well shadow-[inset_1px_0_0_var(--line)]"
          style={{ width: WORK_VIEW }}
        >
          {/* The well's dot grid, coming in towards the bottom, under everything else. */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:linear-gradient(transparent_40%,#000)]"
          />
          <div className="relative min-h-full flex flex-col">
            <WorkingView
              view={work}
              frames={frames}
              mascot={mascot}
              approval={thread.approval}
              aspect={pageSize.height > 0 ? pageSize.width / pageSize.height : 1}
              onHide={() => setWorkHidden(true)}
              onShowAsking={() => askingRef.current?.scrollIntoView({ block: "nearest" })}
            />
          </div>
        </aside>
      )}
    </div>
  );
};
