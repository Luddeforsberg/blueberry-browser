import type { ArtNode } from "./stage";

// `:host` rules marked important beat every rule in the page, even the page's own important ones.
export const SHEET = `
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
  .mascot, .flip, .body { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .mascot { will-change: transform; }
  .flip { transition: transform 90ms ease-out; }
  .pose {
    position: absolute; display: none; overflow: visible;
    width: var(--size); height: var(--size); left: calc(var(--size) * -0.475); top: calc(var(--size) * -0.95);
    /* A thin pale edge and a small shadow, so a dark mascot stays a mascot on a dark page. */
    filter: drop-shadow(0 0 1px rgb(255 255 255 / 0.85)) drop-shadow(0 2px 3px rgb(20 22 36 / 0.3));
  }
  .pose.shown { display: block; }
  .pose.seated { top: calc(var(--size) * -0.717); }
  .pointer-pose { width: calc(var(--size) * 0.5); height: calc(var(--size) * 0.5); left: 0; top: 0; }
  .line {
    position: absolute; left: 0; top: 0; max-width: calc(280px * var(--unit)); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    padding: calc(3px * var(--unit)) calc(10px * var(--unit)); border-radius: 999px;
    font: 400 calc(12px * var(--unit)) / calc(18px * var(--unit)) -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    color: rgb(var(--ink)); background: rgb(var(--sheet));
    box-shadow: 0 0 0 1px rgb(20 22 36 / 0.08), 0 2px 10px rgb(20 22 36 / 0.22);
    opacity: 0; transition: opacity 140ms ease-out;
  }
  .line.shown { opacity: 1; }
  /* Far too small to read in a picture, and the chrome says the same words beside it. */
  .sky.pictured .line { display: none; }
  /* Between steps nothing moves in a picture, so the picture needn't change until there's something to see. */
  .sky.pictured .pose[data-pose="thinking"] * { animation: none !important; }
  .line::after { content: attr(data-words); }
  .ripple {
    position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
    /* Two edges, so it shows on a dark button and a light page alike. */
    border: 3px solid var(--berry-blueberry); box-shadow: 0 0 0 1.5px var(--berry-blueberry-crown), inset 0 0 0 1.5px var(--berry-blueberry-crown);
  }
`;

// A plain arrow, for Show Berry off, in the page's two most likely contrasts at once.
export const POINTER_ART: ArtNode = [
  "svg",
  { viewBox: "0 0 24 24" },
  [
    "path",
    {
      d: "M3 2 L3 20 L8 15.5 L11.5 22.5 L15 21 L11.5 14 L18 14 Z",
      fill: "#191b33",
      stroke: "#ffffff",
      "stroke-width": "1.5",
      "stroke-linejoin": "round",
    },
  ],
];
