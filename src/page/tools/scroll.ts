const MAX_SMOOTH_SCROLL_MS = 700;

// `smooth` is for someone watching, so the page slides rather than jumps. It answers when that's over, or straight away if
// the page can't go that way. A busy page can start the slide late, so not having moved yet doesn't mean it won't.
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
  window.scrollBy({ top: (direction === "up" ? -1 : 1) * window.innerHeight * 0.9, behavior: smooth ? "smooth" : "instant" });
  if (smooth && room > 1) {
    await new Promise<Event | void>((resolve) => {
      addEventListener("scrollend", resolve, { once: true });
      setTimeout(resolve, MAX_SMOOTH_SCROLL_MS);
    });
  }
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
};
