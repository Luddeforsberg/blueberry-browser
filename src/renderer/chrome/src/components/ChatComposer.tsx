import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ARM_MS } from "@common/components/cardKeys";
import type { MascotProfile } from "@shared/library";
import type { AddMenuOptions } from "./AddMenu";
import { BoxChips } from "./BoxAttachments";
import { useAddMenu } from "./useAddMenu";
import { useAttachments, type Attached, type JobPlace } from "../useAttachments";
import { BERRY } from "@shared/mascots";
import { Composer } from "./Composer";
import { leftAfterSend } from "@shared/draft";
import { useSendOnce } from "./promptSend";

// A composer that sends on Enter, for both chats.
export const ChatComposer: React.FC<{
  // Whether main took the message. It may refuse one, as when an attached tab has been handed to the user since.
  onSend: (message: string, attached: Attached) => Promise<boolean>;
  onStop?: (() => void) | undefined;
  disabled?: boolean;
  placeholder: string;
  // Shown first among the chips, such as the page in front.
  attachment?: React.ReactNode;
  // Where the + adds a tab or a file. Without it, there's no +.
  attach?: { chatId: string | null; mascot: MascotProfile; place: JobPlace; thisPage?: AddMenuOptions["thisPage"] };
  autoFocus?: boolean;
  // Text to add to whatever is already being written. It's never sent without the user.
  draft?: string | null;
  onDraftTaken?: () => void;
  mascot?: MascotProfile;
  onChooseMascot?: ((id: string) => void) | undefined;
  // A question waits, so sending answers it.
  answering?: boolean;
}> = ({
  onSend,
  onStop,
  disabled = false,
  placeholder,
  attachment,
  attach,
  autoFocus,
  draft,
  onDraftTaken,
  mascot,
  onChooseMascot,
  answering = false,
}) => {
  const [value, setValue] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const box = useAttachments(attach?.place ?? "here");
  const add = useAddMenu(box, {
    chatId: attach?.chatId ?? null,
    mascot: attach?.mascot ?? BERRY,
    place: attach?.place ?? "here",
    thisPage: attach?.thisPage,
  });

  // StrictMode runs this twice when the panel opens with a draft waiting, and it must only add it once.
  const draftTaken = useRef(false);
  useEffect(() => {
    if (!draft) {
      draftTaken.current = false;
      return;
    }
    if (draftTaken.current) return;
    draftTaken.current = true;
    setValue((current) => (current ? `${current}\n\n${draft}` : draft));
    setFocusKey((key) => key + 1);
    onDraftTaken?.();
  }, [draft, onDraftTaken]);

  // A question that has only just arrived isn't answered by a send already on its way, as a card's keys aren't.
  const answeringSince = useRef(0);
  useLayoutEffect(() => {
    if (answering) answeringSince.current = performance.now();
  }, [answering]);

  // What was typed and attached stays in the box until main has taken it, so a refused message can be sent again.
  const sendOnce = useSendOnce();
  const send = () => {
    const message = value.trim();
    if (!message || disabled) return;
    if (answering && performance.now() - answeringSince.current < ARM_MS) return;
    const written = value;
    const inBox = box.contents();
    sendOnce(async () => {
      if (!(await onSend(message, box.sendable()))) return;
      setValue((now) => leftAfterSend(now, written));
      box.letGo(inBox);
    });
  };

  return (
    <Composer
      label="Message"
      placeholder={placeholder}
      value={value}
      onChange={setValue}
      autoFocus={autoFocus}
      focusKey={focusKey}
      attachment={box.empty && !attachment ? undefined : <BoxChips box={box} before={attachment} />}
      add={attach ? add : undefined}
      onFiles={attach && attach.place !== "runner" ? (files) => void box.addFiles(files) : undefined}
      canSend={!disabled && value.trim().length > 0}
      onSend={send}
      onStop={onStop}
      mascot={mascot}
      onChooseMascot={onChooseMascot}
    />
  );
};
