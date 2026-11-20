import { z } from "zod";
import {
  aimClick,
  aimHover,
  chooseOption,
  describeOption,
  endWatch,
  isHovered,
  planDrag,
  pressLanded,
  scriptedClick,
  scriptedHover,
  selectedOptions,
  spotOf,
  watchPress,
  type Aim,
  type DragPlan,
} from "./pageScripts";
import { DRAG_MS, dragBetween, landed, moveTo, pause, pressAt, type Arrival, type Point } from "./pageInput";
import type { Spot } from "./PageActor";
import type { PageTarget } from "./pageTarget";
import { pageTool, tabId } from "./pageTool";
import type { ElementInfo, ToolContext } from "./toolContext";
import { NO_ACCESS, SCRIPTED, STALE_ELEMENT } from "./toolMessages";

// The tools that act on a page with the mouse: clicking, hovering, dragging and choosing in a dropdown.

// How long a page gets to finish moving after being scrolled, before anything is aimed at it.
const SCROLL_SETTLE_MS = 200;
const RETRIES_AFTER_MISS = 1;

// Once a real press has gone, a click that may or may not have happened is said in words. A scripted click after it
// would click a second time if the first did arrive.
const MAY_NOT_HAVE_ARRIVED =
  "The click went, but nothing showed that it arrived, so it may or may not have happened. Look at the page before trying again.";
const CUT_SHORT =
  "The press reached it, but the rest of the click went to something else and was stopped, so it may not have counted. Look at the page before trying again.";
const FIRST_ONLY =
  "Only the first of the two clicks is known to have reached it, so it may have counted as a single click. Look at the page before trying again.";
const UNCHECKED = "The page couldn't be checked, so nothing was clicked.";
const DISABLED = "That element is disabled, so nothing happened.";
const NOT_DRAGGED = "The press didn't land on that element, so nothing was dragged.";
const MAY_HAVE_DRAGGED =
  "The drag went, but nothing showed that its press arrived, so it may or may not have happened. Look at the page before trying again.";

// How one real press went, or why it wasn't sent: the job stopped, the page couldn't be checked, the element has gone
// or is disabled, or something else is at the point now.
type Press = Arrival | "stopped" | "unchecked" | "gone" | "disabled" | "moved";

// How the real presses of a click ended. `landed` counts those known to have reached the element, and "again" means
// nothing reached the page, so it can be aimed at again.
interface Pressing {
  end: "done" | "again" | Exclude<Press, "landed">;
  landed: number;
}

type ChooseResult =
  | { status: "not-a-dropdown" }
  | { status: "disabled" }
  | { status: "no-match"; options: string[] }
  | { status: "done"; chosen: string };

