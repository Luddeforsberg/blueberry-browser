const MAX_SMOOTH_SCROLL_MS = 700;
const SMOOTH_SCROLL_START_MS = 120;

// `smooth` is for someone watching, so the page slides rather than jumps. It answers when that's over, or straight away if
// the page didn't move.
export const scrollPage = async ({
  direction,
  smooth,
}: {
  direction: "up" | "down";
  smooth: boolean;
}): Promise<{ top: number; height: number }> => {
  const before = window.scrollY;
  window.scrollBy({ top: (direction === "up" ? -1 : 1) * window.innerHeight * 0.9, behavior: smooth ? "smooth" : "instant" });
  if (smooth) {
    await new Promise<Event | void>((resolve) => {
      addEventListener("scrollend", resolve, { once: true });
      setTimeout(resolve, MAX_SMOOTH_SCROLL_MS);
      setTimeout(() => window.scrollY === before && resolve(), SMOOTH_SCROLL_START_MS);
    });
  }
  return { top: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
};
