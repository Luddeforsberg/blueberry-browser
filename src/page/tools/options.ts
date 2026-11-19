import { describe, type Described } from "../lib/assess";
import { isSelect } from "../lib/dom";
import { clip, optionLabels } from "../lib/names";
import { withElement } from "../lib/state";

const MAX_OPTIONS = 50;

// By its text first, because that's what the user sees and what the card says, then by its value. More than one
// match isn't a match.
const findOption = (el: HTMLSelectElement, wanted: string): HTMLOptionElement | null => {
  const text = clip(wanted);
  const options = [...el.options];
  const tiers = [
    options.filter((option) => clip(option.text) === text),
    options.filter((option) => clip(option.text).toLowerCase() === text.toLowerCase()),
    options.filter((option) => option.value === wanted),
  ];
  const matches = tiers.find((tier) => tier.length > 0) ?? [];
  return matches.length === 1 ? matches[0] : null;
};

export const describeOption = ({
  ref,
  option,
}: {
  ref: string;
  option: string;
}): (Described & { option: string | null; optionValue: string | null }) | null =>
  withElement(ref, (el) => {
    const found = isSelect(el) ? findOption(el, option) : null;
    return { ...describe(el), option: found && clip(found.text), optionValue: found?.value ?? null };
  });

type Chosen = { status: "not-a-dropdown" | "disabled" } | { status: "no-match"; options: string[] } | { status: "done"; chosen: string };

export const chooseOption = ({ ref, option }: { ref: string; option: string }): Chosen | null =>
  withElement(ref, (el): Chosen => {
    if (!isSelect(el)) return { status: "not-a-dropdown" };
    if (el.matches(":disabled")) return { status: "disabled" };
    const found = findOption(el, option);
    if (!found) return { status: "no-match", options: optionLabels(el.options).slice(0, MAX_OPTIONS) };
    if (found.matches(":disabled")) return { status: "disabled" };
    el.scrollIntoView({ block: "center" });
    el.focus();
    found.selected = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { status: "done", chosen: clip(found.text) };
  });

export const selectedOptions = ({ ref }: { ref: string }): string[] | null =>
  withElement(ref, (el) => (isSelect(el) ? optionLabels(el.selectedOptions) : null));
