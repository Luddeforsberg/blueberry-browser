import { fieldsOf } from "./fields";
import { siteOf } from "./sites";
import type { MascotAccessory, MascotDraft, MascotPalette, MascotProfile, MascotTool } from "./library";

// Runtime code shared by main and the chrome renderer. Preloads may only `import type` from here.

export const BERRY_ID = "berry";

// Each palette is a berry, by its id. `oldId` is what a look was saved as before that, and still is in mascots.json and
// suggestions.json from an older version, Gallery rows any version published, and the phone's shared mascots. A look is
// read through `paletteOf` wherever it comes from, so those keep their berry for good.
export const PALETTES: { id: MascotPalette; label: string; oldId: string }[] = [
  { id: "blueberry", label: "Blueberry", oldId: "kingfisher" },
  { id: "lingon", label: "Lingon", oldId: "robin" },
  { id: "cloudberry", label: "Cloudberry", oldId: "canary" },
  { id: "gooseberry", label: "Gooseberry", oldId: "parakeet" },
  { id: "raspberry", label: "Raspberry", oldId: "flamingo" },
  { id: "currant", label: "Currant", oldId: "jackdaw" },
];

export const paletteOf = (value: unknown): MascotPalette | null =>
  PALETTES.find(({ id, oldId }) => value === id || value === oldId)?.id ?? null;

// What mascots.json still gets: the old id, since an older version run on the same computer drops a mascot whose palette
// it doesn't know, and its next save loses it for good. Writing the new ids there is a later step, once going back no
// longer matters. The server gets the new ids, which it takes since 20261119000000_berry_palettes.sql.
export const paletteOnDisk = (palette: MascotPalette): string => PALETTES.find(({ id }) => id === palette)?.oldId ?? palette;

export const ACCESSORIES: { id: MascotAccessory; label: string }[] = [
  { id: "none", label: "Nothing" },
  { id: "crown", label: "Crown" },
  { id: "cap", label: "Cap" },
  { id: "glasses", label: "Glasses" },
  { id: "headphones", label: "Headphones" },
  { id: "bow", label: "Bow" },
];

export const MASCOT_TOOLS: { id: MascotTool; label: string; hint: string }[] = [
  { id: "visit", label: "Go to pages", hint: "Open tabs and follow addresses, on the sites it’s allowed." },
  { id: "click", label: "Click and choose", hint: "Press buttons, pick from dropdowns, drag things." },
  { id: "type", label: "Type", hint: "Fill in fields and press keys." },
];

// The first of the mascots. Always there, never limited, and it can't be changed or deleted.
export const BERRY: MascotProfile = {
  id: BERRY_ID,
  name: "Berry",
  // The blueberry, with nothing on.
  look: { palette: "blueberry", accessory: "none" },
  instructions: "",
  sites: [],
  tools: MASCOT_TOOLS.map(({ id }) => id),
  deletedAt: null,
};

export const MAX_MASCOT_NAME = 24;
export const MAX_MASCOT_INSTRUCTIONS = 2000;
const MAX_SITES = 20;

// A hostname from however it was typed, or null if it can't be one. A bare top-level name like "com" would let in far
// more than anyone meant, so it needs a dot, apart from localhost.
export const normaliseSite = (input: string): string | null => {
  const text = input.trim().toLowerCase().replace(/^\*\./, "");
  if (!text) return null;
  const host = siteOf(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`);
  return host !== null && (host.includes(".") || host === "localhost") ? host : null;
};

// The one rule for where a mascot may go. No list means no limit. With one, only http and https addresses on those
// hosts or their subdomains count, so a blank tab, a file or a data address is off-limits.
export const siteAllowed = (url: string, sites: readonly string[]): boolean => {
  if (sites.length === 0) return true;
  const host = siteOf(url);
  return host !== null && sites.some((site) => host === site || host.endsWith(`.${site}`));
};

// Where something may go when two lists both apply. It only ever gets narrower: with no overlap it can go nowhere,
// which an empty list wouldn't say, because that means no limit.
export const NOWHERE = "nowhere.invalid";

export const narrowSites = (first: readonly string[], second: readonly string[]): string[] => {
  if (first.length === 0) return [...second];
  if (second.length === 0) return [...first];
  const both = [
    ...first.filter((site) => siteAllowed(`https://${site}`, second)),
    ...second.filter((site) => siteAllowed(`https://${site}`, first)),
  ];
  return both.length > 0 ? [...new Set(both)] : [NOWHERE];
};

