import { describe, type Described } from "../lib/assess";
import { copyOf, isSelect } from "../lib/dom";
import { allElements, isPlain, looksClickable, SELECTOR, visible } from "../lib/list";
import { clip, isSecret, isTransparent, nameOf, optionLabels, roleOf } from "../lib/names";
import { state, withElement } from "../lib/state";

const MAX_ADDRESS_LENGTH = 500;
const MAX_OPTIONS = 50;
const MAX_PLAIN = 40;

interface Listed {
  ref: string;
  role: string;
  name: string;
  value?: string;
  address?: string;
  selected?: string[];
  options?: string[];
  optionCount?: number;
  transparent?: true;
  disabled?: true;
  inFrame?: true;
}

interface ListArgs {
  // Already in lower case, or empty for everything.
  query: string;
  limit: number;
  // Also pictures and text, which are left out otherwise unless the query names them.
  everything: boolean;
  // False in a frame `browserTools` runs this in by itself, which gets the frames inside it the same way.
  descend: boolean;
}

export const listElements = ({ query, limit, everything, descend }: ListArgs): { total: number; elements: Listed[] } => {
  const named = (el: Element): boolean => nameOf(el).toLowerCase().includes(query);
  const seen = allElements(document, descend).filter((el) => visible(el));
  const active = seen.filter((el) => (el.matches(SELECTOR) || looksClickable(el)) && named(el));
  const plain =
    everything || query
      ? seen.filter((el) => !active.includes(el) && !el.closest(SELECTOR) && isPlain(el) && named(el)).slice(0, MAX_PLAIN)
      : [];
  const found = [...active, ...plain];
  const elements = found.slice(0, limit).map((el): Listed => {
    let ref = state.refs.get(el);
    if (!ref) {
      ref = "e" + state.next++;
      state.refs.set(el, ref);
      state.byRef.set(ref, el);
    }
    const dropdown = isSelect(el);
    return {
      ref,
      role: roleOf(el),
      name: nameOf(el),
      ...("value" in el && !isSecret(el) && !dropdown && el.value ? { value: clip(el.value) } : {}),
      ...(el.tagName === "A" && typeof el.href === "string" && el.href ? { address: el.href.slice(0, MAX_ADDRESS_LENGTH) } : {}),
      ...(dropdown
        ? {
            selected: optionLabels(el.selectedOptions),
            options: optionLabels(el.options).slice(0, MAX_OPTIONS),
            optionCount: el.options.length,
          }
        : {}),
      ...(isTransparent(el) ? { transparent: true } : {}),
      ...(el.disabled ? { disabled: true } : {}),
      ...(el.ownerDocument !== document ? { inFrame: true } : {}),
    };
  });
  return { total: found.length, elements };
};

export const describeElement = ({ ref }: { ref: string }): Described | null => withElement(ref, describe);

interface ElementSpot {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
  name: string;
  secret: boolean;
}

// Where an element is, for drawing only. Its name is the label a person reads beside it, never what's in a field.
export const spotOf = ({ ref }: { ref: string }): ElementSpot | null =>
  withElement(ref, (el) => {
    const box = el.getBoundingClientRect();
    let left = box.left;
    let top = box.top;
    for (let win: Window | null = el.ownerDocument.defaultView; win !== window; win = win.parent) {
      const owner = win?.frameElement;
      if (!win || !owner) return null;
      const outer = owner.getBoundingClientRect();
      left += outer.left + owner.clientLeft;
      top += outer.top + owner.clientTop;
    }
    const secret = isSecret(el);
    // A label can wrap the box, and a box's own text may be what someone wrote, so it's left out of that.
    const labelWithoutBox = (): string => {
      const label = el.labels?.[0];
      const copy = label && copyOf(label);
      copy?.querySelectorAll("textarea,[contenteditable]").forEach((inner) => inner.remove());
      return copy?.textContent ?? "";
    };
    const holdsText = el.isContentEditable || el.tagName === "TEXTAREA";
    const name = secret ? "" : holdsText ? clip(el.getAttribute("aria-label") || labelWithoutBox() || el.placeholder || "") : nameOf(el);
    return {
      left,
      top,
      width: box.width,
      height: box.height,
      x: left + box.width / 2,
      y: top + box.height / 2,
      viewWidth: innerWidth,
      viewHeight: innerHeight,
      name,
      secret,
    };
  });
