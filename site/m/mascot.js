import "../theme.js";
import { BIRDS } from "../birds.js";
import { GET_BLUEBERRY_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config.js";
import { isUuid, parsePublishedRow, permissionsInWords } from "../shared.js";

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

const say = (words) => page.replaceChildren(el("p", { className: "muted", textContent: words }));

const bird = ({ look, name }) => {
  const holder = el("div", { className: "bird" });
  holder.innerHTML = BIRDS[look.accessory];
  const drawing = holder.querySelector("svg");
  drawing.dataset.mascot = look.palette;
  drawing.setAttribute("aria-label", `A bird called ${name}`);
  return holder;
};

const get = () => el("a", { className: "button", href: GET_BLUEBERRY_URL, textContent: "Get Blueberry" });

const show = ({ draft, author, description, example, addCount }) => {
  document.title = `${draft.name}, a mascot for Blueberry`;
  const permissions = el("ul", {}, ...permissionsInWords(draft).map(({ text, open }) => el("li", { className: open ? "open" : "", textContent: `${open ? "Not limited: " : ""}${text}` })));
  page.replaceChildren(
    el("div", { className: "top" },
      bird(draft),
      el("h1", { textContent: draft.name }),
      el("p", { className: "muted", textContent: `By ${author} · ${addCount === 1 ? "1 add" : `${addCount} adds`}` }),
      el("p", { textContent: description }),
      get()),
    el("section", {}, el("h2", { textContent: "What it’s allowed to do" }), permissions,
      el("p", { className: "muted", textContent: "Anywhere else is refused before anything happens, and it asks before anything risky, like any mascot." })),
    el("section", {}, el("h2", { textContent: "What it’s told, word for word" }), el("p", { className: "words", textContent: draft.instructions })),
    ...(example
      ? [el("section", {}, el("h2", { textContent: "An example" }),
          el("h3", { textContent: "I asked this" }), el("p", { className: "words", textContent: example.prompt }),
          el("h3", { textContent: "And here’s what it gave me" }), el("p", { className: "words", textContent: example.answer }))]
      : []),
    el("section", {}, el("p", { className: "muted", textContent: "Someone using Blueberry wrote this, and we haven’t checked it. Adding it gives you your own copy, which nothing here can change." })),
  );
};

const load = async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return say("This site isn’t connected to the Gallery yet.");
  if (!isUuid(id)) return say("There’s no mascot at this address.");
  let rows;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/mascots?select=${COLUMNS}&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!response.ok) throw new Error(`Answered ${response.status}`);
    rows = await response.json();
  } catch {
    return say("Couldn’t reach the Gallery. Try again in a moment.");
  }
  const mascot = parsePublishedRow(rows[0]);
  if (!mascot) return say("This mascot isn’t in the Gallery any more.");
  return show(mascot);
};

void load();
