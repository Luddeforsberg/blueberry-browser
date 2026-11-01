import { ACTOR_ART, ACTOR_ART_SHEET, type ArtNode } from "./pageActorArt";
import { SHARED } from "./pageScripts";

// The bird drawn on a web page while a job works in it, run in the same isolated world as the tools. Everything about it
// keeps it out of the page's way and out of the agent's sight:
// - A closed shadow root, so neither the page nor `list_elements` can reach into it.
// - No box and no pointer events, so nothing can land on it and `elementFromPoint` goes through it.
// - The line's words are in a pseudo-element, which `innerText` leaves out, so `read_page` can't pick them up.
// - A constructed stylesheet and elements made one by one, so a strict CSP or Trusted Types has nothing to refuse.
// - The top layer, so a page's own stacking, transforms and modal dialogs can't cover it or shift it.
// It only draws. Nothing in here can stop a job or send anything anywhere, so a page faking anything here gains nothing.

// `:host` rules marked important beat every rule in the page, even the page's own important ones.
const SHEET = `
  :host {
    all: initial !important; display: block !important; position: fixed !important; inset: 0 auto auto 0 !important;
    width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important; margin: 0 !important;
    padding: 0 !important; border: 0 !important; background: none !important; overflow: visible !important;
    pointer-events: none !important; z-index: 2147483647 !important; opacity: 1 !important; transform: none !important;
    filter: none !important; visibility: visible !important; clip: auto !important; clip-path: none !important;
  }
  @media print { :host { display: none !important; } }
  * { pointer-events: none; box-sizing: border-box; }
  .sky { position: absolute; left: 0; top: 0; width: 0; height: 0; }
  .sky.covered { visibility: hidden; }
  .bird, .flip, .body { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .bird { will-change: transform; }
  .flip { transition: transform 90ms ease-out; }
  .pose {
    position: absolute; display: none; overflow: visible;
    width: var(--size); height: var(--size); left: calc(var(--size) * -0.475); top: calc(var(--size) * -0.95);
    /* A thin pale edge and a small shadow, so a dark bird stays a bird on a dark page. */
    filter: drop-shadow(0 0 1px rgb(255 255 255 / 0.85)) drop-shadow(0 2px 3px rgb(20 22 36 / 0.3));
  }
  .pose.shown { display: block; }
  .pose.seated { top: calc(var(--size) * -0.717); }
  .pointer-pose { width: calc(var(--size) * 0.5); height: calc(var(--size) * 0.5); left: 0; top: 0; }
  .line {
    position: absolute; left: 0; top: 0; max-width: calc(280px * var(--unit)); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    padding: calc(3px * var(--unit)) calc(10px * var(--unit)); border-radius: 999px;
    font: 400 calc(12px * var(--unit)) / calc(18px * var(--unit)) -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    color: rgb(var(--foreground)); background: rgb(var(--surface));
    box-shadow: 0 0 0 1px rgb(20 22 36 / 0.08), 0 2px 10px rgb(20 22 36 / 0.22);
    opacity: 0; transition: opacity 140ms ease-out;
  }
  .line.shown { opacity: 1; }
  .line::after { content: attr(data-words); }
  .ripple {
    position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
    /* Two edges, so it shows on a dark button and a light page alike. */
    border: 3px solid rgb(var(--berry-fruit-bloom)); box-shadow: 0 0 0 1.5px rgb(var(--berry-fruit-dark)), inset 0 0 0 1.5px rgb(var(--berry-fruit-dark));
  }
`;

// A plain arrow, for Show Berry off, in the page's two most likely contrasts at once.
const POINTER_ART: ArtNode = ["svg", { viewBox: "0 0 24 24" }, ["path", { d: "M3 2 L3 20 L8 15.5 L11.5 22.5 L15 21 L11.5 14 L18 14 Z", fill: "#191b33", stroke: "#ffffff", "stroke-width": "1.5", "stroke-linejoin": "round" }]];

export interface ActorLook {
  palette: string;
  accessory: string;
  dark: boolean;
  plain: boolean;
  still: boolean;
  // The page's zoom, so the bird stays one size on screen.
  zoom: number;
  size: number;
}

