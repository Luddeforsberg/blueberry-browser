import "./theme.js";
import { DRAWINGS } from "./mascots.js";

// A few of the mascots that come with Blueberry, as they look in its Gallery (src/main/mascots/mascotCatalog.ts), and Berry.
const MASCOTS = [
  { name: "Berry", what: "Comes with every Blueberry.", palette: "blueberry", accessory: "none" },
  { name: "Prospector", what: "Finds companies that fit your customer.", palette: "lingon", accessory: "cap" },
  { name: "Meeting Prep", what: "Briefs you before a call.", palette: "lingon", accessory: "glasses" },
  { name: "Follow-up", what: "Drafts the Gmail replies you owe.", palette: "raspberry", accessory: "headphones" },
  { name: "Talent Scout", what: "Finds people for a role, and contacts nobody.", palette: "gooseberry", accessory: "cap" },
  { name: "Pipeline Tidy", what: "Finds deals with no next step.", palette: "cloudberry", accessory: "headphones" },
];

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
};

document.getElementById("mascots").replaceChildren(
  ...MASCOTS.map(({ name, what, palette, accessory }) => {
    const perch = el("div", { className: "perch" });
    perch.innerHTML = DRAWINGS[accessory];
    const drawing = perch.querySelector("svg");
    drawing.dataset.mascot = palette;
    drawing.setAttribute("aria-hidden", "true");
    return el("li", {}, perch, el("p", { className: "name", textContent: name }), el("p", { className: "what", textContent: what }));
  }),
);
