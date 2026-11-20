const MAX_SMOOTH_SCROLL_MS = 700;

// `smooth` is for someone watching, so the page slides rather than jumps. It answers when that's over, or straight away if
// the page can't go that way. A busy page can start the slide late, so not having moved yet doesn't mean it won't. The
// end of a slide before this one, which answered at the limit, can arrive after this one starts, so only an end where this
// one was going counts.
export const scrollPage = async ({
  direction,
  smooth,
}: {
  direction: "up" | "down";
  smooth: boolean;
}): Promise<{ top: number; height: number }> => {
  const before = window.scrollY;
  // The visual viewport's height leaves out a horizontal scrollbar, which innerHeight counts.
  const room = direction === "up" ? before : document.documentElement.scrollHeight - (visualViewport?.height ?? innerHeight) - before;
  const by = Math.min(room, window.innerHeight * 0.9);
  const to = direction === "up" ? before - by : before + by;
  window.scrollBy({ top: (direction === "up" ? -1 : 1) * window.innerHeight * 0.9, behavior: smooth ? "smooth" : "instant" });
  if (smooth && room > 1) {
    await new Promise<void>((resolve) => {
      const ended = () => {
        if (Math.abs(window.scrollY - to) > 1) return;
        removeEventListener("scrollend", ended);
        resolve();
      };
      addEventListener("scrollend", ended);
      setTimeout(() => {
        removeEventListener("scrollend", ended);
        resolve();
      }, MAX_SMOOTH_SCROLL_MS);
    });
  }
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
};
