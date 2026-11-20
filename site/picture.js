// Pictures of Blueberry for the front page, made of the app's own parts (DESIGN.md sections 3 to 9): the mascots, the
// pips, a message, the working line, an approval card in its shell. They're pictures, not controls: every one is built
// inert and hidden from assistive technology, and the words beside it say what it shows.
import { drawPose, el, pips } from "./draw.js";
import { HOME_POSES } from "./homePoses.js";

export { el, pips };

const SVG = "http://www.w3.org/2000/svg";

// Lucide's shapes, as in the phone page's dom.js, with the few a window needs.
const ICONS = {
  back: ["m15 18-6-6 6-6"],
  next: ["m9 18 6-6-6-6"],
  again: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  plus: ["M12 5v14", "M5 12h14"],
  panel: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M15 3v18"],
  up: ["M12 19V5", "M5 12l7-7 7 7"],
  down: ["m6 9 6 6 6-6"],
  tick: ["M20 6 9 17l-5-5"],
};

export const icon = (name, className = "") => {
  const drawing = document.createElementNS(SVG, "svg");
  drawing.setAttribute("viewBox", "0 0 24 24");
  drawing.setAttribute("class", `icon ${className}`.trim());
  drawing.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    drawing.append(path);
  }
  return drawing;
};

export const BERRY = { name: "Berry", look: { palette: "blueberry", accessory: "none" } };

// Berry, and starters from the Gallery as they come (src/main/mascots/mascotCatalog.ts), one of each berry, with their
// descriptions and what they may do in the app's own words (permissionsInWords in src/shared/mascots.ts).
export const FOLLOW_UP = {
  name: "Follow-up",
  look: { palette: "raspberry", accessory: "headphones" },
  what: "Finds Gmail threads waiting on a reply and drafts your answers.",
  may: "Only visits mail.google.com. Can click and type",
};
export const MEETING_PREP = {
  name: "Meeting Prep",
  look: { palette: "lingon", accessory: "glasses" },
  what: "Reads up on a company and the people you’ll meet, then writes a brief.",
  may: "Can search the web and go anywhere. Can’t type or click",
};
export const TALENT_SCOUT = {
  name: "Talent Scout",
  look: { palette: "gooseberry", accessory: "cap" },
  what: "Finds people who fit a role from public work, and contacts nobody.",
  may: "Can search the web and go anywhere. Can type, but can’t click",
};
export const COMPETITOR_WATCH = {
  name: "Competitor Watch",
  look: { palette: "currant", accessory: "glasses" },
  what: "Says what’s new on competitors’ pricing pages, changelogs and blogs.",
};
export const MASCOTS = [
  { ...BERRY, what: "Comes with every Blueberry, and does whatever you ask." },
  FOLLOW_UP,
  MEETING_PREP,
  TALENT_SCOUT,
  COMPETITOR_WATCH,
  {
    name: "Pipeline Tidy",
    look: { palette: "cloudberry", accessory: "headphones" },
    what: "Finds HubSpot or Pipedrive deals with no next step, or gone quiet.",
  },
];

// One job, told the way the app tells it: the steps in the words main writes, the card in the words the tool layer
// and askingWords.ts write.
export const JOB = {
  title: "Reply to Anna",
  asked: "Tell Anna that Thursday at 10 works for me.",
  time: "0:41",
  steps: [
    ["opened", "Opened mail.google.com"],
    ["read", "Read mail.google.com"],
    ["clicked", "Clicked Reply"],
  ],
  // What it says between steps, in its own voice, where it said it.
  said: "Anna asked whether Thursday or Friday works, so I’ll say Thursday at 10.",
};

// A picture is never a control: nothing in it takes the pointer or the keyboard.
export const picture = (className, ...children) => {
  const node = el("div", { className: `pic ${className}`, ariaHidden: "true" }, ...children);
  node.inert = true;
  return node;
};

export const face = (mascot, mood, size) => drawPose(HOME_POSES, mascot, mood, size, { named: false });

// A letter on a coloured tile, as a site with no icon of its own shows (DESIGN.md section 8, Favicons).
export const tile = (letter, colour) => el("span", { className: `tile site-${colour}` }, letter);

export const bubble = (text) => el("p", { className: "bubble" }, text);

const step = (mark, words, className = "") => el("li", { className }, pips(mark), el("span", {}, words));

// The working line and the steps under it, the live one last (Main chat in DESIGN.md).
export const working = (live) =>
  el(
    "div",
    { className: "work" },
    el("p", { className: "workline mono" }, pips("think"), el("span", {}, "Working"), el("span", { className: "dim" }, JOB.time)),
    el(
      "ol",
      { className: "steps mono" },
      ...JOB.steps.slice(0, 2).map(([mark, words]) => step(mark, words)),
      el("li", { className: "said" }, JOB.said),
      ...JOB.steps.slice(2).map(([mark, words]) => step(mark, words)),
      step("typing", live, "live"),
    ),
  );

const button = (words, kind) => el("span", { className: `btn ${kind}` }, words);

// Asking, for leave to do something: a card set into a shell, with the exact words and why it asks under it.
export const askCard = () =>
  el(
    "div",
    { className: "shell" },
    el(
      "div",
      { className: "card" },
      el("p", { className: "ask-title" }, "I’d like to click the button “Send”"),
      el("p", { className: "exact mono" }, "Click the button “", el("mark", {}, "Send"), "”"),
      el("div", { className: "buttons" }, button("Allow", "fill"), button("Don’t allow", "raised")),
    ),
    el("p", { className: "shell-note" }, "Asking because of the word marked above."),
  );

// A mascot's reply, its face beside its first line.
export const reply = (mood, ...children) =>
  el("div", { className: "reply" }, face(BERRY, mood, 24), el("div", { className: "reply-body" }, ...children));
