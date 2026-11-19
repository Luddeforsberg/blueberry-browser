import type { Point } from "../lib/dom";

// The mascot drawn on a web page while a job works in it, run in the same isolated world as the tools. Everything about it
// keeps it out of the page's way and out of the agent's sight:
// - A closed shadow root, so neither the page nor `list_elements` can reach into it.
// - No box and no pointer events, so nothing can land on it and `elementFromPoint` goes through it.
// - The line's words are in a pseudo-element, which `innerText` leaves out, so `read_page` can't pick them up.
// - A constructed stylesheet and elements made one by one, so a strict CSP or Trusted Types has nothing to refuse.
// - The top layer, so a page's own stacking, transforms and modal dialogs can't cover it or shift it.
// It only draws. Nothing in here can stop a job or send anything anywhere, so a page faking anything here gains nothing.

export type ArtNode = [tag: string, attributes: Record<string, string>, ...children: ArtNode[]];

export interface ActorLook {
  palette: string;
  accessory: string;
  dark: boolean;
  plain: boolean;
  still: boolean;
  // The page's zoom, so the mascot stays one size on screen.
  zoom: number;
  size: number;
  // Drawn for a picture of the page in the chat, not for anyone looking at the page.
  pictured: boolean;
}

export interface Stage {
  host: HTMLElement;
  sky: HTMLDivElement;
  mascot: HTMLDivElement;
  flip: HTMLDivElement;
  body: HTMLDivElement;
  line: HTMLDivElement;
  poses: Record<string, Element>;
}

// Everything that changes as the mascot moves, shared by the parts that move it.
export interface Actor {
  look: ActorLook;
  stage: Stage;
  pose: string | null;
  spot: Point | null;
  facing: number;
  anchor: { el: Element; dx: number; dy: number } | null;
  flight: Animation | null;
  reading: number;
  nod: Animation | null;
  leaving: ReturnType<typeof setTimeout> | null;
  covered: boolean;
  // What a flight from `go` lands as, which a job stopping to ask can still change on the way.
  landingPose: string | null;
  // What the mascot is here to do, which the line keeps clear of, and the line's place from the feet.
  target: Element | null;
  lineAt: { x: number; y: number; width: number; height: number } | null;
}

const SVG = "http://www.w3.org/2000/svg";

export const div = (name: string, parent: ParentNode): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = name;
  parent.append(el);
  return el;
};

const draw = ([tag, attributes, ...children]: ArtNode): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "style") el.style.cssText = value;
    else el.setAttribute(name, value);
  }
  for (const child of children) el.append(draw(child));
  return el;
};

export const buildStage = (look: ActorLook, art: { poses: Record<string, ArtNode>; pointer: ArtNode }, sheetText: string): Stage => {
  const host = document.createElement("blueberry-actor");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  if ("showPopover" in host) host.setAttribute("popover", "manual");
  const root = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(sheetText);
  root.adoptedStyleSheets = [sheet];

  const sky = div("sky", root);
  if (look.dark) sky.classList.add("dark");
  if (look.pictured) sky.classList.add("pictured");
  sky.dataset.mascot = look.palette;
  sky.style.setProperty("--unit", String(1 / look.zoom));
  const mascot = div("mascot", sky);
  const flip = div("flip", mascot);
  const body = div("body", flip);
  const line = div("line", mascot);
  const poses: Record<string, Element> = {};
  const addPose = (name: string, drawing: ArtNode, extra: string): void => {
    const el = draw(drawing);
    el.setAttribute("class", "pose " + extra);
    el.setAttribute("data-pose", name);
    body.append(el);
    poses[name] = el;
  };
  if (look.plain) {
    addPose("pointer", art.pointer, "pointer-pose");
  } else {
    for (const [name, drawing] of Object.entries(art.poses)) addPose(name, drawing, name === "sitting" ? "seated" : "");
  }
  return { host, sky, mascot, flip, body, line, poses };
};
