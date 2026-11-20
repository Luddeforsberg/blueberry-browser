import { useLayoutEffect, useRef } from "react";

const FOLLOW_DISTANCE = 120;

// Keeps the newest words in view while a reply streams, unless the reader has scrolled up to read.
// Sending a message always comes back down to it.
export const useFollowReply = (sentCount: number, partial: string | null | undefined, stepCount: number) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastSentCount = useRef(0);
  // Whether the reader was near the end before the last change, as their own scrolling left it. Measured after a
  // change, a tall card that just came in would look like the reader had scrolled away from it.
  const following = useRef(true);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (sentCount !== lastSentCount.current || following.current) {
      scroller.scrollTop = scroller.scrollHeight;
      following.current = true;
    }
    lastSentCount.current = sentCount;
  }, [sentCount, partial, stepCount]);

  // Goes on the scroller, with the ref.
  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (scroller) following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_DISTANCE;
  };

  return { ref: scrollerRef, onScroll };
};