export const pointerTools = <T extends PageTarget>(context: ToolContext<T>) => {
  const {
    canSee,
    find,
    frameOf,
    onRef,
    site,
    withTab,
    actorOn,
    unnamed,
    flyToRef,
    standOnRef,
    carryOn,
    leftOff,
    whereNow,
    element,
    placeOf,
    describeOn,
    clickedLabel,
  } = context;

  // One real press, with the pointer already there, checked and watched by the `watchPress` script given. It goes only
  // if the point still reaches the element and the job carries on, and it's watched until what happened has been read.
  // Only the watch it set is ended, so it never ends another's, and nothing is ended where none was set.
  const watchedPress = async (tab: T, watching: string, send: () => Promise<void>): Promise<Press> => {
    const check = await tab.runInPage<Aim | null>(watching).catch(() => undefined);
    try {
      if (!carryOn(tab)) return "stopped";
      if (check === undefined) return "unchecked";
      if (check === null) return "gone";
      const { status, watch } = check;
      if (status !== "aimed" || !watch) return status === "disabled" ? "disabled" : "moved";
      await send();
      return await landed(() => tab.runInPage<boolean | "missed" | "cut" | "ended" | null>(pressLanded(watch)));
    } finally {
      if (check?.watch) await tab.runInPage(endWatch(check.watch)).catch(() => {});
    }
  };

  // What happened is read after each press before the next, so a double-click whose first press went astray, or
  // can't be known to have landed, goes no further.
  const pressOn = async (tab: T, ref: string, point: Point, clicks: 1 | 2): Promise<Pressing> => {
    const ended = (end: Pressing["end"], before: number): Pressing => ({
      end: !before && (end === "missed" || end === "moved") ? "again" : end,
      landed: before,
    });
    for (let count = 1; count <= clicks; count++) {
      const arrived = await watchedPress(tab, watchPress(ref, point), () => pressAt(tab, point, count));
      if (arrived !== "landed") return ended(arrived, count - 1);
    }
    return ended("done", clicks);
  };

  // A click that didn't happen, may have, or happened only in part.
  const notClicked = async (tab: T, { end, landed: reached }: Pressing) => {
    if (end === "stopped") return leftOff(tab);
    if (!reached && end === "gone") return STALE_ELEMENT;
    if (!reached && end === "disabled") return DISABLED;
    const note = reached ? FIRST_ONLY : end === "unchecked" ? UNCHECKED : end === "cut" ? CUT_SHORT : MAY_NOT_HAVE_ARRIVED;
    return `${note} ${(await whereNow(tab)).replace(/^Done\. /, "")}`;
  };

  // Real input where it can go, and a scripted click where it can't. Either way it's the element the card named:
  // something covering it gets the scripted click sent straight to the element, not the real one.
  const clickRef = async (tab: T, ref: string, clicks: 1 | 2) => {
    const doing = clicks === 2 ? "Double-clicking" : "Clicking";
    const scripted = () => onRef<string>(tab, ref, (inner) => scriptedClick(inner, clicks));
    const finish = (result: string | null, note = "") => {
      if (result === null) return STALE_ELEMENT;
      if (result === "disabled") return DISABLED;
      return whereNow(tab).then((where) => (note ? `${where} ${note}` : where));
    };
    if (frameOf(tab, ref)) {
      if (!(await flyToRef(tab, ref, (name) => `${doing} in ${name}`, "look"))) return leftOff(tab);
      return finish(await scripted(), SCRIPTED);
    }
    const aimAgain = async () => {
      await pause(SCROLL_SETTLE_MS);
      return tab.runInPage<Aim | null>(aimClick(ref, false));
    };
    let aim = await tab.runInPage<Aim | null>(aimClick(ref, true));
    if (aim?.status === "scrolled") aim = await aimAgain();
    if (aim === null) return STALE_ELEMENT;
    if (aim.status === "disabled") return finish("disabled");
    if (actorOn(tab)) {
      if (!(await flyToRef(tab, ref, (name) => `${doing} ${unnamed(name, "something")}`, "land"))) return leftOff(tab);
      // Where it is now, as the page may have moved while the mascot flew.
      if (aim.status === "aimed") aim = await tab.runInPage<Aim | null>(aimClick(ref, false));
      if (aim === null) return STALE_ELEMENT;
    }
    for (let tries = 0; aim?.status === "aimed" && tries <= RETRIES_AFTER_MISS; tries++) {
      await actorOn(tab)?.peck(aim.x!, aim.y!, clicks);
      if (!carryOn(tab)) return leftOff(tab);
      const point = { x: aim.x!, y: aim.y! };
      await moveTo(tab, point);
      const pressed = await pressOn(tab, ref, point, clicks);
      if (pressed.end === "done") return finish("done");
      if (pressed.end !== "again") return notClicked(tab, pressed);
      await pause(SCROLL_SETTLE_MS);
      aim = await tab.runInPage<Aim | null>(aimClick(ref, false));
    }
    if (aim === null) return STALE_ELEMENT;
    if (!carryOn(tab)) return leftOff(tab);
    const covered = aim.status === "covered" ? ` Something else was on top of it (“${aim.by}”), which may still be in the way.` : "";
    return finish(await scripted(), `${SCRIPTED}${covered}`);
  };

  return {
    click: pageTool({
      name: "click",
      kind: "click",
      description: "Click an element from list_elements with the real mouse. The user is asked first when it could change something.",
      schema: z.object({ tabId, ref: z.string().max(20) }),
      label: ({ tabId: id }) => `Clicked something on ${site(id)}`,
      allowedLabel: ({ tabId: id, ref }) => clickedLabel("Clicked", id, ref),
      describe: ({ tabId: id, ref }) => describeOn(id, ref, ({ role, name }) => `Click the ${role} “${name}”`),
      whileAsking: standOnRef,
      whyRisky: async ({ tabId: id, ref }) => (await element(id, ref))?.clickRisk ?? null,
      run: ({ tabId: id, ref }) => withTab(id, (tab) => clickRef(tab, ref, 1)),
    }),
    double_click: pageTool({
      name: "double_click",
      kind: "click",
      description:
        "Double-click an element from list_elements with the real mouse, such as a label a page edits that way. The user is asked first when it could change something.",
      schema: z.object({ tabId, ref: z.string().max(20) }),
      label: ({ tabId: id }) => `Double-clicked something on ${site(id)}`,
      allowedLabel: ({ tabId: id, ref }) => clickedLabel("Double-clicked", id, ref),
      describe: ({ tabId: id, ref }) => describeOn(id, ref, ({ role, name }) => `Double-click the ${role} “${name}”`),
      whileAsking: standOnRef,
      whyRisky: async ({ tabId: id, ref }) => (await element(id, ref))?.clickRisk ?? null,
      run: ({ tabId: id, ref }) => withTab(id, (tab) => clickRef(tab, ref, 2)),
    }),
    hover: pageTool({
      name: "hover",
      kind: "click",
      description:
        "Move the mouse over an element from list_elements and leave it there, to reveal what the page only shows on hover. Call list_elements or screenshot afterwards to see what appeared.",
      schema: z.object({ tabId, ref: z.string().max(20) }),
      label: ({ tabId: id }) => `Moved the pointer on ${site(id)}`,
      run: ({ tabId: id, ref }) =>
        withTab(id, async (tab) => {
          if (!frameOf(tab, ref)) {
            let aim = await tab.runInPage<Aim | null>(aimHover(ref, true));
            if (aim?.status === "scrolled") {
              await pause(SCROLL_SETTLE_MS);
              aim = await tab.runInPage<Aim | null>(aimHover(ref, false));
            }
            if (aim === null) return STALE_ELEMENT;
            if (aim.status === "aimed") {
              if (actorOn(tab)) {
                if (!(await flyToRef(tab, ref, (name) => `Pointing at ${unnamed(name, "something")}`, "look"))) return leftOff(tab);
                aim = await tab.runInPage<Aim | null>(aimHover(ref, false));
                if (aim === null) return STALE_ELEMENT;
              }
              if (aim.status === "aimed") await moveTo(tab, { x: aim.x!, y: aim.y! });
              const over = await tab.runInPage<boolean | null>(isHovered(ref));
              if (over) return "The pointer is over it now. Look again to see what appeared.";
            }
          }
          if (frameOf(tab, ref) && !(await flyToRef(tab, ref, (name) => `Pointing at ${name}`, "look"))) return leftOff(tab);
          const result = await onRef<string>(tab, ref, scriptedHover);
          if (result === null) return STALE_ELEMENT;
          return "A scripted hover went to it, because the real pointer couldn't get there. A page that reveals things by CSS won't respond, so look again before saying anything appeared.";
        }),
    }),
    drag: pageTool({
      name: "drag",
      kind: "click",
      description:
        "Drag an element from list_elements onto another. The user is asked first. Nothing confirms that the page accepted it, so look at the page afterwards before saying it worked.",
      schema: z.object({ tabId, ref: z.string().max(20), toRef: z.string().max(20) }),
      label: ({ tabId: id }) => `Dragged something on ${site(id)}`,
      // No `whyRisky`, so it always asks in the default mode: dropping something can mean anything on a page.
      whileAsking: standOnRef,
      describe: async ({ tabId: id, ref, toRef }) => {
        const [from, to] = await Promise.all([element(id, ref), element(id, toRef)]);
        const tab = find(id);
        if (!from || !to || !tab) return `Drag element ${ref} onto ${toRef}, which are no longer on the page`;
        return `Drag the ${from.role} “${from.name}” onto the ${to.role} “${to.name}”${placeOf(from)} ${tab.url}`;
      },
      run: ({ tabId: id, ref, toRef }) =>
        withTab(id, async (tab) => {
          const frame = frameOf(tab, ref);
          if (frame !== frameOf(tab, toRef)) return "Those two aren't in the same frame, so nothing was dragged.";
          const inner = frame ? toRef.slice(toRef.indexOf(".") + 1) : toRef;
          const dragging = (name: string | undefined) => `Dragging ${unnamed(name, "something")}`;
          let words = "Dragging something";
          // Asked before it moves anything, because a page's own drag-and-drop is played as events in one go.
          if (!(await flyToRef(tab, ref, (name) => (words = dragging(name)), "land"))) return leftOff(tab);
          const end = actorOn(tab) && !frame ? await tab.runInPage<Spot | null>(spotOf(toRef)).catch(() => null) : null;
          let plan = await onRef<DragPlan>(tab, ref, (from) => planDrag(from, inner));
          // It may have just scrolled them into view, so where they are now is what counts.
          if (plan?.status === "aimed") {
            await pause(SCROLL_SETTLE_MS);
            plan = await onRef<DragPlan>(tab, ref, (from) => planDrag(from, inner));
          }
          if (plan === null) return STALE_ELEMENT;
          if (plan.status === "disabled") return "That element is disabled, so nothing happened.";
          if (plan.status === "covered") return "Something else is on top of one of those, so nothing was dragged. Clear it first.";
          if (plan.status === "out-of-view")
            return "Those two don't fit on screen together, or one is in a frame real input can't reach, so nothing was dragged.";
          const check = "Nothing confirms that the page accepted it, so look at the page before saying it worked.";
          if (plan.status === "aimed") {
            // A frame's page writes its own answers, so it never gets to choose where the real mouse goes.
            if (frame) return "That needs a real mouse, which can't reach a frame from another site, so nothing was dragged.";
            const { from, to } = { from: plan.from!, to: plan.to! };
            await moveTo(tab, from);
            const pressed = await watchedPress(tab, watchPress(ref, from, true), async () => {
              if (end) actorOn(tab)?.carry(to, words, DRAG_MS);
              await dragBetween(tab, from, to);
            });
            if (pressed === "stopped") return leftOff(tab);
            if (pressed === "gone") return STALE_ELEMENT;
            if (pressed === "lost") return MAY_HAVE_DRAGGED;
            if (pressed !== "landed") return NOT_DRAGGED;
          }
          if (plan.status === "native" && end) actorOn(tab)?.carry({ x: end.x, y: end.y }, words);
          return `${await whereNow(tab)} ${check}`;
        }),
    }),
    choose_option: pageTool({
      name: "choose_option",
      kind: "click",
      description:
        "Choose an option in a dropdown (role dropdown) from list_elements, by the text it shows. Says what the dropdown shows afterwards. The user is asked first.",
      schema: z.object({ tabId, ref: z.string().max(20), option: z.string().max(500) }),
      label: ({ tabId: id }) => `Chose an option on ${site(id)}`,
      // No `whyRisky`, so it always asks in the default mode: changing a dropdown can run anything the page likes.
      whileAsking: standOnRef,
      describe: async ({ tabId: id, ref, option }) => {
        const tab = canSee() ? find(id) : null;
        const info =
          tab &&
          (await onRef<ElementInfo & { option: string | null; optionValue: string | null }>(tab, ref, (inner) =>
            describeOption(inner, option),
          ).catch(() => null));
        if (!tab || !info) return `Act on element ${ref}, which is no longer on the page`;
        const frame = frameOf(tab, ref);
        if (frame && frame !== "gone") {
          info.target = null;
          info.frameUrl = null;
          info.frameOrigin = frame.origin;
        }
        // The value is what a form sends, so the page changing it while the user decides must change this too.
        const sends = info.optionValue !== null && info.optionValue !== info.option ? ` (sent as “${info.optionValue}”)` : "";
        const choice = info.option !== null ? `“${info.option}”${sends}` : `“${option}”, which it doesn't offer,`;
        return `Choose ${choice} in the ${info.role} “${info.name}”${placeOf(info)} ${tab.url}${info.target ? `, in a form that goes to ${info.target}` : ""}`;
      },
      run: ({ tabId: id, ref, option }) =>
        withTab(id, async (tab) => {
          if (!(await flyToRef(tab, ref, (name) => `Choosing in ${unnamed(name, "a dropdown")}`, "land"))) return leftOff(tab);
          const result = await onRef<ChooseResult>(tab, ref, (inner) => chooseOption(inner, option));
          if (result === null) return STALE_ELEMENT;
          if (result.status === "not-a-dropdown") return "That element isn't a dropdown, so nothing happened.";
          if (result.status === "disabled") return "That dropdown or option is disabled, so nothing happened.";
          if (result.status === "no-match") {
            return `Nothing was chosen, because no single option matches that. It offers: ${JSON.stringify(result.options)}`;
          }
          const where = await whereNow(tab);
          // Asked again after the page has reacted, and gone if that took it to a new address.
          const shown = await onRef<string[]>(tab, ref, selectedOptions).catch(() => null);
          if (!canSee()) return NO_ACCESS;
          if (!shown) return where;
          if (!shown.includes(result.chosen)) {
            return `That didn't hold: the dropdown shows ${JSON.stringify(shown)}. ${where.replace(/^Done\. /, "")}`;
          }
          return `The dropdown now shows ${JSON.stringify(shown)}. ${where}`;
        }),
    }),
  };
};
