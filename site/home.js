import "./theme.js";
import { BIRDS } from "./birds.js";

// A few of the mascots that come with Blueberry, as they look in its Gallery (src/main/mascotCatalog.ts), and Berry.
const FLOCK = [
  { name: "Berry", what: "Comes with every Blueberry.", palette: "jackdaw", accessory: "none" },
  { name: "Morning Paper", what: "Sums up the day’s Swedish news.", palette: "kingfisher", accessory: "glasses" },
  { name: "Research Scout", what: "Compares sources and cites each one.", palette: "parakeet", accessory: "cap" },
  { name: "Plain Words", what: "Explains the page you’re on.", palette: "canary", accessory: "bow" },
  { name: "Price Sleuth", what: "Finds the lowest real price.", palette: "flamingo", accessory: "glasses" },
  { name: "Job Scout", what: "Finds jobs, and never applies.", palette: "robin", accessory: "crown" },
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
