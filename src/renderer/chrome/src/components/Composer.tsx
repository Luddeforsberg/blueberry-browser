import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Lock, Plus } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import { cn } from "@common/lib/utils";
import { sendOnEnter } from "@common/lib/keys";
import { SHELL } from "@common/components/cardShell";
import { AddMenu, type AddMenuOptions } from "./AddMenu";
import { Tooltip } from "@common/components/Tooltip";
import { Button } from "@common/components/Button";
import { IconSwap } from "@common/components/IconSwap";
import { usePresence } from "@common/components/motion";
import { FOCUS, type PillFace, MascotMenu, MascotPill, WhereSwitch } from "./ComposerPills";
export type { PillFace } from "./ComposerPills";

// DESIGN.md section 10, The prompt box: one component everywhere, a card set into a shell.

const labelFor = (stopping: boolean, cloud: { on: boolean } | undefined): string =>
  stopping ? "Stop" : cloud?.on ? "Send to the cloud" : "Send";

// Stop, beside Send while a reply runs and there's something to send after it.
const StopBeside: React.FC<{ onStop: (() => void) | undefined; shown: boolean; small: boolean; onCard: boolean }> = ({
  onStop,
  shown,
  small,
  onCard,
}) =>
  onStop && shown ? (
    <Tooltip words="Stop">
      <Button
        variant="ghost"
        size={small ? "icon-xs" : "icon"}
        aria-label="Stop"
        onClick={onStop}
        className={cn("text-ink", small && "size-7", onCard ? "bg-card-2" : "bg-sheet-2")}
      >
        <span className={cn("block rounded-[2.5px] bg-current", small ? "size-[9px]" : "size-2.5")} />
      </Button>
    </Tooltip>
  ) : null;

