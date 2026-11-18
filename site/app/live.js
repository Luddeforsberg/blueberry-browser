import { el, icon } from "./dom.js";

// The live page, Browserbase's view of the page in the cloud. It shows in three places: at the top of a job, inside the
// sheet that asks, and full screen. Moving an iframe in the page reloads it, and a reload would take away what the user
// is typing into it, so each address has one box in #live, which nothing else draws, and it's laid over whichever
// place is showing, by position alone. A place is an empty slot of the right size in what's drawn; the box follows it
// on every draw, scroll and slide, and hides while something covers it.

const boxes = new Map();

// Where a live page goes. `url` is null before there is one, and the slot says what's coming instead.
export const liveSlot = (url, place, { name = "Berry", conversation = "", yours = false, empty = "" } = {}) =>
  el(
    "div",
    {
      className: `live-slot ${place}`,
      dataLiveSlot: url ?? "",
      dataPlace: place,
      dataName: name,
      dataConversation: conversation,
      dataYours: yours ? "1" : "",
    },
    url ? null : el("p", { className: "live-empty", textContent: empty }),
  );

const make = (url) => {
  const frame = el("iframe", {
    title: "The page in the cloud",
    sandbox: "allow-same-origin allow-scripts allow-forms",
    referrerPolicy: "no-referrer",
  });
  frame.src = url;
  const words = el("span");
  const tag = el("span", { className: "live-tag" }, el("span", { className: "live-tag-icon" }), words);
  const grow = el("button", { type: "button", className: "live-grow", ariaLabel: "Show the page full screen" }, icon("grow"));
  const box = el("div", { className: "live-box", dataUrl: url }, frame, tag, grow);
  document.getElementById("live").append(box);
  const entry = { box, frame, tag, words, grow, placeless: null };
  boxes.set(url, entry);
  return entry;
};

const layerOf = (node) => Number(node.closest("[data-layer]")?.dataset.layer ?? 1);
// The highest layer showing: a sheet over the screen, unless it's on its way out.
const topLayer = () =>
  Math.max(1, ...[...document.querySelectorAll("#sheets [data-layer]:not([data-closing])")].map((node) => Number(node.dataset.layer)));

const TAGS = {
  job: ["lock", (name) => `Locked while ${name} works`],
  ask: ["eye", (name) => `What ${name} sees`],
};

const place = (entry, slot, showing) => {
  const { box, frame, tag, words, grow } = entry;
  const rect = slot.getBoundingClientRect();
  const yours = slot.dataset.yours === "1" && showing;
  if (!showing || rect.width === 0 || rect.height === 0) {
    box.classList.add("hidden");
    frame.inert = true;
    frame.tabIndex = -1;
    return;
  }
  // Only the part inside what it scrolls in shows, so it never draws over a bar.
  const clipper = slot.closest("[data-clip]")?.getBoundingClientRect() ?? { top: 0, left: 0, right: innerWidth, bottom: innerHeight };
  const cut = [
    Math.max(0, clipper.top - rect.top),
    Math.max(0, rect.right - clipper.right),
    Math.max(0, rect.bottom - clipper.bottom),
    Math.max(0, clipper.left - rect.left),
  ];
  box.classList.remove("hidden");
  box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.clipPath = cut.some(Boolean) ? `inset(${cut.map((px) => `${px}px`).join(" ")})` : "";
  box.dataset.place = slot.dataset.place;
  box.dataset.layer = String(layerOf(slot));
  // Locked unless the user has taken this page over here: no touch, no keyboard, nothing a tap could start.
  frame.inert = !yours;
  frame.tabIndex = yours ? 0 : -1;
  box.classList.toggle("yours", yours);
  // Full screen, the bar over the page says it already.
  const shown = slot.dataset.place === "full" ? null : yours ? ["unlocked", () => "It’s yours"] : TAGS[slot.dataset.place];
  tag.hidden = !shown;
  if (shown) {
    const [mark, sentence] = shown;
    if (tag.dataset.mark !== mark) {
      tag.dataset.mark = mark;
      tag.firstChild.replaceChildren(icon(mark));
    }
    words.textContent = sentence(slot.dataset.name);
  }
  grow.hidden = slot.dataset.place !== "job";
  grow.onclick = () => {
    location.hash = `#job/${slot.dataset.conversation}/live`;
  };
};

// A box with no place stays a moment, hidden, so going from a sheet to the job, or the job to the page full screen,
// finds the same page. After that it's taken away, which ends its page.
const KEEP_MS = 2_000;

// Lays every box over its place.
export const placeLive = () => {
  const best = new Map();
  for (const slot of document.querySelectorAll("[data-live-slot]")) {
    const url = slot.dataset.liveSlot;
    if (url && (!best.has(url) || layerOf(slot) > layerOf(best.get(url)))) best.set(url, slot);
  }
  const now = performance.now();
  for (const [url, entry] of boxes) {
    if (best.has(url)) {
      entry.placeless = null;
      continue;
    }
    if (entry.placeless === null || entry.placeless === undefined) {
      entry.placeless = now;
      entry.box.classList.add("hidden");
      entry.frame.inert = true;
      setTimeout(placeLive, KEEP_MS + 50);
    } else if (now - entry.placeless >= KEEP_MS) {
      entry.box.remove();
      boxes.delete(url);
    }
  }
  const top = topLayer();
  for (const [url, slot] of best) place(boxes.get(url) ?? make(url), slot, layerOf(slot) >= top);
};

// Keeps up while something slides, for as long as it takes.
let until = 0;
export const followLive = (ms = 450) => {
  const running = until > performance.now();
  until = Math.max(until, performance.now() + ms);
  if (running) return;
  const step = () => {
    placeLive();
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

let pending = false;
const soon = () => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    placeLive();
  });
};
addEventListener("scroll", soon, { capture: true, passive: true });
addEventListener("resize", soon);
visualViewport?.addEventListener("resize", soon);
visualViewport?.addEventListener("scroll", soon);
document.fonts?.ready.then(soon);
new ResizeObserver(soon).observe(document.body);
