import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Cloud, Laptop } from "lucide-react";
import type { DesktopPanelState } from "@shared/ipc";
import { DESKTOP_BOX, DESKTOP_SHADOW } from "@shared/desktopSizes";
import { SwitchSheet } from "@common/components/Controls";
import { TIP_KEY, Tooltip } from "@common/components/Tooltip";
import { cn } from "@common/lib/utils";
import { sendOnEnter } from "@common/lib/keys";
import { leftAfterSend } from "@shared/draft";
import { useSendOnce } from "./components/promptSend";
import { DropFace, DropShape } from "./DesktopDrop";
import { EASE, dropAt, restingSize, sideEdge } from "./desktopShape";
import { desktop, FOCUS } from "./desktopPanelParts";

// Part of the desktop panel (DesktopPanel.tsx): the prompt box, grown from the drop.

// Five lines of words, and then the box scrolls.
const MAX_TEXT_HEIGHT = 5 * 23;
const BOX_PADDING = (DESKTOP_BOX.thick - 23) / 2;
const CHIP =
  "press h-7 min-w-0 max-w-40 shrink px-[11px] rounded-full bg-tip text-tip-ink shadow-tip text-13 font-medium inline-flex items-center gap-1.5 whitespace-nowrap";

const useRoom = () => {
  const [room, setRoom] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resized = () => setRoom({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  return room;
};

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="flex gap-[3px]">
    {keys.map((key) => (
      <kbd key={key} className={TIP_KEY}>
        {key}
      </kbd>
    ))}
  </span>
);

// This PC or Cloud, on the drop: the chosen side carries its name and the other is its icon, and the sheet slides.
const WhereSwitch: React.FC<{ on: boolean; mac: boolean; onToggle: () => void }> = ({ on, mac, onToggle }) => {
  const group = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  const here = mac ? "This Mac" : "This PC";
  const sides = ([false, true] as const).map((cloud) => ({
    chosen: on === cloud,
    Icon: cloud ? Cloud : Laptop,
    label: cloud ? "Cloud" : here,
    tip: cloud
      ? `${on ? "Runs" : "Run"} in the cloud, with your ${mac ? "Mac" : "PC"} off`
      : `${on ? "Run" : "Runs"} on ${mac ? "this Mac" : "this PC"}`,
  }));
  const side = "h-[26px] px-2 flex items-center rounded-full text-13";
  const name = (chosen: boolean) =>
    cn("whitespace-nowrap overflow-hidden", chosen ? "max-w-20 ml-1.5 opacity-100" : "max-w-0 ml-0 opacity-0");
  return (
    <div ref={group} role="radiogroup" aria-label="Where it runs" className="relative shrink-0 flex p-[3px] rounded-full bg-tip-ink/10">
      <span ref={ruler} aria-hidden className="absolute inset-0 p-[3px] flex invisible pointer-events-none">
        {sides.map(({ chosen, Icon, label }) => (
          <span key={label} data-side className={side}>
            <Icon className="size-[14px]" strokeWidth={1.75} />
            <span className={name(chosen)}>{label}</span>
          </span>
        ))}
      </span>
      <SwitchSheet group={group} ruler={ruler} chosen={on ? 1 : 0} className="bg-tip-ink/[.18]" />
      {sides.map(({ chosen, Icon, label, tip }) => (
        <Tooltip key={label} words={tip}>
          <button
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={label}
            onClick={() => !chosen && onToggle()}
            className={cn(side, "press relative", chosen ? "text-tip-ink" : "text-tip-ink/60 hover:text-tip-ink", FOCUS)}
          >
            <Icon className="size-[14px]" strokeWidth={1.75} />
            <span className={cn(name(chosen), "transition-[max-width,margin,opacity] duration-slide ease-crisp")}>{label}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
};

// The prompt box: the drop, grown. Each opening starts at the drop's own size and place, over the drop in its window
// beneath, and grows from there, and closing shrinks it back before the window hides, so the two read as one shape.
export const GrownBox: React.FC<{
  state: DesktopPanelState;
  mac: boolean;
  draft: string;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
}> = ({ state, mac, draft, setDraft }) => {
  const { box, edge, anchor, still, closing, opened, showBerry } = state;
  const room = useRoom();
  const [grown, setGrown] = useState(false);
  const [picking, setPicking] = useState(false);
  const [cloudChoice, setCloudChoice] = useState<boolean | null>(null);
  const [textHeight, setTextHeight] = useState(23);
  const field = useRef<HTMLTextAreaElement>(null);

  // Null follows the mascot, which may work in the cloud. Choosing another goes back to following it.
  useEffect(() => setCloudChoice(null), [box.chosen.id]);
  const inCloud = box.cloud.fits && (cloudChoice ?? box.cloud.on);

  useLayoutEffect(() => {
    setPicking(false);
    if (still) return setGrown(true);
    setGrown(false);
    // Drawn once at the drop's size, then grown from it.
    let second = 0;
    const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setGrown(true))));
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [opened, still]);
  useEffect(() => {
    if (closing) setGrown(false);
  }, [closing]);
  useEffect(() => {
    field.current?.focus();
  }, [opened]);
  // Esc closes the picker, and then the box, wherever the keyboard is in it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!picking) return void desktop().closePanel();
      setPicking(false);
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  // The box grows taller with the words, to five lines.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    const height = Math.min(element.scrollHeight, MAX_TEXT_HEIGHT);
    element.style.height = `${height}px`;
    setTextHeight(height);
  }, [draft]);
  const thick = Math.max(DESKTOP_BOX.thick, textHeight + 2 * BOX_PADDING);
  useLayoutEffect(() => {
    void desktop().panelHeight(thick);
  }, [thick, opened]);

  const resting = restingSize(edge);
  const size = grown ? { width: DESKTOP_BOX.long, height: thick } : resting;
  const at = dropAt(edge, anchor, size, room);
  const final = dropAt(edge, anchor, { width: DESKTOP_BOX.long, height: thick }, room);
  const name = box.chosen.name;
  const words = draft.trim();
  const others = box.mascots.length > 1;

  const sendOnce = useSendOnce();
  const send = () => {
    if (!words) return;
    const written = draft;
    sendOnce(async () => {
      if (await desktop().send(words, inCloud)) setDraft((now) => leftAfterSend(now, written));
    });
  };
  const next = (by: number) => {
    const at = box.mascots.findIndex(({ id }) => id === box.chosen.id);
    const mascot = box.mascots[(at + by + box.mascots.length) % box.mascots.length];
    if (mascot && mascot.id !== box.chosen.id) void desktop().choose(mascot.id);
  };

  // Over the box and under it, on the screen's side of it: chips nearest, then the keys.
  const across = sideEdge(edge);
  const chipsY = across || edge === "bottom" ? final.y - 8 - 28 : final.y + thick + 8;
  const keysY = across ? final.y + thick + 8 : edge === "bottom" ? chipsY - 8 - 24 : chipsY + 28 + 8;
  const line: React.CSSProperties =
    edge === "right"
      ? { right: 12, left: DESKTOP_SHADOW, justifyContent: "flex-end" }
      : edge === "left"
        ? { left: 12, right: DESKTOP_SHADOW }
        : { left: final.x, width: DESKTOP_BOX.long, justifyContent: "center" };
  const around = cn(
    "absolute flex gap-1.5",
    still ? "" : "transition-opacity duration-menu ease-crisp",
    grown && !closing ? "opacity-100" : "opacity-0 pointer-events-none",
  );
  const chips = picking
    ? box.mascots.map((mascot) => (
        <button
          key={mascot.id}
          type="button"
          aria-pressed={mascot.id === box.chosen.id}
          onClick={() => {
            void desktop().choose(mascot.id);
            setPicking(false);
            field.current?.focus();
          }}
          className={cn(CHIP, "pl-1.5", mascot.id === box.chosen.id && "ring-[1.5px] ring-tip-ink/80", FOCUS)}
        >
          <DropFace face={{ name: mascot.name, look: mascot.look, mood: "rest" }} size={18} showBerry={showBerry} still />
          <span className="truncate">{mascot.name}</span>
        </button>
      ))
    : box.recent.map((job) => (
        <button
          key={job.prompt}
          type="button"
          onClick={() => {
            setDraft(job.prompt);
            field.current?.focus();
          }}
          className={cn(CHIP, FOCUS)}
        >
          <span className="truncate">{job.label}</span>
        </button>
      ));

  return (
    <>
      <div className={around} style={{ top: chipsY, ...line }} aria-label={picking ? "Your mascots" : "Jobs sent before"} role="group">
        {chips}
      </div>
      <div className={cn(around, "pointer-events-none")} style={{ top: keysY, ...line }} aria-hidden>
        {[
          { keys: ["↵"], words: "Send" },
          ...(others ? [{ keys: ["Tab"], words: "Next mascot" }] : []),
          { keys: ["Esc"], words: "Close" },
        ].map((hint) => (
          <span
            key={hint.words}
            className="h-6 pl-1 pr-[9px] rounded-[8px] bg-tip/[.82] text-tip-ink text-12 font-medium inline-flex items-center gap-1.5"
          >
            <Keys keys={hint.keys} />
            {hint.words}
          </span>
        ))}
      </div>
      <DropShape edge={edge} x={at.x} y={at.y} width={size.width} height={size.height} still={still} data-desktop-box>
        <div
          className={cn(
            "dark absolute inset-y-0 left-0 flex items-center gap-2 pl-2 pr-[9px]",
            still ? "" : "transition-opacity ease-out",
            grown && !closing ? "opacity-100 duration-[120ms]" : "opacity-0 duration-[60ms]",
          )}
          style={{ width: DESKTOP_BOX.long }}
        >
          <Tooltip words="Choose a mascot">
            <button
              type="button"
              aria-label={`Choose a mascot: ${name}`}
              aria-expanded={picking}
              onClick={() => setPicking((was) => !was)}
              className={cn(
                "press h-9 pl-[5px] pr-1.5 rounded-full bg-tip-ink/10 hover:bg-tip-ink/[.16] flex items-center gap-1 shrink-0",
                FOCUS,
              )}
            >
              <DropFace face={{ name, look: box.chosen.look, mood: "rest" }} size={20} showBerry={showBerry} still />
              <ChevronDown
                className={cn("size-3 text-tip-ink/60 transition-transform duration-menu ease-crisp", picking && "rotate-180")}
                strokeWidth={1.75}
              />
            </button>
          </Tooltip>
          <textarea
            ref={field}
            rows={1}
            value={draft}
            aria-label={`Give ${name} a job`}
            placeholder={`Give ${name} a job`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (sendOnEnter(event, send)) return;
              if (event.key === "Tab" && others) {
                event.preventDefault();
                next(event.shiftKey ? -1 : 1);
              }
            }}
            className="flex-1 min-w-0 resize-none bg-transparent text-15 leading-[23px] text-tip-ink placeholder:text-tip-ink/50 caret-focus outline-none overflow-y-auto"
          />
          {box.cloud.fits && <WhereSwitch on={inCloud} mac={mac} onToggle={() => setCloudChoice(!inCloud)} />}
          <Tooltip words={words ? "Send" : null}>
            <button
              type="button"
              aria-label="Send"
              disabled={!words}
              onClick={send}
              className={cn(
                "press size-[34px] shrink-0 rounded-full grid place-items-center",
                words ? "bg-tip-ink text-tip" : "bg-tip-ink/[.14] text-tip-ink/55",
                FOCUS,
              )}
              style={{ transition: still ? undefined : `background-color 160ms ${EASE}, color 160ms ${EASE}` }}
            >
              <ArrowUp className="size-4" strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
      </DropShape>
    </>
  );
};
