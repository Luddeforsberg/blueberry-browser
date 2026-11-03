import "../theme.js";
import { BIRDS } from "../birds.js";
import { GET_BLUEBERRY_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config.js";
import { isUuid, parsePublishedRow, permissionsInWords, plainFromMarkdown } from "../shared.js";

const COLUMNS = "id,name,palette,accessory,description,category,instructions,sites,tools,author_name,example_prompt,example_answer,add_count,created_at";

// Everything from the server was written by a stranger, so it only ever goes in as text. The one piece of markup is our
// own drawing, chosen by a key that has already been checked.
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
};

const page = document.getElementById("page");

const say = (title, words) => page.replaceChildren(el("h1", { textContent: title }), el("p", { className: "lede muted", textContent: words }), el("div", { className: "actions" }, el("a", { className: "button outline", href: GET_BLUEBERRY_URL, textContent: "About Blueberry" })));

const bird = ({ look, name }) => {
  const holder = el("div", { className: "bird" });
  holder.innerHTML = BIRDS[look.accessory];
  const drawing = holder.querySelector("svg");
  drawing.dataset.mascot = look.palette;
  drawing.setAttribute("aria-label", `A bird called ${name}`);
  return holder;
};

// Lucide's lock and open lock, as the app draws them, made element by element.
const SVG = "http://www.w3.org/2000/svg";
const lock = (open) => {
  const icon = document.createElementNS(SVG, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("class", "icon");
  icon.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(SVG, "rect");
  for (const [key, value] of Object.entries({ x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 })) body.setAttribute(key, String(value));
  const shackle = document.createElementNS(SVG, "path");
  shackle.setAttribute("d", open ? "M7 11V7a5 5 0 0 1 9.9-1" : "M7 11V7a5 5 0 0 1 10 0v4");
  icon.append(body, shackle);
  return icon;
};

const show = ({ id, draft, author, description, example, addCount }) => {
  document.title = `${draft.name}, a mascot for Blueberry`;
  const permissions = el("ul", { className: "permissions" }, ...permissionsInWords(draft).map(({ text, open }) => el("li", {}, lock(open), text)));
  page.replaceChildren(
    el("header", { className: "hero" },
      el("div", { className: "hero-text" },
        el("h1", { textContent: draft.name }),
        el("p", { className: "meta", textContent: `By ${author} · ${addCount === 1 ? "1 add" : `${addCount} adds`}` }),
        el("p", { className: "lede", textContent: description }),
        el("div", { className: "actions" },
          // Only this mascot's id, checked as a uuid. Blueberry shows it for review and adds nothing by itself.
          el("a", { className: "button", href: `blueberry://mascot/${id}`, textContent: "Open in Blueberry" }),
          el("a", { className: "button outline", href: GET_BLUEBERRY_URL, textContent: "Get Blueberry" })),
        el("p", { className: "small", textContent: "Blueberry shows you all of this again, and nothing is added until you press Add. Don’t have it? It isn’t out for download yet." })),
      bird(draft)),
    el("section", {}, el("h2", { textContent: "What it’s allowed to do" }), permissions,
      el("p", { className: "small", textContent: `${draft.sites.length > 0 ? "A site includes its subdomains, and it can’t use any other site. " : ""}It asks before anything risky, with the same approval cards as Berry.` })),
    el("section", {}, el("h2", { textContent: "What it’s told, word for word" }), el("p", { className: "words", textContent: draft.instructions })),
    ...(example
      ? [el("section", {}, el("h2", { textContent: "An example" }),
          el("h3", { textContent: "I asked this" }), el("p", { className: "words", textContent: example.prompt }),
          el("h3", { textContent: "And here’s what it gave me" }), el("p", { className: "words", textContent: plainFromMarkdown(example.answer) }))]
      : []),
    el("section", {}, el("p", { className: "muted", textContent: "Someone using Blueberry wrote this, and we haven’t checked it. Adding it gives you your own copy, which nothing here can change." })),
  );
};

const load = async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return say("Not connected yet", "This site isn’t connected to the Gallery yet.");
  if (!isUuid(id)) return say("No mascot here", "There’s no mascot at this address. Check the link you were sent.");
  let rows;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/mascots?select=${COLUMNS}&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!response.ok) throw new Error(`Answered ${response.status}`);
    rows = await response.json();
  } catch {
    return say("Couldn’t reach the Gallery", "Try again in a moment.");
  }
  const mascot = parsePublishedRow(rows[0]);
  if (!mascot) return say("Not in the Gallery any more", "Its author may have taken it down.");
  return show(mascot);
};

void load();