// The one input for talking to a mascot, on the new tab, the main chat and the chat panel.
export const Composer: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  autoFocus?: boolean | undefined;
  // Moves the keyboard here each time this changes.
  focusKey?: number | undefined;
  spellCheck?: boolean;
  // The new tab's box is larger, with room for a longer ask. Everywhere else it's the chat's.
  size?: "hero" | "chat";
  // Shown above the text: the chips for what it's been given to read.
  attachment?: React.ReactNode;
  // What the + menu offers. Without it, there's no +.
  add?: AddMenuOptions | undefined;
  // Files dropped or pasted onto the box, which go where A file's do.
  onFiles?: ((files: File[]) => void) | undefined;
  // With no box of its own, because the window it's in is the box.
  bare?: boolean;
  canSend: boolean;
  // Send, or Enter. `ask` is ⌘ or Ctrl held with Enter.
  onSend: (ask: boolean) => void;
  // While a reply is running, Send stops it.
  onStop?: (() => void) | undefined;
  // Who this goes to. With `onChooseMascot`, pressing it opens the menu. Without, it just says who.
  mascot?: MascotProfile | undefined;
  onChooseMascot?: ((id: string) => void) | undefined;
  // Who's ticked in the menu, when the pill is still showing the one before (the new tab's switch).
  chosenId?: string;
  face?: PillFace;
  // The placeholder fades while one mascot gives way to another.
  quietPlaceholder?: boolean;
  // Whether this job is done in the cloud, where that's set up.
  cloud?: { on: boolean; onToggle: () => void } | undefined;
  // The chosen mascot's limits, in words, in the shell under the card. Null or empty slides it away.
  limits?: string | null;
}> = ({
  label,
  placeholder,
  value,
  onChange,
  rows = 1,
  autoFocus,
  focusKey,
  spellCheck,
  size = "chat",
  attachment,
  add,
  onFiles,
  bare,
  canSend,
  onSend,
  onStop,
  mascot,
  onChooseMascot,
  chosenId,
  face,
  quietPlaceholder,
  cloud,
  limits,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [adding, setAdding] = useState(false);
  // Each menu stays a moment after it closes, to go back into its button.
  const choosingMenu = usePresence(choosing);
  const addingMenu = usePresence(adding);
  // Files are being dragged over the box. Counted, as entering a child leaves the parent.
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const plus = useRef<HTMLButtonElement>(null);
  const hero = size === "hero";
  // The desktop's box is the only one with smaller tools. In a chat they're the new tab's size.
  const small = !!bare;
  // The chat's card is `card`, a step up from the page it's on in dark, and anything quiet on it is `card-2`. The new
  // tab's sits on the well and the desktop's is a window of its own, so they keep `sheet` and `sheet-2`.
  const onCard = !hero && !bare;
  // The last words, kept while the line slides away.
  const [lastLimits, setLastLimits] = useState(limits ?? "");
  useEffect(() => {
    if (limits) setLastLimits(limits);
  }, [limits]);

  useEffect(() => {
    if (!choosing && !adding) return;
    const close = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      setChoosing(false);
      setAdding(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [choosing, adding]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!focusKey || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [focusKey]);

  const closeMenu = (refocus: boolean) => {
    setChoosing(false);
    if (refocus) pill.current?.focus();
  };
  const closeAdding = (refocus: boolean) => {
    setAdding(false);
    if (refocus) plus.current?.focus();
  };

  // Only files: a link or words dragged in aren't added.
  const carriesFiles = (event: React.DragEvent) => !!onFiles && [...event.dataTransfer.types].includes("Files");
  const dropHandlers = onFiles
    ? {
        onDragEnter: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          dragDepth.current++;
          setDropping(true);
        },
        onDragOver: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropping(false);
        },
        onDrop: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDropping(false);
          onFiles([...event.dataTransfer.files]);
          textareaRef.current?.focus();
        },
      }
    : {};

  // While a reply runs the button is Stop, until there's something to send. Then Stop moves beside it, so both stay.
  const stop = canSend ? undefined : onStop;
  const sendLabel = labelFor(!!stop, cloud);
  const sendButton = (
    <Tooltip words={sendLabel}>
      <button
        type="button"
        aria-label={sendLabel}
        onClick={stop ?? (() => onSend(false))}
        disabled={!stop && !canSend}
        className={cn(
          "shrink-0 rounded-full flex items-center justify-center transition-[background-color,color,transform] duration-move ease-crisp active:scale-[.96]",
          small ? "size-7" : "size-8",
          "bg-ink text-sheet hover:bg-ink/85 disabled:text-faint disabled:active:scale-100",
          onCard ? "disabled:bg-card-2" : "disabled:bg-sheet-2",
          FOCUS,
        )}
      >
        <IconSwap
          shown={stop ? "stop" : "send"}
          icons={{
            send: <ArrowUp className="size-4" strokeWidth={1.75} />,
            stop: <span className={cn("block rounded-[2.5px] bg-current", small ? "size-[9px]" : "size-2.5")} />,
          }}
        />
      </button>
    </Tooltip>
  );

  const textarea = (
    <textarea
      ref={textareaRef}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      rows={rows}
      autoFocus={autoFocus}
      spellCheck={spellCheck}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) =>
        sendOnEnter(event, (ask) => {
          if (canSend) onSend(ask);
        })
      }
      onPaste={(event) => {
        // A picture or a file pasted is added, as A file adds it. Words pasted are typing, whatever else came with them.
        const files = [...event.clipboardData.files];
        if (!onFiles || files.length === 0 || event.clipboardData.types.includes("text/plain")) return;
        event.preventDefault();
        onFiles(files);
      }}
      className={cn(
        "block w-full resize-none bg-transparent text-ink caret-ink outline-none placeholder:text-faint placeholder:transition-opacity placeholder:duration-[120ms]",
        hero ? "text-15 min-h-[50px]" : "text-15 min-h-[34px]",
        quietPlaceholder && "placeholder:opacity-0",
      )}
    />
  );

  // The desktop's box is its own window, so it's only the words and Send.
  if (bare) {
    return (
      <div
        onClick={(event) => !(event.target as Element).closest("button") && textareaRef.current?.focus()}
        className="w-full flex items-end gap-1 p-1.5 pl-3 cursor-text"
      >
        <div className="flex-1 min-w-0 py-[5px]">{textarea}</div>
        <StopBeside onStop={onStop} shown={canSend} small={small} onCard={onCard} />
        {sendButton}
      </div>
    );
  }

  const plusButton = add && (
    <Tooltip words="Add a tab or a file">
      <button
        ref={plus}
        type="button"
        aria-label="Add a tab or a file"
        aria-haspopup="menu"
        aria-expanded={adding}
        onClick={() => {
          setChoosing(false);
          setAdding(!adding);
        }}
        className={cn(
          "press shrink-0 flex items-center justify-center text-ink hover:bg-press",
          onCard ? "bg-card-2" : "bg-sheet-2",
          adding && "bg-press",
          small ? "size-7 rounded-row" : "size-8 rounded-tile",
          FOCUS,
        )}
      >
        {/* Open, it's the way to close: the + turns to a ×. */}
        <Plus className={cn("size-4 transition-transform duration-menu ease-crisp", adding && "rotate-45")} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );

  return (
    <div ref={box} className="relative w-full" {...dropHandlers}>
      {/* At chat size it's a 16px card in a 20px shell, as an approval is, so the chat's cards read as one family. */}
      <div
        className={cn(
          dropping ? "bg-tray p-1 shadow-[inset_0_0_0_1.5px_rgb(var(--ink))]" : SHELL,
          hero ? "rounded-shell" : "rounded-card-shell",
        )}
      >
        <div
          onClick={(event) => {
            if (!(event.target as Element).closest("button,[role=menu],[role=group]")) textareaRef.current?.focus();
          }}
          data-sheet={onCard ? undefined : ""}
          className={cn(
            "group/box relative cursor-text",
            dropping ? "bg-transparent" : cn("shadow-card-lift", onCard ? "bg-card" : "bg-sheet"),
            hero ? "rounded-prompt pt-[18px] pr-3 pb-3 pl-5" : "rounded-sheet pt-[13px] pr-[9px] pb-[9px] pl-4",
          )}
        >
          {/* Dropping: the box keeps its size, and says what letting go does. */}
          {dropping && (
            <p aria-hidden className="absolute inset-0 flex items-center justify-center text-15 text-ink pointer-events-none">
              Drop to add
            </p>
          )}
          <div className={cn(dropping && "invisible")}>
            {attachment && <div className="mb-2.5 -ml-1.5 cursor-default">{attachment}</div>}
            <div className={hero ? "mb-1" : undefined}>{textarea}</div>
            <div className="-ml-2 flex items-center gap-[7px]">
              {plusButton}
              {cloud && <WhereSwitch on={cloud.on} onToggle={cloud.onToggle} small={small} />}
              <span className="flex-1" />
              {mascot && (
                <MascotPill
                  mascot={mascot}
                  face={face}
                  small={small}
                  onCard={onCard}
                  chooser={
                    onChooseMascot && {
                      open: choosing,
                      onToggle: () => {
                        setAdding(false);
                        setChoosing(!choosing);
                      },
                      onOpen: () => setChoosing(true),
                      button: pill,
                    }
                  }
                />
              )}
              <StopBeside onStop={onStop} shown={canSend} small={small} onCard={onCard} />
              {sendButton}
            </div>
          </div>
        </div>
        {/* The chosen mascot's limits, and nothing else, for as long as it's chosen. */}
        <div
          aria-hidden={!limits}
          // Hidden too once it has slid away, so it's out of reach of the keyboard and screen readers.
          className={cn(
            "grid transition-[grid-template-rows,visibility] duration-panel ease-crisp",
            limits ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <p className="min-h-[38px] px-3.5 py-[11px] flex items-start gap-2.5 text-13 text-ink-2">
              <Lock aria-hidden className="size-3.5 shrink-0 mt-px text-ink-3" strokeWidth={1.75} />
              <span className="min-w-0">{limits || lastLimits}</span>
            </p>
          </div>
        </div>
      </div>
      {addingMenu.shown && add && <AddMenu {...add} above={!hero} leaving={addingMenu.leaving} onClose={closeAdding} />}
      {choosingMenu.shown && mascot && onChooseMascot && (
        <MascotMenu
          chosenId={chosenId ?? mascot.id}
          above={!hero}
          leaving={choosingMenu.leaving}
          onChoose={(id) => {
            onChooseMascot(id);
            setChoosing(false);
            textareaRef.current?.focus();
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};