const isOneOf = <T extends string>(list: { id: T }[], value: unknown): value is T => list.some(({ id }) => id === value);

// What comes from the renderer or a saved file is checked here. Anything else on the object is dropped, so nothing
// can come in that the limits don't know about. Errors are worded for the form.
export const parseMascotDraft = (input: unknown): { draft: MascotDraft } | { error: string } => {
  const { name, look, instructions, sites, tools } = fieldsOf(input);
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) return { error: "Give it a name." };
  if (cleanName.length > MAX_MASCOT_NAME) return { error: `Keep the name under ${MAX_MASCOT_NAME} characters.` };
  const cleanInstructions = typeof instructions === "string" ? instructions.trim() : "";
  if (!cleanInstructions) return { error: "Say what it’s for." };
  if (cleanInstructions.length > MAX_MASCOT_INSTRUCTIONS) return { error: `Keep this under ${MAX_MASCOT_INSTRUCTIONS} characters.` };
  const { palette: savedPalette, accessory } = fieldsOf(look);
  const palette = paletteOf(savedPalette);
  if (!palette || !isOneOf(ACCESSORIES, accessory)) return { error: "Choose a look." };
  if (!Array.isArray(sites) || !Array.isArray(tools)) return { error: "Choose where it can go and what it can do." };
  if (sites.length > MAX_SITES) return { error: `Keep it to ${MAX_SITES} sites.` };
  const cleanSites: string[] = [];
  for (const site of sites) {
    const clean = typeof site === "string" ? normaliseSite(site) : null;
    if (!clean) return { error: `“${String(site)}” doesn’t look like a site. Try something like example.com.` };
    if (!cleanSites.includes(clean)) cleanSites.push(clean);
  }
  return {
    draft: {
      name: cleanName,
      look: { palette, accessory },
      instructions: cleanInstructions,
      sites: cleanSites,
      tools: MASCOT_TOOLS.map(({ id }) => id).filter((id) => tools.includes(id)),
    },
  };
};

const inList = (items: readonly string[]): string =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export interface PermissionLine {
  text: string;
  // True for what isn't limited, so a card can't look as safe as one that is.
  open: boolean;
}

// What a mascot may do, for the Gallery. It reads the same `sites` and `tools` the tool layer enforces, and nothing else.
export const permissionsInWords = ({ sites, tools }: Pick<MascotDraft, "sites" | "tools">): [PermissionLine, ...PermissionLine[]] => {
  const visits = tools.includes("visit");
  const clicks = tools.includes("click");
  const types = tools.includes("type");
  const where: PermissionLine =
    sites.length > 0
      ? { text: `Only ${visits ? "visits" : "reads"} ${inList(sites)}`, open: false }
      : { text: visits ? "Can search the web and go anywhere" : "Reads any page you have open", open: true };
  const hands: PermissionLine =
    clicks && types
      ? { text: "Can click and type", open: true }
      : clicks
        ? { text: "Can click, but can’t type", open: false }
        : types
          ? { text: "Can type, but can’t click", open: false }
          : { text: "Can’t type or click", open: false };
  // A click or a key can still follow a link, so without either is the only time it can't reach a new page at all.
  const noVisit = clicks || types ? "Can’t go to an address by itself" : "Can’t open pages by itself";
  return visits ? [where, hands] : [where, { text: noVisit, open: false }, hands];
};
