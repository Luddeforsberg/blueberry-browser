import { POSES } from "./poses.js";
import { STEP_PIPS } from "./pips.js";

// Building the page. Everything from the server goes in as text: the one piece of markup is our own drawing of a
// mascot, from poses.js, chosen by keys checked against the poses we have.

const SVG = "http://www.w3.org/2000/svg";

export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith("aria") || key.startsWith("data")) node.setAttribute(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value);
    else node[key] = value;
  }
  node.append(...children.flat().filter((child) => child !== null && child !== false && child !== undefined));
  return node;
};

const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

// Lucide's shapes, drawn here so the page loads nothing from elsewhere.
const ICONS = {
  back: ["m15 18-6-6 6-6"],
  down: ["m6 9 6 6 6-6"],
  next: ["m9 18 6-6-6-6"],
  up: ["M12 19V5", "M5 12l7-7 7 7"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  cloud: ["M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"],
  lock: ["M8 11V7a4 4 0 0 1 8 0v4", "M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"],
  unlocked: ["M8 11V7a4 4 0 0 1 7.7-1.5", "M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"],
  tick: ["M20 6 9 17l-5-5"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.9 1.9 0 0 0 3.4 0"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  eyeOff: ["M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2", "M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6", "M2 2l20 20", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  again: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  grow: ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"],
  shrink: ["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"],
  copy: ["M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z", "M5 15V5a2 2 0 0 1 2-2h10"],
  computer: ["M6 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M2 20h20"],
  mascots: ["M8 21a5 5 0 0 1-5-5c0-3 2-6 5-6s5 3 5 6a5 5 0 0 1-5 5Z", "M16 17a4 4 0 0 1-1.4-.3", "M14 9.6c.6-.4 1.3-.6 2-.6 2.4 0 4 2.4 4 4.8 0 .5-.1 1-.2 1.4"],
};
export const icon = (name, className = "") => svg("svg", { viewBox: "0 0 24 24", class: `icon ${className}`.trim(), "aria-hidden": "true" }, ...ICONS[name].map((d) => svg("path", { d })));

// The square inside Stop.
export const stopSquare = () => el("i", { className: "stop-square", ariaHidden: "true" });

const MOOD_WORDS = { rest: "at rest", fetching: "working", asking: "waiting for you", delivered: "finished", oops: "something went wrong" };

let drawn = 0;
// A mascot in one mood, always the whole drawing, at one of the sizes app.css has. Each gets gradient ids of its own, so
// one hidden drawing can't take the others' colour. `named` is false where its name is written beside it already.
export const bird = (mascot, mood, size, { named = true } = {}) => {
  const poses = POSES[mascot.look.accessory] ?? POSES.none;
  const holder = el("span", { className: `bird s${size}` });
  const own = `b${++drawn}`;
  holder.innerHTML = (poses[mood] ?? poses.rest).replace(/«[^»]*»/g, (id) => `${own}${id.length}`);
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

// The pips (DESIGN.md section 6), from pips.css, which comes from the app's own. Always beside words that say the same.
export const pips = (pattern, className = "") => el("span", { className: `pips ${className}`.trim(), dataPips: pattern, ariaHidden: "true" }, ...Array.from({ length: 9 }, () => el("i")));

// Which pips a step has. Its kind comes from the server, so anything but a kind there is takes the plain ones.
export const stepPips = (step) => STEP_PIPS[typeof step?.kind === "string" && Object.hasOwn(STEP_PIPS, step.kind) ? step.kind : "plain"];

// A reply's links and bold, built as elements so nothing from the server is read as HTML. Only http and https become
// links, and they open outside the page.
const LINKED = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)|\*\*([^*\n]+)\*\*/g;
const webLink = (href, label) => {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return label;
    return el("a", { href: url.href, textContent: label, target: "_blank", rel: "noopener noreferrer" });
  } catch {
    return label;
  }
};
export const replyText = (text) => {
  const parts = [];
  let at = 0;
  for (const match of text.matchAll(LINKED)) {
    parts.push(text.slice(at, match.index));
    const [whole, label, href, found, bold] = match;
    // A sentence's full stop after a bare address isn't part of it.
    const bare = found?.replace(/[.,;:!?]+$/, "");
    parts.push(bold !== undefined ? el("strong", { textContent: bold }) : webLink(href ?? bare, label ?? bare));
    at = match.index + (found ? whole.length - (found.length - bare.length) : whole.length);
  }
  parts.push(text.slice(at));
  return parts.filter((part) => part !== "");
};

// Draws a part of the screen again only when what it shows has changed, so a poll leaves the rest alone. A part with
// someone typing in it waits, and a button that had the keyboard gets it back if it's drawn again.
const drawnAs = new WeakMap();
export const typing = () => {
  const active = document.activeElement;
  return !!active && (active.matches("input, textarea") || active.tagName === "IFRAME");
};
export const patch = (node, signature, build, { force = false } = {}) => {
  if (!force && drawnAs.get(node) === signature) return false;
  const active = document.activeElement;
  if (!force && node.contains(active) && typing()) return false;
  const key = node.contains(active) ? active?.dataset.key : undefined;
  drawnAs.set(node, signature);
  node.replaceChildren(...build().flat().filter(Boolean));
  if (key) node.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  return true;
};

// A text box that grows with what's typed, up to a limit app.css sets.
export const grow = (box) => {
  const fit = () => {
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  };
  box.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return box;
};

// Copying a reply, with a tick for a moment once it's done.
export const copyButton = (text) => {
  const words = el("span", { textContent: "Copy" });
  const mark = el("span", { className: "swap" }, icon("copy"));
  const button = el("button", {
    type: "button",
    className: "ghost",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        mark.replaceChildren(icon("tick"));
        words.textContent = "Copied";
        setTimeout(() => {
          mark.replaceChildren(icon("copy"));
          words.textContent = "Copy";
        }, 1500);
      } catch {
        words.textContent = "Couldn’t copy";
      }
    },
  }, mark, words);
  return button;
};
