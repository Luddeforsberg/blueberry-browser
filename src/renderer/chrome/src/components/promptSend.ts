import { useState } from "react";
import { OneAtATime } from "@shared/lateWork";

// Sending from a prompt box. Main may refuse a message, so what was written stays in the box until main has taken it,
// and the box stays open meanwhile, so whatever is written after it was sent must still be there once it's taken.

// What stays in the box once main has taken `sent`: what was typed on after it, or all of it if it was changed.
export const leftAfterSend = (now: string, sent: string): string => {
  if (now === sent) return "";
  return now.startsWith(sent) ? now.slice(sent.length).trimStart() : now;
};

// One send at a time: Enter again while one is on its way sends nothing, so it can't start a second job.
export const useSendOnce = (): ((send: () => Promise<void>) => void) => {
  const [sending] = useState(() => new OneAtATime());
  return (send) => {
    if (!sending.busy()) void sending.run(send);
  };
};
