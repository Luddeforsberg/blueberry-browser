import { mascotsFromSharedRows } from "../shared.js";
import { appearance, setAppearance } from "../theme.js";
import * as api from "./api.js";
import { el, icon } from "./dom.js";
import { pushState, turnOff, turnOn } from "./push.js";
import { closeSheet, openSheet, sheetBody, sheetKind } from "./sheet.js";
import { finished, hooks, SET_UP, state } from "./state.js";

// Settings, a sheet from the initial on home: the account, the look, notifications and the cloud, then Sign out.

const APPEARANCES = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

// Why a notification can't be turned on here, in place of the switch.
const CANT = {
  "add-to-home": "On an iPhone, add this page to your Home Screen first, then open it from there.",
  blocked: "Notifications are blocked for this site in your browser’s settings.",
  unavailable: "This browser can’t show notifications from this page.",
};

const group = (title, ...rows) => el("section", { className: "group", ariaLabel: title }, el("h3", { textContent: title }), ...rows);
const row = (lead, words, sub, end) =>
  el(
    "div",
    { className: "srow" },
    lead,
    el(
      "div",
      { className: "w" },
      el("p", { className: "srow-name", textContent: words }),
      sub ? el("p", { className: "srow-sub", textContent: sub }) : null,
    ),
    end,
  );

const look = () =>
  el(
    "div",
    { className: "pics", role: "radiogroup", ariaLabel: "Look" },
    ...APPEARANCES.map(([choice, words]) =>
      el(
        "button",
        {
          type: "button",
          role: "radio",
          className: "pic",
          ariaChecked: String(appearance() === choice),
          dataKey: `look-${choice}`,
          onclick: () => {
            setAppearance(choice);
            draw();
            hooks.show();
          },
        },
        // A small drawing of the page in that look, made of its own tokens.
        el(
          "span",
          { className: "pic-face", ariaHidden: "true" },
          el("i", { className: choice === "dark" ? "dark" : "light" }),
          el("i", { className: choice === "light" ? "light" : "dark" }),
        ),
        el("span", { textContent: words }),
      ),
    ),
  );

const notifications = () => {
  const on = state.push === "on";
  const toggle =
    state.push === "on" || state.push === "off"
      ? el("button", {
          type: "button",
          className: "switch",
          role: "switch",
          ariaChecked: String(on),
          ariaLabel: "Notifications",
          onclick: async (event) => {
            event.currentTarget.disabled = true;
            let problem = null;
            try {
              if (on) await turnOff();
              else if (!(await turnOn())) problem = "Notifications weren’t turned on.";
            } catch {
              problem = "Notifications couldn’t be turned on here.";
            }
            state.push = await pushState();
            draw(problem);
          },
        })
      : null;
  return row(
    null,
    "When a mascot needs you or has finished",
    toggle ? "A notification only ever says that. It never says what the job is." : (CANT[state.push] ?? CANT.unavailable),
    toggle,
  );
};

const cloud = () => {
  const ready = state.linked === true;
  const shared = state.mascots.length - 1;
  const pill =
    state.linked === null ? null : el("span", { className: `pill ${ready ? "on" : ""}`, textContent: ready ? "Ready" : "Not set up" });
  return [
    row(
      el("span", { className: "tile" }, icon("computer")),
      "Jobs with your computer off",
      ready ? "Set up in Blueberry on your computer" : SET_UP,
      pill,
    ),
    row(
      el("span", { className: "tile" }, icon("mascots")),
      "Your mascots",
      shared > 0
        ? `${shared} shared from your computer${state.mascotsShared ? ` ${finished(state.mascotsShared)}` : ""}`
        : "Only Berry so far. The others show once Blueberry on your computer shares them.",
    ),
  ];
};

const signOut = async () => {
  await turnOff().catch(() => {});
  await api.signOut();
  Object.assign(state, {
    jobs: null,
    mascots: mascotsFromSharedRows([]),
    mascotsShared: null,
    linked: null,
    problem: null,
    said: null,
    push: await pushState(),
  });
  for (const kept of [state.taken, state.answered, state.seen, state.unfolded, state.drafts]) kept.clear();
  closeSheet({ instant: true });
  location.hash = "";
  hooks.show(true);
};

// What the sheet shows, so a poll draws it again only when that has changed.
let drawnAs = "";
const signature = () =>
  JSON.stringify([api.signedIn()?.email, state.push, state.linked, state.mascots.length, state.mascotsShared, appearance()]);

const draw = (problem = null) => {
  const body = sheetBody();
  if (sheetKind() !== "settings" || !body) return;
  drawnAs = signature();
  const email = api.signedIn()?.email ?? "";
  const hadKeyboard = body.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  body.replaceChildren(
    el(
      "div",
      { className: "acct" },
      el("span", { className: "acct-me", ariaHidden: "true", textContent: (email.charAt(0) || "?").toUpperCase() }),
      el(
        "div",
        { className: "w" },
        el("p", { className: "acct-name", textContent: email }),
        el("p", { className: "acct-sub", textContent: "Signed in on this phone" }),
      ),
    ),
    group("Look", look()),
    group("Notifications", notifications(), problem ? el("p", { className: "problem", role: "alert", textContent: problem }) : null),
    group("In the cloud", ...cloud()),
    el("button", { type: "button", className: "btn big raised wide sign-out", textContent: "Sign out", onclick: signOut }),
  );
  if (hadKeyboard) body.querySelector(`[data-key="${hadKeyboard}"]`)?.focus({ preventScroll: true });
};

export const openSettings = () => {
  openSheet({ kind: "settings", label: "Settings", onClose: () => hooks.show() });
  draw();
};

// A poll may have news for the cloud's row.
export const refreshSettings = () => {
  if (sheetKind() === "settings" && signature() !== drawnAs) draw();
};
