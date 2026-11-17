import type React from "react";
import { useEffect, useRef, useState } from "react";

// DESIGN.md section 10, Keys. While the keyboard is on a card, Enter allows, Escape doesn't, and A, B and C pick a
// question's answers. A key held down never counts, and neither does one in the first half second after the card is
// there or takes the keyboard, so answering one card can't answer the next. Nothing here ever puts the keyboard on a
// card: only `focusOnShow` does, which only Needs you sets.
export const ARM_MS = 500;

export const keyCounts = ({ inside, repeat, at, armedAt }: { inside: boolean; repeat: boolean; at: number; armedAt: number }): boolean =>
  inside && !repeat && at - armedAt >= ARM_MS;

// Where in the card the keyboard is, which decides what Enter does and which keycaps are true.
export type KeysOn = "none" | "card" | "allow" | "field" | "other";

const LETTERS = "abc";

// What one key press on a card does: nothing of ours ("ignore"), nothing at all ("stop", which also keeps a focused
// button from being pressed), or an answer. A key that could press a button is judged before anything else about it,
// so a modifier never gets one past the guard.
export const keyAction = ({
  key,
  modified,
  field,
  onCard,
  picks,
  canEnter,
  canEscape,
  ...timing
}: {
  key: string;
  // Ctrl, Alt or the command key is down.
  modified: boolean;
  field: boolean;
  onCard: boolean;
  picks: number;
  canEnter: boolean;
  canEscape: boolean;
  inside: boolean;
  repeat: boolean;
  at: number;
  armedAt: number;
}): "ignore" | "stop" | "enter" | "escape" | number => {
  const letter = key.length === 1 ? LETTERS.indexOf(key.toLowerCase()) : -1;
  const pick = !modified && !field && letter >= 0 && letter < picks ? letter : -1;
  if (!["Enter", "Escape", " "].includes(key) && pick < 0) return "ignore";
  if (key === " " && field) return "ignore";
  if (!keyCounts(timing)) return "stop";
  if (modified) return "ignore";
  if (key === "Escape" && canEscape) return "escape";
  if (key === "Enter" && canEnter && onCard) return "enter";
  return pick >= 0 ? pick : "ignore";
};

export interface CardKeys {
  // Enter, with the keyboard on the card itself. On a button, Enter presses that button, as it always does.
  onEnter?: () => void;
  onEscape?: () => void;
  // A, B and C, for that many of a question's answers.
  onPick?: (index: number) => void;
  picks?: number;
  focusOnShow?: boolean;
}

// What the shell spreads on itself.
export interface CardRegion {
  ref: React.RefObject<HTMLElement | null>;
  tabIndex: number;
  onFocus: (event: React.FocusEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onKeyUp: (event: React.KeyboardEvent) => void;
}

const isField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);

export const useCardKeys = (keys: CardKeys): { region: CardRegion; on: KeysOn } => {
  const ref = useRef<HTMLElement>(null);
  const armedAt = useRef(0);
  // A Space stopped on its way down is stopped on its way up too, where a button would press.
  const stoppedSpace = useRef(false);
  const [on, setOn] = useState<KeysOn>("none");
  const { focusOnShow = false } = keys;

  useEffect(() => {
    armedAt.current = performance.now();
    if (focusOnShow) ref.current?.focus();
  }, [focusOnShow]);

  const where = (target: EventTarget | null): KeysOn => {
    if (target === ref.current) return "card";
    if (target instanceof HTMLElement && target.closest("[data-card-key=allow]")) return "allow";
    return isField(target) ? "field" : "other";
  };
  const stop = (event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const region: CardRegion = {
    ref,
    tabIndex: -1,
    onFocus: (event) => {
      if (!ref.current?.contains(event.relatedTarget as Node | null)) armedAt.current = performance.now();
      setOn(where(event.target));
    },
    onBlur: (event) => {
      if (!ref.current?.contains(event.relatedTarget as Node | null)) setOn("none");
    },
    onKeyDown: (event) => {
      const action = keyAction({
        key: event.key,
        modified: event.ctrlKey || event.metaKey || event.altKey,
        field: isField(event.target),
        onCard: where(event.target) === "card",
        picks: keys.onPick ? (keys.picks ?? 0) : 0,
        canEnter: !!keys.onEnter,
        canEscape: !!keys.onEscape,
        inside: !!ref.current?.contains(event.target as Node),
        repeat: event.repeat,
        at: performance.now(),
        armedAt: armedAt.current,
      });
      if (action === "ignore") return;
      stop(event);
      if (action === "stop") {
        if (event.key === " ") stoppedSpace.current = true;
      } else if (action === "escape") keys.onEscape?.();
      else if (action === "enter") keys.onEnter?.();
      else keys.onPick?.(action);
    },
    onKeyUp: (event) => {
      if (event.key !== " " || !stoppedSpace.current) return;
      stoppedSpace.current = false;
      stop(event);
    },
  };
  return { region, on };
};
