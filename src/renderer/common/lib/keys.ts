import type React from "react";

// Enter, read once for every renderer. An input method, as for Japanese or Chinese, uses Enter to choose its words, and
// that Enter belongs to the text being written, never to the field's own action.

type Key = React.KeyboardEvent | KeyboardEvent;

const composing = (event: Key): boolean => ("nativeEvent" in event ? event.nativeEvent : event).isComposing;

// Enter the user pressed to act.
export const isEnter = (event: Key): boolean => event.key === "Enter" && !composing(event);

// Enter in a prompt box sends, with ⌘ or Ctrl as `ask`, and Shift+Enter makes a new line. A key held down never sends,
// so it can't answer a question that arrives while it's held. Says whether it took the key.
export const sendOnEnter = (event: React.KeyboardEvent, send: (ask: boolean) => void): boolean => {
  if (!isEnter(event) || event.shiftKey) return false;
  event.preventDefault();
  if (!event.repeat) send(event.metaKey || event.ctrlKey);
  return true;
};
