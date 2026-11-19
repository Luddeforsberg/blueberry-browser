import { isSecret } from "../lib/names";
import { deepActive } from "../lib/dom";
import type { Core } from "./core";
import type { Actor } from "./stage";

const FRAME_TAGS = "iframe,frame";

// Whether the mascot is on the page and may be seen, which every move asks first.
export const makePresence = (a: Actor, { size }: Core) => {
  const { host, sky, mascot } = a.stage;

  // Never while the keyboard is in a password or code field: whoever's typing there, nothing is drawn over it.
  const inSecret = (): boolean => {
    const at = deepActive();
    // Focus in a frame from another origin could be on anything, and that frame can't be asked.
    if (at?.matches(FRAME_TAGS) && !at.contentDocument) return true;
    return !!at && at.tagName === "INPUT" && isSecret(at);
  };
  const cover = (on: boolean): void => {
    a.covered = on;
    sky.classList.toggle("covered", on);
  };
  const checkFocus = (): void => cover(inSecret());

  const attach = (): void => {
    if (!host.isConnected) document.documentElement.append(host);
    // A modal opened since would be above this, so it goes back on top.
    if (host.showPopover && (!host.matches(":popover-open") || document.querySelector(":modal"))) {
      try {
        if (host.matches(":popover-open")) host.hidePopover();
        host.showPopover();
      } catch {
        // Fixed to the page instead, under anything in the top layer.
      }
    }
  };
  const stopReading = (): void => {
    a.reading++;
  };
  const begin = (): boolean => {
    attach();
    checkFocus();
    stopReading();
    if (a.leaving !== null) {
      clearTimeout(a.leaving);
      a.leaving = null;
      mascot.getAnimations().forEach((run) => run.cancel());
      a.flight = null;
    }
    sky.style.setProperty("--size", size() + "px");
    return !a.covered;
  };
  const entering = (): boolean => a.spot === null;
  const offStage = (): { x: number; y: number } => ({ x: innerWidth + size(), y: Math.max(size(), innerHeight * 0.22) });

  return { checkFocus, attach, stopReading, begin, entering, offStage };
};

export type Presence = ReturnType<typeof makePresence>;
