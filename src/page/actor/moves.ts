import { elementOf } from "../lib/state";
import type { Core } from "./core";
import type { Line } from "./line";
import type { Motion } from "./motion";
import type { Presence } from "./presence";
import { poseOf, type Actor } from "./stage";

export type Kit = Core & Line & Motion & Presence;

export interface GoArgs {
  x: number;
  y: number;
  ms: number;
  arc: number;
  turn: number;
  ref?: string;
  words?: string;
  then: string;
}

// What the mascot does at a job's steps. Each answers false if nothing was drawn, so main doesn't wait for a mascot nobody
// can see.
export const makeMoves = (a: Actor, kit: Kit) => {
  const { body } = a.stage;
  const { quietMotion, size, setPose, setFacing, place, now, placeLine, keepLine, setWords, say } = kit;
  const { landed, flyTo, fade, anchorTo, ripple, begin, entering, offStage } = kit;

  // Goes to a spot and lands there. ms is how long main will wait.
  const go = ({ x, y, ms, arc, turn, ref, words, then }: GoArgs): boolean => {
    if (!begin()) return false;
    a.anchor = null;
    const to = { x, y };
    a.target = ref ? elementOf(ref) : null;
    setWords(words);
    if (quietMotion()) {
      setPose(then);
      place(to);
      setFacing(turn);
      anchorTo(ref);
      placeLine();
      fade();
      return true;
    }
    if (entering()) place(offStage());
    setPose("flying");
    setFacing(x >= (a.spot?.x ?? x) ? 1 : -1);
    flyTo(to, ms, arc, () => {
      setPose(a.landingPose ?? then);
      a.landingPose = null;
      setFacing(turn);
      anchorTo(ref);
      keepLine();
      landed();
    });
    a.landingPose = then;
    placeLine();
    return true;
  };

  // A jab of the beak at the point, and the ripple as it arrives.
  const peck = ({ x, y, clicks }: { x: number; y: number; clicks: number }): boolean => {
    if (!begin()) return false;
    if (quietMotion() || a.look.plain) {
      ripple({ x, y });
      return true;
    }
    setPose("rest");
    const reach = size() / 120;
    const at = a.spot ?? now();
    // Where the beak's tip ends up with the head down and the body leaning, from the feet, in the drawing's units.
    const tip = { x: at.x + a.facing * 44 * reach, y: at.y - 24 * reach };
    const most = size() * 0.7;
    const lunge = { x: Math.max(-most, Math.min((x - tip.x) * a.facing, most)), y: Math.max(-most, Math.min(y - tip.y, most)) };
    const timing = { duration: 210, iterations: clicks, easing: "cubic-bezier(.3,.6,.4,1)" };
    body.animate(
      [
        { transform: "none" },
        { transform: "translate(" + lunge.x + "px, " + lunge.y + "px) rotate(20deg)", offset: 0.42 },
        { transform: "none" },
      ],
      timing,
    );
    poseOf(a.stage, String(a.pose))
      .querySelector("[data-part=head]")
      ?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(46deg)", offset: 0.42 }, { transform: "rotate(0deg)" }], timing);
    setTimeout(() => ripple({ x, y }), 80);
    if (clicks === 2) setTimeout(() => ripple({ x, y }), 290);
    return true;
  };

  // Across to where a dragged thing goes.
  const carry = ({ x, y, ms, words }: { x: number; y: number; ms: number; words?: string }): boolean => {
    if (!begin()) return false;
    a.target = null;
    say(words);
    a.anchor = null;
    if (quietMotion()) {
      place({ x, y });
      placeLine();
      fade();
      return true;
    }
    setPose("flying");
    flyTo({ x, y }, ms, 0, () => {
      setPose("rest");
      landed();
    });
    placeLine();
    return true;
  };

  // In place: a mood and what it's doing.
  const pose = ({ name, words }: { name: string; words?: string }): boolean => {
    if (!begin()) return false;
    if (entering()) {
      place({ x: Math.max(4, innerWidth - size() * 1.4), y: size() * 1.5 });
      fade();
    }
    // In the air, it stays where it is while the page moves under it.
    if (name === "flying") a.anchor = null;
    // On its way somewhere, this is how it lands.
    if (a.flight && a.landingPose) a.landingPose = name;
    else setPose(name);
    if (words !== undefined) say(words);
    return true;
  };

  // A little hop on the spot, for a key pressed or a page looked over.
  const hop = ({ words, name }: { words?: string; name?: string }): boolean => {
    if (!begin()) return false;
    if (entering()) place({ x: Math.max(4, innerWidth - size() * 1.4), y: size() * 1.5 });
    // The first thing it does may be this, and it has to be standing as something to be seen.
    if (name || !a.pose) setPose(name ?? "rest");
    say(words);
    if (quietMotion()) {
      fade();
      return true;
    }
    body.animate(
      [
        { transform: "none" },
        { transform: "scale(1.06, 0.92)", offset: 0.2 },
        { transform: "translateY(" + -0.22 * size() + "px) scale(0.97, 1.04)", offset: 0.55 },
        { transform: "scale(1.04, 0.96)", offset: 0.85 },
        { transform: "none" },
      ],
      { duration: 300, easing: "ease-out" },
    );
    return true;
  };

  // Head bobbing along while the letters appear.
  const typing = (): boolean => {
    if (!begin() || quietMotion() || a.look.plain) return !a.covered;
    setPose("sitting");
    a.nod =
      poseOf(a.stage, String(a.pose))
        .querySelector("[data-part=head]")
        ?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(9deg)", offset: 0.5 }, { transform: "rotate(0deg)" }], {
          duration: 240,
          iterations: Infinity,
          easing: "ease-in-out",
        }) ?? null;
    return true;
  };

  return { go, peck, carry, pose, hop, typing };
};
