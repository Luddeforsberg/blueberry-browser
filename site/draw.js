// Building a page from our own parts, shared by the phone page and the front page. Everything from a server goes in as
// text: the one piece of markup is our own drawing of a mascot, from a set of poses the site build writes, chosen by
// keys checked against the poses in it.

export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith("aria") || key.startsWith("data"))
      node.setAttribute(
        key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
        value,
      );
    else node[key] = value;
  }
  node.append(...children.flat().filter((child) => child !== null && child !== false && child !== undefined));
  return node;
};

const MOOD_WORDS = { rest: "at rest", fetching: "working", asking: "waiting for you", delivered: "finished", oops: "something went wrong" };

let drawn = 0;
// A mascot in one mood from `poses`, always the whole drawing, at one of the sizes the page's CSS has. Each gets gradient
// ids of its own, so one hidden drawing can't take the others' colour. `named` is false where its name is written beside
// it already.
export const drawPose = (poses, mascot, mood, size, { named = true } = {}) => {
  const look = poses[mascot.look.accessory] ?? poses.none;
  const holder = el("span", { className: `mascot s${size}` });
  const own = `b${++drawn}`;
  holder.innerHTML = (look[mood] ?? look.rest).replace(/«[^»]*»/g, (id) => `${own}${id.length}`);
  const drawing = holder.querySelector("svg");
  drawing.dataset.mascot = mascot.look.palette;
  if (named) drawing.setAttribute("aria-label", `${mascot.name}, ${MOOD_WORDS[mood] ?? "at rest"}`);
  else {
    drawing.removeAttribute("role");
    drawing.removeAttribute("aria-label");
    drawing.setAttribute("aria-hidden", "true");
  }
  return holder;
};

// The pips (DESIGN.md section 6), from app/pips.css, which comes from the app's own. Always beside words that say the same.
export const pips = (pattern, className = "") =>
  el("span", { className: `pips ${className}`.trim(), dataPips: pattern, ariaHidden: "true" }, ...Array.from({ length: 9 }, () => el("i")));
