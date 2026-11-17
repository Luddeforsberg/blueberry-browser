import { flockFromRows } from "../shared.js";
import * as api from "./api.js";
import { bird, el, icon } from "./dom.js";
import { pushState } from "./push.js";
import { hooks, problemWords, state } from "./state.js";

// Signing in, on the ground: three of the mascots, what this is for, and email and password in a card. Drawn once, so
// what's typed stays.

// Who stands with Berry before anyone has signed in, so before their own flock is known: two of the berries.
const [BERRY] = flockFromRows([]);
const STANDING = [{ ...BERRY, name: "Lingon", look: { palette: "robin", accessory: "none" } }, BERRY, { ...BERRY, name: "Cloudberry", look: { palette: "canary", accessory: "none" } }];

export const mountSignIn = (app) => {
  const problem = el("div", { className: "problem-slot" });
  const email = el("input", { className: "field", type: "email", autocomplete: "username", required: true, id: "email", inputMode: "email", autocapitalize: "none", spellcheck: false });
  const password = el("input", { className: "field", type: "password", autocomplete: "current-password", required: true, id: "password" });
  const eye = el("button", {
    type: "button",
    className: "eye",
    ariaLabel: "Show password",
    ariaPressed: "false",
    onclick: () => {
      const showing = password.type === "password";
      password.type = showing ? "text" : "password";
      eye.setAttribute("aria-pressed", String(showing));
      eye.replaceChildren(icon(showing ? "eyeOff" : "eye"));
    },
  }, icon("eye"));
  const submit = el("button", { type: "submit", className: "btn big fill wide", textContent: "Sign in" });
  const form = el("form", {
    className: "form",
    onsubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      problem.replaceChildren();
      try {
        await api.signIn(email.value.trim(), password.value);
        state.linked = null;
        state.push = await pushState();
        location.hash = "";
        hooks.show(true);
        void hooks.load();
      } catch (error) {
        problem.replaceChildren(el("p", { className: "problem", role: "alert", textContent: error.status === 400 ? "That email and password don’t match an account." : problemWords(error) }));
        submit.disabled = false;
      }
    },
  },
  el("label", { htmlFor: "email", textContent: "Email" }),
  email,
  el("label", { htmlFor: "password", textContent: "Password" }),
  el("div", { className: "field-wrap" }, password, eye),
  problem,
  submit);
  app.replaceChildren(
    el("main", { className: "screen signin", dataLayer: "1" },
      el("div", { className: "dots tall", ariaHidden: "true" }),
      el("div", { className: "stage small", ariaHidden: "true" }, ...STANDING.map((mascot) => el("span", { className: `stand ${mascot === BERRY ? "front" : "side"}` }, bird(mascot, "rest", mascot === BERRY ? 84 : 52, { named: false })))),
      el("h1", { textContent: "Your mascots, from your phone" }),
      el("p", { className: "lead", textContent: "See what they’re doing in the cloud, answer when they ask, and give them a job while your computer is off." }),
      api.configured()
        ? el("div", { className: "shell" }, form)
        : el("p", { className: "problem", textContent: "This site isn’t connected to Blueberry’s server yet." }),
      el("p", { className: "foot", textContent: "The same account as Blueberry on your computer." })));
  return () => {};
};
