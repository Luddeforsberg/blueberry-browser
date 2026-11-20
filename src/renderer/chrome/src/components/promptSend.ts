import { useState } from "react";
import { OneAtATime } from "@shared/lateWork";

// Sending from a prompt box. Main may refuse a message, so what was written stays in the box until main has taken it,
// and then only what was typed after it stays, by `leftAfterSend` in @shared/draft.

// One send at a time: Enter again while one is on its way sends nothing, so it can't start a second job.
export const useSendOnce = (): ((send: () => Promise<void>) => void) => {
  const [sending] = useState(() => new OneAtATime());
  return (send) => {
    if (!sending.busy()) void sending.run(send);
  };
};
