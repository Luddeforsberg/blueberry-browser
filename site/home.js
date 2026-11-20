// The front page: the product first. One picture of the window with a job running, then three of the app's parts, each
// a picture of something real, then the mascots. See The public site in DESIGN.md.
import "./theme.js";
import {
  BERRY,
  COMPETITOR_WATCH,
  FOLLOW_UP,
  JOB,
  MASCOTS,
  MEETING_PREP,
  TALENT_SCOUT,
  askCard,
  bubble,
  el,
  face,
  icon,
  picture,
  pips,
  reply,
  tile,
  working,
} from "./picture.js";

const fill = (id, ...children) => document.getElementById(id).replaceChildren(...children);

fill("mark", face(BERRY, "rest", 24));

// --- The window: the sidebar's Tabs with a job's group, the toolbar, and the chat on its sheet. ---

const row = (lead, words, { className = "", end = null } = {}) =>
  el("li", { className: `row ${className}`.trim() }, lead, el("span", { className: "row-words" }, words), end);

const sidebar = () =>
  el(
    "div",
    { className: "side" },
    el("div", { className: "faces" }, el("span", { className: "face on" }, "Tabs"), el("span", { className: "face" }, "Chats")),
    el("p", { className: "label" }, el("span", {}, "Tabs"), el("span", { className: "mono count" }, "4"), icon("plus", "plus")),
    el(
      "ul",
      { className: "rows" },
      row(tile("D", 5), "Q4 planning"),
      row(tile("S", 6), "Weekly numbers"),
      row(tile("W", 7), "Lisbon in December"),
    ),
    el(
      "ul",
      { className: "group" },
      row(face(BERRY, "fetching", 18), JOB.title, { className: "current", end: el("span", { className: "mono dim" }, JOB.time) }),
      row(tile("M", 4), "Inbox", { className: "child" }),
    ),
    el(
      "div",
      { className: "dock" },
      ...MASCOTS.slice(0, 5).map((mascot, at) => el("span", { className: "place" }, face(mascot, at === 0 ? "fetching" : "rest", 26))),
    ),
  );

const toolbar = () =>
  el(
    "div",
    { className: "toolbar" },
    el("span", { className: "nav" }, icon("back"), icon("next"), icon("again")),
    el("span", { className: "address" }, face(BERRY, "rest", 16), JOB.title),
    icon("panel", "panel"),
  );

const promptBox = () =>
  el(
    "div",
    { className: "shell prompt" },
    el(
      "div",
      { className: "card" },
      el("p", { className: "placeholder" }, "Ask Berry"),
      el(
        "div",
        { className: "tools" },
        el("span", { className: "plus-key" }, icon("plus")),
        el("span", { className: "who" }, face(BERRY, "rest", 18), "Berry", icon("down")),
        el("span", { className: "send" }, icon("up")),
      ),
    ),
  );

const chat = () =>
  el(
    "div",
    { className: "page" },
    el("div", { className: "column" }, bubble(JOB.asked), reply("fetching", working("Typing a reply.."))),
    promptBox(),
  );

fill("window", picture("window", sidebar(), el("div", { className: "main" }, toolbar(), chat())));

// --- Three parts of the app, each drawn from the real thing. ---

// Real work, as the sidebar's Chats lists it: one waiting for you, one working, one done.
fill(
  "work",
  picture(
    "part on-ground",
    el("p", { className: "label ask" }, el("span", {}, "Needs you"), el("span", { className: "mono count" }, "1")),
    el(
      "ul",
      { className: "rows" },
      row(face(FOLLOW_UP, "asking", 20), "Replies to three threads", { className: "raised", end: pips("waiting", "ask") }),
    ),
    el("p", { className: "label" }, el("span", {}, "Working")),
    el(
      "ul",
      { className: "rows" },
      row(face(MEETING_PREP, "fetching", 20), "Brief for the Spotify call", { end: el("span", { className: "mono dim" }, "3:12") }),
    ),
    el("p", { className: "label" }, el("span", {}, "Done"), el("span", { className: "mono count" }, "1 new")),
    el(
      "ul",
      { className: "rows" },
      row(face(COMPETITOR_WATCH, "delivered", 20), "What’s new at Notion and Linear", {
        className: "new",
        end: el("span", { className: "ends" }, el("i", { className: "new-dot" }), el("span", { className: "mono dim" }, "12m")),
      }),
    ),
  ),
);

// A mascot for each kind of work, as the menu that chooses one shows them.
const choice = (mascot, chosen) =>
  el(
    "li",
    { className: chosen ? "chosen" : "" },
    face(mascot, "rest", 24),
    el(
      "span",
      { className: "choice-words" },
      el("span", { className: "choice-name" }, mascot.name),
      el("span", { className: "choice-may" }, mascot.may),
    ),
    chosen ? icon("tick", "tick") : null,
  );
fill("specialists", picture("part", el("ul", { className: "menu" }, choice(FOLLOW_UP, true), choice(MEETING_PREP), choice(TALENT_SCOUT))));

fill("asks", picture("part", el("div", { className: "asking" }, face(BERRY, "asking", 24), askCard())));

// --- The mascots. ---

fill(
  "mascots",
  ...MASCOTS.map((mascot) =>
    el(
      "li",
      {},
      face(mascot, "rest", 40),
      el("div", {}, el("p", { className: "name" }, mascot.name), el("p", { className: "what" }, mascot.what)),
    ),
  ),
);
