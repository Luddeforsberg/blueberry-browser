import type { ActorCommand } from "../../page/actor/command";
import type { ActorLook } from "../../page/actor/stage";
import { missing } from "../../shared/missing";
import { ACTOR_ART, ACTOR_ART_SHEET, ACTOR_BERRIES, type ArtNode } from "./pageActorArt";
import * as page from "./pageCode";
import { inPage } from "./pageScripts";

// The mascot drawn on a web page while a job works in it. What runs in the page is src/page/actor, which says how it stays
// out of the page's way and out of the agent's sight. This only picks its drawing and sends it the words.

export type { ActorCommand, ActorLook };

// The drawing holds every berry's parts, and the sheet shows the palette's own, as each palette is a berry. A page only
// needs that one: every other berry's parts, and their clips, are left out. A palette nobody knows keeps them all.
export const artFor = (node: ArtNode, palette: string): ArtNode => {
  if (!ACTOR_BERRIES.includes(palette)) return node;
  const others = ACTOR_BERRIES.filter((each) => each !== palette);
  const keep = ([tag, attributes]: ArtNode): boolean =>
    !(attributes["data-berry"] && attributes["data-berry"] !== palette) &&
    !(tag === "clipPath" && others.some((each) => attributes.id?.endsWith(`clip-${each}`)));
  const prune = ([tag, attributes, ...children]: ArtNode): ArtNode => [tag, attributes, ...children.filter(keep).map(prune)];
  return prune(node);
};

const posesFor = (accessory: string, palette: string): Record<string, ArtNode> => {
  const art = ACTOR_ART[accessory] ?? ACTOR_ART.none ?? missing("the art with no accessory");
  return Object.fromEntries(Object.entries(art).map(([pose, node]) => [pose, artFor(node, palette)]));
};

// Where the feet were on the last page, so the mascot carries on from there after a navigation.
// `hidden` while a capture is on its way.
export const installActor = (key: string, look: ActorLook, start: { x: number; y: number } | null, hidden: boolean): string =>
  inPage(page.installActor, { key, look, start, hidden, art: posesFor(look.accessory, look.palette), artSheet: ACTOR_ART_SHEET });

export const actorCommand = (key: string, name: ActorCommand, args: object = {}): string => inPage(page.actorCommand, { key, name, args });

export const beforeCapture = (): string => inPage(page.beforeCapture, undefined);

// For anything that shouldn't bring the mascot back if it isn't there.
export const ifThere = (name: ActorCommand, args: object = {}): string => inPage(page.ifThere, { name, args });
