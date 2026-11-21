// A capture copies the last frame the page handed over. The frame drawn after a change has been handed over by the time
// a third one starts, so that's when it answers, however long it takes. A hidden page draws nothing: one being shown for
// the capture waits until it is, and otherwise it answers at once, since only the capture would make it draw.
export const framesPassed = ({ shown }: { shown: boolean }): Promise<true> =>
  new Promise((resolve) => {
    const frame = (left: number): void => {
      requestAnimationFrame(() => (left > 1 ? frame(left - 1) : resolve(true)));
    };
    if (document.visibilityState !== "hidden") return frame(3);
    if (!shown) return resolve(true);
    const visible = (): void => {
      if (document.visibilityState === "hidden") return;
      removeEventListener("visibilitychange", visible);
      frame(3);
    };
    addEventListener("visibilitychange", visible);
  });
