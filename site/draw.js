// Building a page from our own parts, shared by the phone page and the front page. Everything from a server goes in as
// text: the one piece of markup is our own drawing of a mascot, from a set of poses the site build writes, chosen by
// keys checked against the poses in it.

/** @typedef {Node | string | null | undefined | false} Child */

/**
 * What's drawn of a list of children: nothing for null, undefined or false.
 * @template T
 * @param {T | null | undefined | false} child
 * @returns {child is T}
 */
export const isDrawn = (child) => child !== null && child !== undefined && child !== false;
/**
 * What `el` sets: the element's own properties, and `aria…` and `data…` in camel case, as attributes.
 * @template {keyof HTMLElementTagNameMap} K
 * @typedef {Partial<Omit<HTMLElementTagNameMap[K], "style" | `aria${string}` | `data${string}`>> &
 *   { [name: `aria${string}` | `data${string}`]: string | null | undefined }} Props
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props<K>} [props]
 * @param {...(Child | Child[])} children
 */
export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (!key.startsWith("aria") && !key.startsWith("data")) Object.assign(node, { [key]: value });
    else if (typeof value === "string")
      node.setAttribute(
        key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
        value,
      );
  }
  node.append(...children.flat().filter(isDrawn));
  return node;
};

/** @typedef {"rest" | "fetching" | "asking" | "delivered" | "oops"} Mood */
/** @typedef {{ name: string, look: { palette: string, accessory: string } }} Drawn */
/** Each accessory's drawing in each mood the page has, as poses.js and homePoses.js hold them. @typedef {Record<string, Partial<Record<Mood, string>>>} Poses */

/** @type {Record<Mood, string>} */
const MOOD_WORDS = { rest: "at rest", fetching: "working", asking: "waiting for you", delivered: "finished", oops: "something went wrong" };

let drawn = 0;
// What draws a mascot in one mood from `poses`, always the whole drawing, at one of the sizes the page's CSS has. Each
// gets gradient ids of its own, so one hidden drawing can't take the others' colour. `named` is false where its name is
// written beside it already.
/** @param {Poses} poses */
export const poseDrawer =
  (poses) =>
  /** @param {Drawn} mascot @param {Mood} mood @param {number} size @param {{ named?: boolean }} [options] */
  (mascot, mood, size, { named = true } = {}) => {
    const look = poses[mascot.look.accessory] ?? poses.none ?? {};
    const holder = el("span", { className: `mascot s${size}` });
    const own = `b${++drawn}`;
    holder.innerHTML = (look[mood] ?? look.rest ?? "").replace(/«[^»]*»/g, (id) => `${own}${id.length}`);
    const drawing = holder.querySelector("svg");
    if (!drawing) return holder;
    drawing.dataset.mascot = mascot.look.palette;
    if (named) drawing.setAttribute("aria-label", `${mascot.name}, ${MOOD_WORDS[mood]}`);
    else {
      drawing.removeAttribute("role");
      drawing.removeAttribute("aria-label");
      drawing.setAttribute("aria-hidden", "true");
    }
    return holder;
  };

// The pips (DESIGN.md section 6), from app/pips.css, which comes from the app's own. Always beside words that say the same.
/** @param {string} pattern */
export const pips = (pattern, className = "") =>
  el("span", { className: `pips ${className}`.trim(), dataPips: pattern, ariaHidden: "true" }, ...Array.from({ length: 9 }, () => el("i")));
