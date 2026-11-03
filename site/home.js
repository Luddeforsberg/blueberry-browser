import "./theme.js";
import { BIRDS } from "./birds.js";

// A few of the mascots that come with Blueberry, as they look in its Gallery (src/main/mascotCatalog.ts), and Berry.
const FLOCK = [
  { name: "Berry", what: "Comes with every Blueberry.", palette: "jackdaw", accessory: "none" },
  { name: "Prospector", what: "Finds companies that fit your customer.", palette: "kingfisher", accessory: "cap" },
  { name: "Meeting Prep", what: "Briefs you before a call.", palette: "robin", accessory: "glasses" },
  { name: "Follow-up", what: "Drafts the Gmail replies you owe.", palette: "flamingo", accessory: "headphones" },
  { name: "Talent Scout", what: "Finds people for a role, and contacts nobody.", palette: "parakeet", accessory: "cap" },
  { name: "Pipeline Tidy", what: "Finds deals with no next step.", palette: "canary", accessory: "headphones" },
];

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
};

document.getElementById("flock").replaceChildren(...FLOCK.map(({ name, what, palette, accessory }) => {
  const perch = el("div", { className: "perch" });
  perch.innerHTML = BIRDS[accessory];
  const drawing = perch.querySelector("svg");
  drawing.dataset.mascot = palette;
  drawing.setAttribute("aria-hidden", "true");
  return el("li", {}, perch, el("p", { className: "name", textContent: name }), el("p", { className: "what", textContent: what }));
}));
