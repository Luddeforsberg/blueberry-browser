import { useLayoutEffect, useRef } from "react";

const FOLLOW_DISTANCE = 120;

// Keeps the newest words in view while a reply streams, unless the reader has scrolled up to read.
// Sending a message always comes back down to it.
export const useFollowReply = (sentCount: number, partial: string | null | undefined, stepCount: number) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastSentCount = useRef(0);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const nearEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_DISTANCE;
    if (sentCount !== lastSentCount.current || nearEnd) scroller.scrollTop = scroller.scrollHeight;
    lastSentCount.current = sentCount;
  }, [sentCount, partial, stepCount]);

  return scrollerRef;
};