// Where the feet were on the last page, so the bird carries on from there after a navigation.
export const installActor = (key: string, look: ActorLook, start: { x: number; y: number } | null): string => `(() => {
  globalThis.__berryActor?.remove();
  ${SHARED}
  const XHTML = "http://www.w3.org/1999/xhtml";
  const SVG = "http://www.w3.org/2000/svg";
  // An image, a PDF or an SVG document has nowhere to put this.
  if (document.documentElement?.namespaceURI !== XHTML) return false;

  const LOOK = ${JSON.stringify(look)};
  const ART = ${JSON.stringify(ACTOR_ART[look.accessory] ?? ACTOR_ART.none)};
  const POINTER_ART = ${JSON.stringify(POINTER_ART)};
  const START = ${JSON.stringify(start)};
  const FRAME_TAGS = "iframe,frame";
  const quietMotion = () => LOOK.still || matchMedia("(prefers-reduced-motion: reduce)").matches;

  const host = document.createElement("blueberry-actor");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  if (host.showPopover) host.setAttribute("popover", "manual");
  const root = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(${JSON.stringify(SHEET)} + ${JSON.stringify(ACTOR_ART_SHEET)});
  root.adoptedStyleSheets = [sheet];

  const div = (name, parent) => {
    const el = document.createElement("div");
    el.className = name;
    parent.append(el);
    return el;
  };
  const draw = ([tag, attributes, ...children]) => {
    const el = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "style") el.style.cssText = value;
      else el.setAttribute(name, value);
    }
    for (const child of children) el.append(draw(child));
    return el;
  };

  const sky = div("sky", root);
  if (LOOK.dark) sky.classList.add("dark");
  if (LOOK.palette !== "jackdaw") sky.dataset.mascot = LOOK.palette;
  sky.style.setProperty("--unit", String(1 / LOOK.zoom));
  const bird = div("bird", sky);
  const flip = div("flip", bird);
  const body = div("body", flip);
  const line = div("line", bird);
  const poses = {};
  const addPose = (name, art, extra) => {
    const el = draw(art);
    el.setAttribute("class", "pose " + (extra ?? ""));
    body.append(el);
    poses[name] = el;
  };
  if (LOOK.plain) {
    addPose("pointer", POINTER_ART, "pointer-pose");
  } else {
    for (const [name, art] of Object.entries(ART)) addPose(name, art, name === "sitting" ? "seated" : "");
  }

  const size = () => (quietMotion() ? Math.min(LOOK.size, 28) : LOOK.size) / LOOK.zoom;
  // What each moment looks like once the settings have had their say.
  const poseFor = (name) => (LOOK.plain ? "pointer" : quietMotion() ? "marker" : name);

  let pose = null;
  let spot = START;
  let facing = 1;
  let anchor = null;
  let flight = null;
  let reading = 0;
  let nod = null;
  let leaving = null;
  let covered = false;
  // What a flight from \`go\` lands as, which a job stopping to ask can still change on the way.
  let landingPose = null;
  // What the bird is here to do, which the line keeps clear of, and the line's place from the feet.
  let target = null;
  let lineAt = null;

  const setPose = (name) => {
    const next = poseFor(name);
    nod?.cancel();
    nod = null;
    if (next === pose) return;
    if (pose) poses[pose].classList.remove("shown");
    poses[next].classList.add("shown");
    pose = next;
  };
  const setFacing = (next) => {
    facing = next;
    flip.style.transform = "scaleX(" + next + ")";
  };
  const place = ({ x, y }) => {
    spot = { x, y };
    bird.style.transform = "translate(" + x + "px, " + y + "px)";
  };
  const now = () => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(bird).transform);
    return { x: matrix.e, y: matrix.f };
  };

  // How much of what's under this box someone might be reading. Only ever a rough count, as the line is only there a moment.
  const crowded = (left, top, width, height) => {
    let count = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const x = left + (width * (col + 0.5)) / 5;
        const y = top + (height * (row + 0.5)) / 2;
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (el.matches("input,textarea,select,button,a,[role=button]")) {
          count++;
          continue;
        }
        // The nearest place in some text, which only counts if the point really is on that line.
        const at = document.caretRangeFromPoint?.(x, y);
        if (at?.startContainer.nodeType !== 3 || !at.startContainer.textContent.trim()) continue;
        const box = at.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom && Math.abs(box.left - x) < 24) count++;
      }
    }
    return count;
  };
  const overlaps = (left, top, width, height, box) => left < box.right && left + width > box.left && top < box.bottom && top + height > box.top;

  // Tries the places around the bird and takes the first with the least under it, always wholly on screen. Over the bird
  // or what it's about to do is worse than over any text.
  const placeLine = () => {
    if (!spot || !line.classList.contains("shown")) return;
    const unit = 1 / LOOK.zoom;
    const { width, height } = line.getBoundingClientRect();
    const margin = 6 * unit;
    const gap = 8 * unit;
    const onScreenX = (left) => Math.max(margin, Math.min(left, innerWidth - width - margin));
    const onScreenY = (top) => Math.max(margin, Math.min(top, innerHeight - height - margin));
    const reach = size() * 0.6;
    const rect = target?.isConnected ? rectOf(target) : null;
    const box = rect && { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
    const bird = { left: spot.x - reach, top: spot.y - size(), right: spot.x + reach, bottom: spot.y };
    const above = spot.y - size() - height - gap;
    const beside = spot.y - size() * 0.75;
    const places = [
      [spot.x - width / 2, above],
      [spot.x - reach, above],
      [spot.x + reach - width, above],
      [spot.x + reach + gap, beside],
      [spot.x - reach - gap - width, beside],
      [spot.x - width / 2, Math.max(spot.y, box?.bottom ?? spot.y) + gap],
    ].map(([left, top]) => [onScreenX(left), onScreenY(top)]);
    let best = null;
    let bestScore = Infinity;
    places.forEach(([left, top], order) => {
      const inTheWay = (box && overlaps(left, top, width, height, box) ? 100 : 0) + (overlaps(left, top, width, height, bird) ? 100 : 0);
      const score = inTheWay + crowded(left, top, width, height) * 10 + order;
      if (score < bestScore) {
        best = [left, top];
        bestScore = score;
      }
    });
    lineAt = { x: best[0] - spot.x, y: best[1] - spot.y, width, height };
    line.style.transform = "translate(" + lineAt.x + "px, " + lineAt.y + "px)";
  };
  // The same place from the feet as they move, unless that would take it off screen.
  const keepLine = () => {
    if (!spot || !lineAt) return;
    const left = Math.max(0, Math.min(spot.x + lineAt.x, innerWidth - lineAt.width));
    const top = Math.max(0, Math.min(spot.y + lineAt.y, innerHeight - lineAt.height));
    line.style.transform = "translate(" + (left - spot.x) + "px, " + (top - spot.y) + "px)";
  };
  const setWords = (words) => {
    if (words === undefined) return;
    if (words) line.dataset.words = words;
    line.classList.toggle("shown", !!words);
  };
  const say = (words) => {
    if (words === undefined) return;
    setWords(words);
    placeLine();
  };

  const landed = () => body.animate(
    [{ transform: "scale(1.1, 0.88)" }, { transform: "scale(0.98, 1.03)", offset: 0.6 }, { transform: "none" }],
    { duration: 170, easing: "ease-out" }
  );

  const cancelFlight = () => {
    if (!flight) return;
    const at = now();
    flight.cancel();
    flight = null;
    place(at);
  };

  // Along a shallow arc, quick off the mark and gently down. The frames are worked out here so the arc and the easing are
  // one curve, and the compositor plays them, so a busy page doesn't make it stutter.
  const flyTo = (to, ms, arc, onLanded) => {
    cancelFlight();
    const from = spot ?? now();
    const frames = [];
    const STEPS = 16;
    for (let at = 0; at <= STEPS; at++) {
      const p = at / STEPS;
      const eased = p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased - arc * Math.sin(Math.PI * p);
      frames.push({ transform: "translate(" + x + "px, " + y + "px)" });
    }
    place(to);
    landingPose = null;
    const run = bird.animate(frames, { duration: ms, easing: "linear" });
    flight = run;
    run.onfinish = () => {
      if (flight !== run) return;
      flight = null;
      onLanded?.();
    };
    return run;
  };

  const fade = () => bird.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });

  const rectOf = (el) => {
    const box = el.getBoundingClientRect();
    let left = box.left;
    let top = box.top;
    for (let win = el.ownerDocument.defaultView; win && win !== window; win = win.parent) {
      const owner = win.frameElement;
      if (!owner) return null;
      const outer = owner.getBoundingClientRect();
      left += outer.left + owner.clientLeft;
      top += outer.top + owner.clientTop;
    }
    return { left, top, width: box.width, height: box.height };
  };

  // A page moves under the bird, so what it's standing on stays under its feet, as far as the screen goes.
  const follow = () => {
    if (!anchor || flight || !anchor.el.isConnected) return;
    const rect = rectOf(anchor.el);
    if (!rect) return;
    const x = Math.max(4, Math.min(rect.left + anchor.dx, innerWidth - 4));
    const y = Math.max(size() * 0.7, Math.min(rect.top + anchor.dy, innerHeight - 4));
    place({ x, y });
    keepLine();
  };
  let followQueued = false;
  const queueFollow = () => {
    if (followQueued) return;
    followQueued = true;
    requestAnimationFrame(() => {
      followQueued = false;
      follow();
    });
  };
  addEventListener("scroll", queueFollow, { capture: true, passive: true });
  addEventListener("resize", queueFollow, { passive: true });

  const anchorTo = (ref) => {
    const el = ref ? state.byRef.get(ref) : null;
    const rect = el?.isConnected ? rectOf(el) : null;
    anchor = rect && spot ? { el, dx: spot.x - rect.left, dy: spot.y - rect.top } : null;
  };

  // Never while the keyboard is in a password or code field: whoever's typing there, nothing is drawn over it.
  const activeEl = () => {
    let at = document.activeElement;
    while (at?.shadowRoot?.activeElement || at?.contentDocument?.activeElement) {
      at = at.shadowRoot?.activeElement ?? at.contentDocument.activeElement;
    }
    return at;
  };
  const inSecret = () => {
    const at = activeEl();
    // Focus in a frame from another origin could be on anything, and that frame can't be asked.
    if (at?.matches(FRAME_TAGS) && !at.contentDocument) return true;
    return !!at && at.tagName === "INPUT" && isSecret(at);
  };
  const cover = (on) => {
    covered = on;
    sky.classList.toggle("covered", on);
  };
  const checkFocus = () => cover(inSecret());
  addEventListener("focusin", checkFocus, true);
  addEventListener("focusout", checkFocus, true);

  const attach = () => {
    if (!host.isConnected) document.documentElement.append(host);
    // A modal opened since would be above this, so it goes back on top.
    if (host.showPopover && (!host.matches(":popover-open") || document.querySelector(":modal"))) {
      try {
        if (host.matches(":popover-open")) host.hidePopover();
        host.showPopover();
      } catch {
        // Fixed to the page instead, under anything in the top layer.
      }
    }
  };
  const stopReading = () => {
    reading++;
  };
  const begin = () => {
    attach();
    checkFocus();
    stopReading();
    if (leaving !== null) {
      clearTimeout(leaving);
      leaving = null;
      bird.getAnimations().forEach((run) => run.cancel());
      flight = null;
    }
    sky.style.setProperty("--size", size() + "px");
    return !covered;
  };
  const entering = () => spot === null;
  const offStage = () => ({ x: innerWidth + size(), y: Math.max(size(), innerHeight * 0.22) });

  const remove = () => {
    removeEventListener("scroll", queueFollow, { capture: true });
    removeEventListener("resize", queueFollow);
    removeEventListener("focusin", checkFocus, true);
    removeEventListener("focusout", checkFocus, true);
    if (leaving !== null) clearTimeout(leaving);
    host.remove();
    if (globalThis.__berryActor === api) delete globalThis.__berryActor;
  };

  const ripple = ({ x, y }) => {
    const el = div("ripple", sky);
    el.style.left = x + "px";
    el.style.top = y + "px";
    const scale = 1 / LOOK.zoom;
    el.animate(
      [{ transform: "scale(" + 0.25 * scale + ")", opacity: 1 }, { transform: "scale(" + 0.9 * scale + ")", opacity: 0.9, offset: 0.45 }, { transform: "scale(" + 1.35 * scale + ")", opacity: 0 }],
      { duration: quietMotion() ? 240 : 480, easing: "ease-out" }
    ).onfinish = () => el.remove();
  };

  // Everything from here on answers false if nothing was drawn, so main doesn't wait for a bird nobody can see.
  const api = {
    key: ${JSON.stringify(key)},

    state: () => {
      const { left, top, right, bottom } = line.getBoundingClientRect();
      return { pose, spot, facing, covered, words: line.classList.contains("shown") ? line.dataset.words : "", line: { left, top, right, bottom }, attached: host.isConnected, hidden: sky.style.visibility === "hidden", flying: !!flight };
    },

    // Goes to a spot and lands there. ms is how long main will wait.
    go: ({ x, y, ms, arc, turn, ref, words, then }) => {
      if (!begin()) return false;
      anchor = null;
      const to = { x, y };
      const el = ref ? state.byRef.get(ref) : null;
      target = el?.isConnected ? el : null;
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
      setFacing(x >= (spot?.x ?? x) ? 1 : -1);
      flyTo(to, ms, arc, () => {
        setPose(landingPose ?? then);
        landingPose = null;
        setFacing(turn);
        anchorTo(ref);
        keepLine();
        landed();
      });
      landingPose = then;
      placeLine();
      return true;
    },

    // A jab of the beak at the point, and the ripple as it arrives.
    peck: ({ x, y, clicks }) => {
      if (!begin()) return false;
      if (quietMotion() || LOOK.plain) {
        ripple({ x, y });
        return true;
      }
      setPose("rest");
      const reach = size() / 120;
      const at = spot ?? now();
      // Where the beak's tip ends up with the head down and the body leaning, from the feet, in the drawing's units.
      const tip = { x: at.x + facing * 44 * reach, y: at.y - 24 * reach };
      const most = size() * 0.7;
      const lunge = { x: Math.max(-most, Math.min((x - tip.x) * facing, most)), y: Math.max(-most, Math.min(y - tip.y, most)) };
      const timing = { duration: 210, iterations: clicks, easing: "cubic-bezier(.3,.6,.4,1)" };
      body.animate(
        [{ transform: "none" }, { transform: "translate(" + lunge.x + "px, " + lunge.y + "px) rotate(20deg)", offset: 0.42 }, { transform: "none" }],
        timing
      );
      poses[pose].querySelector("[data-part=head]")?.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(46deg)", offset: 0.42 }, { transform: "rotate(0deg)" }],
        timing
      );
      setTimeout(() => ripple({ x, y }), 80);
      if (clicks === 2) setTimeout(() => ripple({ x, y }), 290);
      return true;
    },

    // Across to where a dragged thing goes.
    carry: ({ x, y, ms, words }) => {
      if (!begin()) return false;
      target = null;
      say(words);
      anchor = null;
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
    },

    // In place: a mood and what it's doing.
    pose: ({ name, words }) => {
      if (!begin()) return false;
      if (entering()) {
        place({ x: Math.max(4, innerWidth - size() * 1.4), y: size() * 1.5 });
        fade();
      }
      // In the air, it stays where it is while the page moves under it.
      if (name === "flying") anchor = null;
      // On its way somewhere, this is how it lands.
      if (flight && landingPose) landingPose = name;
      else setPose(name);
      if (words !== undefined) say(words);
      return true;
    },

    // A little hop on the spot, for a key pressed or a page looked over.
    hop: ({ words, name }) => {
      if (!begin()) return false;
      if (entering()) place({ x: Math.max(4, innerWidth - size() * 1.4), y: size() * 1.5 });
      if (name) setPose(name);
      say(words);
      if (quietMotion()) {
        fade();
        return true;
      }
      body.animate(
        [{ transform: "none" }, { transform: "scale(1.06, 0.92)", offset: 0.2 }, { transform: "translateY(-22%) scale(0.97, 1.04)", offset: 0.55 }, { transform: "scale(1.04, 0.96)", offset: 0.85 }, { transform: "none" }],
        { duration: 300, easing: "ease-out" }
      );
      return true;
    },

    // Head bobbing along while the letters appear.
    typing: () => {
      if (!begin() || quietMotion() || LOOK.plain) return !covered;
      setPose("sitting");
      nod = poses[pose].querySelector("[data-part=head]")?.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(9deg)", offset: 0.5 }, { transform: "rotate(0deg)" }],
        { duration: 240, iterations: Infinity, easing: "ease-in-out" }
      ) ?? null;
      return true;
    },

    // Hops down what's in view, stopping to look at each thing it reads. It never scrolls the page: that would be doing
    // something, and all it's doing is reading. Runs by itself, and anything else coming along ends it.
    read: ({ words }) => {
      if (!begin()) return false;
      anchor = null;
      target = null;
      say(words);
      const margin = size();
      const blocks = [...document.querySelectorAll("h1,h2,h3,p,li,td,dt,dd,blockquote,figcaption,label")]
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ el, box }) => box.width > 40 && box.height > 8 && box.top >= margin * 0.8 && box.bottom <= innerHeight && box.left >= 0 && box.left < innerWidth - 60 && (el.innerText?.trim().length ?? 0) > 2)
        .sort((a, b) => a.box.top - b.box.top);
      const stops = [];
      for (const { box } of blocks) {
        if (stops.length < 4 && (stops.length === 0 || box.top - stops.at(-1).top > margin * 1.6)) stops.push(box);
      }
      if (stops.length === 0) stops.push({ left: innerWidth - margin * 2, top: margin * 1.5 }, { left: innerWidth - margin * 2, top: innerHeight / 2 });
      const onLeft = (box) => ({ x: Math.max(margin * 0.6, box.left - margin * 0.35), y: Math.min(box.top + margin * 0.2, innerHeight - 4) });
      if (quietMotion()) {
        setPose("looking");
        place(onLeft(stops[0]));
        setFacing(1);
        placeLine();
        fade();
        return true;
      }
      if (entering()) place(offStage());
      const job = reading;
      let at = 0;
      const next = () => {
        if (job !== reading || at >= stops.length) return;
        const to = onLeft(stops[at++]);
        const far = Math.hypot(to.x - (spot?.x ?? to.x), to.y - (spot?.y ?? to.y));
        setPose(far > margin * 4 ? "flying" : "looking");
        setFacing(far > margin * 4 && to.x < (spot?.x ?? 0) ? -1 : 1);
        flyTo(to, far > margin * 4 ? Math.min(240 + far * 0.3, 480) : 230, Math.min(margin * 0.5, 10 + far * 0.2), () => {
          if (job !== reading) return;
          setPose("looking");
          setFacing(1);
          landed();
          setTimeout(next, 420);
        });
        placeLine();
      };
      next();
      return true;
    },

    // Out of sight for a capture, with two frames so it's gone from what the capture sees. A busy or covered page may
    // give no frame, and a capture can't wait on that.
    hide: () => {
      sky.style.visibility = "hidden";
      return Promise.race([
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))),
        new Promise((resolve) => setTimeout(() => resolve(true), 120)),
      ]);
    },
    show: () => {
      sky.style.visibility = "";
      return true;
    },

    // Sits on the edge of a frame it can't reach into, or stays where it is if it can't tell which one that is.
    frameSpot: ({ origin }) => {
      for (const frame of document.querySelectorAll(FRAME_TAGS)) {
        let from = "";
        try {
          from = new URL(frame.src).origin;
        } catch {
          continue;
        }
        const box = frame.getBoundingClientRect();
        if (from === origin && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight) {
          return { left: box.left, top: box.top, width: box.width, height: box.height, x: box.left + box.width / 2, y: box.top + Math.min(box.height / 2, 20), viewWidth: innerWidth, viewHeight: innerHeight };
        }
      }
      return null;
    },

    // Flies off the top of the page and fades, then everything goes.
    leave: ({ ms }) => {
      stopReading();
      anchor = null;
      say("");
      if (quietMotion() || !spot) {
        remove();
        return true;
      }
      setPose("flying");
      setFacing(1);
      const to = { x: Math.min(spot.x + size() * 3, innerWidth + size()), y: -size() * 1.5 };
      flyTo(to, ms, 0);
      bird.animate([{ opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: ms, easing: "ease-in" });
      leaving = setTimeout(remove, ms);
      return true;
    },

    remove,
  };

  globalThis.__berryActor = api;
  if (START) {
    place(START);
    sky.style.setProperty("--size", size() + "px");
    fade();
  }
  attach();
  return true;
})()`;

const call = (key: string, command: string): string => {
  const api = "globalThis.__berryActor";
  return `${api}?.key === ${JSON.stringify(key)} ? ${api}.${command} : "absent"`;
};

export const actorCommand = (key: string, name: string, args: object = {}): string => call(key, `${name}(${JSON.stringify(args)})`);

// For anything that shouldn't bring the bird back if it isn't there.
export const ifThere = (name: string, args: object = {}): string => `globalThis.__berryActor?.${name}(${JSON.stringify(args)})`;
