import { z } from "zod";
import {
  aimKey,
  aimKeyAt,
  beginTyping,
  endKeyWatch,
  finishTyping,
  hasFocus,
  keyLanded,
  scriptedEnter,
  spotOf,
  typeChunk,
  typeIntoElement,
  type FocusInfo,
} from "./pageScripts";
import { isHarmlessKey, isKnownKey, KEY_NAMES, landed, outcomeOf, pause, pressKey, type Outcome } from "./pageInput";
import { typingChunks, typingPauseMs, type Spot } from "./PageActor";
import type { PageTarget } from "./pageTarget";
import { pageTool, tabId } from "./pageTool";
import type { ToolContext } from "./toolContext";
import { because, MAX_SAFE_TYPED_LENGTH } from "./askFirst";
import { clipWords, STALE_ELEMENT, USER_IN_FIELD } from "./toolMessages";

// The tools that act on a page with the keyboard: pressing a key, and typing into a field.

export const typingTools = <T extends PageTarget>(context: ToolContext<T>) => {
  const { canSee, find, frameOf, onRef, site, withTab, actorOn, flyToRef, standOnRef, carryOn, leftOff, whereNow, element, describeOn } =
    context;

  // A real Enter where it can reach, which also submits a form the way a person's does. Only into the field the card
  // named: if the focus isn't on it, this goes to that field by script instead, and a real one the page sends somewhere
  // else on its way is stopped there. The script never follows a real Enter that may have arrived, which would submit
  // twice.
  const pressEnter = async (tab: T, ref: string): Promise<Outcome> => {
    if (!frameOf(tab, ref) && (await tab.runInPage<boolean | null>(aimKeyAt(ref)))) {
      try {
        await pressKey(tab, "Enter", false);
        const outcome = outcomeOf(await landed(() => tab.runInPage<boolean | "missed" | null>(keyLanded)));
        if (outcome !== "refused") return outcome;
      } finally {
        await tab.runInPage(endKeyWatch).catch(() => {});
      }
    }
    return (await onRef<string>(tab, ref, scriptedEnter)) === null ? "refused" : "confirmed";
  };

  // Fields the user has stepped in on in this reply, which it doesn't type in again.
  const usersFields = new Set<string>();
  // A click before the message was sent is how a user points at a field to have filled in, so only later ones count.
  const jobStarted = Date.now();

  // At a pace, one piece at a time, with the same result as all at once. Only where someone is watching, and never in a
  // secret field, where it's over as quickly as it can be. The user clicking or typing in the page ends it there, and
  // what's in the field is then theirs: nothing here goes back to fill it in.
  const typeInField = async (tab: T, ref: string, text: string, started: number): Promise<string | null> => {
    const field = `${tab.id}/${ref}`;
    const stepAside = () => {
      usersFields.add(field);
      return "user-in-field";
    };
    if (usersFields.has(field)) return "user-in-field";
    // Whether or not a mascot is drawn, a field the user is in the middle of isn't typed over.
    if (tab.actor?.touchedLately && tab.actor.touchedSince(jobStarted) && (await onRef<boolean>(tab, ref, hasFocus).catch(() => false)))
      return stepAside();
    const touched = () => !!tab.actor?.touchedSince(started);
    const actor = actorOn(tab);
    const whole = () => onRef<string>(tab, ref, (inner) => typeIntoElement(inner, text));
    if (!actor?.moving || frameOf(tab, ref) || !text) return whole();
    const spot = await tab.runInPage<Spot | null>(spotOf(ref)).catch(() => null);
    if (!spot || spot.secret) return whole();
    const begun = await tab.runInPage<string | null>(beginTyping(ref));
    if (begun !== "ready") return begun;
    actor.typing();
    for (const chunk of typingChunks(text)) {
      if (!carryOn(tab) || touched() || !actor.moving) break;
      if (!(await tab.runInPage<boolean | null>(typeChunk(ref, chunk)))) break;
      await pause(typingPauseMs(chunk));
    }
    actor.doneTyping();
    if (!carryOn(tab)) return "stopped";
    if (touched()) return stepAside();
    const finished = await tab.runInPage<string | null>(finishTyping(ref, text));
    if (finished !== "again") return finished;
    return touched() ? stepAside() : whole();
  };

  return {
    press_key: pageTool({
      name: "press_key",
      kind: "type",
      description: `Press a key on the keyboard, wherever the focus is. Click something first to put the focus there. One of ${KEY_NAMES.join(", ")}, or a single character. To type words, use type_text. The user is asked first when it could change something.`,
      schema: z.object({ tabId, key: z.string().min(1).max(10), shift: z.boolean().optional() }),
      label: ({ tabId: id }) => `Pressed a key on ${site(id)}`,
      describe: async ({ tabId: id, key, shift }) => {
        const tab = canSee() ? find(id) : null;
        const focus = tab && (await tab.runInPage<FocusInfo>(aimKey).catch(() => null));
        const where = focus?.foreignFrame
          ? "in a frame from another site"
          : focus?.role
            ? `with the focus on the ${focus.role} “${focus.name}”`
            : "with the focus on the page";
        return `Press ${shift ? "Shift+" : ""}${key} ${where}, on ${tab?.url ?? "no page"}`;
      },
      whyRisky: async ({ key }) => (isHarmlessKey(key) ? null : because("risky-key")),
      run: ({ tabId: id, key, shift = false }) =>
        withTab(id, async (tab) => {
          if (!isKnownKey(key)) return `That isn't a key this can press. It can press ${KEY_NAMES.join(", ")}, or a single character.`;
          const focus = await tab.runInPage<FocusInfo>(aimKey);
          if (focus.foreignFrame)
            return "The focus is in a frame from another site, where real keys can't reach, so nothing was pressed. Click something there instead.";
          // Which key isn't said: one at a time, a run of these could spell out anything.
          await actorOn(tab)?.hop("Pressing a key");
          if (!carryOn(tab)) return leftOff(tab);
          await pressKey(tab, key, shift);
          if (outcomeOf(await landed(() => tab.runInPage<boolean | null>(keyLanded))) === "unknown")
            return "Nothing showed that the page received that key, so it may or may not have done anything. Look at the page before pressing it again.";
          return whereNow(tab);
        }),
    }),
    type_text: pageTool({
      name: "type_text",
      kind: "type",
      description:
        "Replace what's in a field from list_elements with this text, and optionally press Enter. The user is asked first when it could change something.",
      schema: z.object({
        tabId,
        ref: z.string().max(20),
        text: z.string().max(5000),
        submit: z.boolean().optional().describe("Press Enter after typing."),
      }),
      label: ({ tabId: id }) => `Typed into a field on ${site(id)}`,
      whileAsking: standOnRef,
      describe: ({ tabId: id, ref, text, submit }) =>
        describeOn(id, ref, ({ role, name }) => `Type “${text}” into the ${role} “${name}”${submit ? " and submit it" : ""}`),
      whyRisky: async ({ tabId: id, ref, text }) => {
        const info = await element(id, ref);
        if (!info) return null;
        return info.typeRisk ?? (text.length > MAX_SAFE_TYPED_LENGTH ? because("long-text") : null);
      },
      run: ({ tabId: id, ref, text, submit = false }) =>
        withTab(id, async (tab) => {
          const started = Date.now();
          // What's typed is never in these words, only where it's going.
          if (!(await flyToRef(tab, ref, (name) => (name ? `Typing in ${clipWords(name)}` : "Typing"), "perch"))) return leftOff(tab);
          const result = await typeInField(tab, ref, text, started);
          if (result === "stopped") return leftOff(tab);
          if (result === "user-in-field") return USER_IN_FIELD;
          if (result === null) return STALE_ELEMENT;
          if (result === "dropdown") return "That's a dropdown, so nothing was typed. Use choose_option.";
          if (result === "not-kept") {
            return "The field holds something other than that text now, so it may not have taken it. Nothing was submitted. Look at it again before saying it worked.";
          }
          if (result !== "done") return "That element can't be typed into, so nothing happened.";
          if (submit) {
            await actorOn(tab)?.hop("Submitting");
            if (!carryOn(tab)) return leftOff(tab);
            if (tab.actor?.touchedSince(started)) {
              usersFields.add(`${tab.id}/${ref}`);
              return USER_IN_FIELD;
            }
            const entered = await pressEnter(tab, ref);
            if (entered === "unknown") {
              const where = (await whereNow(tab)).replace(/^Done\. /, "");
              return `It's typed in, and Enter went, but nothing showed that it arrived, so it may or may not have been submitted. Look at the page before trying again. ${where}`;
            }
            if (entered === "refused")
              return "It's typed in, but the field had gone before Enter could reach it, so nothing was submitted.";
          }
          return whereNow(tab);
        }),
    }),
  };
};
