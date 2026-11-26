import React from "react";
import type { QueuedMessage } from "@shared/library";
import { SentAttachments } from "./AttachmentChips";
import { Button } from "@common/components/Button";

// Part of the message layout (ChatMessage.tsx): what the user sent while a reply ran, as their own messages, outlined
// until the mascot gets to them. The first goes when the reply ends. After a stop or a failure they wait for the user.
export const QueuedMessages: React.FC<{
  chatId: string;
  queued: QueuedMessage[];
  running: boolean;
  // Puts the words back in the prompt box, to change and send again.
  onEdit: (content: string) => void;
}> = ({ chatId, queued, running, onEdit }) => {
  const act = (id: string, action: "send-now" | "remove") => void window.chromeAPI.chat.followUp(chatId, id, action);
  return (
    <ol aria-label="Waiting to send" className="flex flex-col gap-3">
      {queued.map(({ id, content, attached }, index) => (
        <li key={id} className="flex flex-col items-end gap-1.5 animate-fade-in">
          {attached && attached.length > 0 && (
            <div className="max-w-[80%]">
              <SentAttachments attached={attached} />
            </div>
          )}
          <div className="max-w-[76%] px-3.5 py-2.5 rounded-sheet rounded-br-[5px] shadow-[inset_0_0_0_1.5px_var(--line)] text-15 text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
            {content}
          </div>
          <div className="flex items-center gap-1 text-12 text-ink-3">
            <span className="pr-1">{!running ? "Not sent" : index === 0 ? "Next" : "Then"}</span>
            <Action onClick={() => act(id, "send-now")}>{running ? "Send now" : "Send"}</Action>
            {!attached?.length && (
              <Action
                onClick={() => {
                  act(id, "remove");
                  onEdit(content);
                }}
              >
                Edit
              </Action>
            )}
            <Action onClick={() => act(id, "remove")}>Remove</Action>
          </div>
        </li>
      ))}
    </ol>
  );
};

const Action: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <Button variant="ghost" size="xs" onClick={onClick} className="px-1.5 text-12 font-normal">
    {children}
  </Button>
);
