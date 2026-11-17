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

const LETTERS = "abc";

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
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const field = isField(event.target);
      const letter = event.key.length === 1 ? LETTERS.indexOf(event.key.toLowerCase()) : -1;
      const pick = !field && letter >= 0 && letter < (keys.picks ?? 0) && keys.onPick ? letter : -1;
      if (!["Enter", "Escape", " "].includes(event.key) && pick < 0) return;
      if (event.key === " " && field) return;
      const inside = !!ref.current?.contains(event.target as Node);
      if (!keyCounts({ inside, repeat: event.repeat, at: performance.now(), armedAt: armedAt.current })) {
        stop(event);
        if (event.key === " ") stoppedSpace.current = true;
        return;
      }
      if (event.key === "Escape" && keys.onEscape) {
        stop(event);
        keys.onEscape();
      } else if (event.key === "Enter" && keys.onEnter && where(event.target) === "card") {
        stop(event);
        keys.onEnter();
      } else if (pick >= 0) {
        stop(event);
        keys.onPick?.(pick);
      }
    },
    onKeyUp: (event) => {
      if (event.key !== " " || !stoppedSpace.current) return;
      stoppedSpace.current = false;
      stop(event);
    },
  };
  return { region, on };
};
