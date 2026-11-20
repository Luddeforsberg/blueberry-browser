import type { Point } from "../lib/dom";
import { makeCore } from "./core";
import { makeLine } from "./line";
import { makeMotion } from "./motion";
import { makeMoves, type GoArgs, type Kit } from "./moves";
import { makePresence } from "./presence";
import { frameSpot, makeRead, type FrameSpot } from "./reading";
import { POINTER_ART, SHEET } from "./sheet";
import { buildStage, type Actor, type ActorLook, type ArtNode } from "./stage";

interface ActorState {
  pose: string | null;
  spot: Point | null;
  facing: number;
  covered: boolean;
  words: string | undefined;
  line: { left: number; top: number; right: number; bottom: number };
  attached: boolean;
  hidden: boolean;
  flying: boolean;
}

// What main can ask of the mascot by name, through `actorCommand` and `ifThere`. Everything that draws answers false if
// nothing was drawn, so main doesn't wait for a mascot nobody can see.
export interface ActorApi {
  key: string;
  state(): ActorState;
  go(args: GoArgs): boolean;
  peck(args: { x: number; y: number; clicks: number }): boolean;
  carry(args: { x: number; y: number; ms: number; words?: string }): boolean;
  pose(args: { name: string; words?: string }): boolean;
  hop(args: { words?: string; name?: string }): boolean;
  typing(): boolean;
  read(args: { words?: string }): boolean;
  hide(): Promise<boolean>;
  show(): boolean;
  frameSpot(args: { origin: string }): FrameSpot | null;
  leave(args: { ms: number }): boolean;
  remove(): void;
}

declare global {
  var __berryActor: ActorApi | undefined;
}

const XHTML = "http://www.w3.org/1999/xhtml";

interface InstallArgs {
  key: string;
  look: ActorLook;
  // Where the feet were on the last page, so the mascot carries on from there after a navigation.
  start: Point | null;
  // Each pose of this mascot's drawing, and the stylesheet that colours it, made from the app's own by `pnpm run site:build`.
  art: Record<string, ArtNode>;
  artSheet: string;
}

export const installActor = ({ key, look, start, art, artSheet }: InstallArgs): boolean => {
  globalThis.__berryActor?.remove();
  // An image, a PDF or an SVG document has nowhere to put this.
  if (document.documentElement?.namespaceURI !== XHTML) return false;

  const a: Actor = {
    look,
    stage: buildStage(look, { poses: art, pointer: POINTER_ART }, SHEET + artSheet),
    pose: null,
    spot: start,
    facing: 1,
    anchor: null,
    flight: null,
    reading: 0,
    nod: null,
    leaving: null,
    covered: false,
    landingPose: null,
    target: null,
    lineAt: null,
  };
  const { host, sky, mascot, line } = a.stage;
  const core = makeCore(a);
  const lines = makeLine(a, core);
  const motion = makeMotion(a, core, lines);
  const presence = makePresence(a, core);
  const kit: Kit = { ...core, ...lines, ...motion, ...presence };
  const { size, setPose, setFacing, place } = core;
  const { queueFollow, flyTo, fade } = motion;
  const { checkFocus, attach, stopReading } = presence;

  addEventListener("scroll", queueFollow, { capture: true, passive: true });
  addEventListener("resize", queueFollow, { passive: true });
  addEventListener("focusin", checkFocus, true);
  addEventListener("focusout", checkFocus, true);

  const remove = (): void => {
    removeEventListener("scroll", queueFollow, { capture: true });
    removeEventListener("resize", queueFollow);
    removeEventListener("focusin", checkFocus, true);
    removeEventListener("focusout", checkFocus, true);
    if (a.leaving !== null) clearTimeout(a.leaving);
    host.remove();
    if (globalThis.__berryActor === api) Reflect.deleteProperty(globalThis, "__berryActor");
  };

  const api: ActorApi = {
    key,

    state: () => {
      const { left, top, right, bottom } = line.getBoundingClientRect();
      return {
        pose: a.pose,
        spot: a.spot,
        facing: a.facing,
        covered: a.covered,
        words: line.classList.contains("shown") ? line.dataset.words : "",
        line: { left, top, right, bottom },
        attached: host.isConnected,
        hidden: sky.style.visibility === "hidden",
        flying: !!a.flight,
      };
    },

    ...makeMoves(a, kit),
    read: makeRead(a, kit),

    // Out of sight for a capture, with two frames so it's gone from what the capture sees. A busy or covered page may
    // give no frame, and a capture can't wait on that.
    hide: () => {
      sky.style.visibility = "hidden";
      return Promise.race([
        new Promise<boolean>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 120)),
      ]);
    },
    show: () => {
      sky.style.visibility = "";
      return true;
    },

    frameSpot,

    // Flies off the top of the page and fades, then everything goes.
    leave: ({ ms }) => {
      stopReading();
      a.anchor = null;
      lines.say("");
      if (core.quietMotion() || !a.spot) {
        remove();
        return true;
      }
      setPose("flying");
      setFacing(1);
      const to = { x: Math.min(a.spot.x + size() * 3, innerWidth + size()), y: -size() * 1.5 };
      flyTo(to, ms, 0);
      mascot.animate([{ opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: ms, easing: "ease-in" });
      a.leaving = setTimeout(remove, ms);
      return true;
    },

    remove,
  };

  globalThis.__berryActor = api;
  if (start) {
    place(start);
    sky.style.setProperty("--size", size() + "px");
    fade();
  }
  attach();
  return true;
};
