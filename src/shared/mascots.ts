import type { MascotAccessory, MascotDraft, MascotPalette, MascotProfile, MascotTool } from "./library";

// Runtime code shared by main and the chrome renderer. Preloads may only `import type` from here.

export const BERRY_ID = "berry";

export const PALETTES: { id: MascotPalette; label: string }[] = [
  { id: "jackdaw", label: "Jackdaw" },
  { id: "robin", label: "Robin" },
  { id: "canary", label: "Canary" },
  { id: "parakeet", label: "Parakeet" },
  { id: "flamingo", label: "Flamingo" },
  { id: "kingfisher", label: "Kingfisher" },
];

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

// The first of the flock. Always there, never limited, and it can't be changed or deleted.
export const BERRY: MascotProfile = {
  id: BERRY_ID,
  name: "Berry",
  look: { palette: "jackdaw", accessory: "none" },
  instructions: "",
  sites: [],
  tools: MASCOT_TOOLS.map(({ id }) => id),
  deletedAt: null,
};

export const MAX_MASCOT_NAME = 24;
export const MAX_MASCOT_INSTRUCTIONS = 2000;
const MAX_SITES = 20;

const stripWww = (host: string) => host.replace(/^www\./, "");

// A hostname from however it was typed, or null if it can't be one. A bare top-level name like "com" would let in far
// more than anyone meant, so it needs a dot, apart from localhost.
export const normaliseSite = (input: string): string | null => {
  const text = input.trim().toLowerCase().replace(/^\*\./, "");
  if (!text) return null;
  try {
    const { hostname, protocol } = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`);
    if (protocol !== "http:" && protocol !== "https:") return null;
    const host = stripWww(hostname);
    return host.includes(".") || host === "localhost" ? host : null;
  } catch {
    return null;
  }
};

// The one rule for where a mascot may go. No list means no limit. With one, only http and https addresses on those
// hosts or their subdomains count, so a blank tab, a file or a data address is off-limits.
export const siteAllowed = (url: string, sites: readonly string[]): boolean => {
  if (sites.length === 0) return true;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return false;
    const host = stripWww(hostname.toLowerCase());
    return sites.some((site) => host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
};

// Where something may go when two lists both apply. It only ever gets narrower: with no overlap it can go nowhere,
// which an empty list wouldn't say, because that means no limit.
export const NOWHERE = "nowhere.invalid";

export const narrowSites = (first: readonly string[], second: readonly string[]): string[] => {
  if (first.length === 0) return [...second];
  if (second.length === 0) return [...first];
  const both = [...first.filter((site) => siteAllowed(`https://${site}`, second)), ...second.filter((site) => siteAllowed(`https://${site}`, first))];
  return both.length > 0 ? [...new Set(both)] : [NOWHERE];
};

const isOneOf = <T extends string>(list: { id: T }[], value: unknown): value is T => list.some(({ id }) => id === value);

// What comes from the renderer or a saved file is checked here. Anything else on the object is dropped, so nothing
// can come in that the limits don't know about. Errors are worded for the form.
export const parseMascotDraft = (input: unknown): { draft: MascotDraft } | { error: string } => {
  const { name, look, instructions, sites, tools } = (input ?? {}) as Record<string, unknown>;
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) return { error: "Give it a name." };
  if (cleanName.length > MAX_MASCOT_NAME) return { error: `Keep the name under ${MAX_MASCOT_NAME} characters.` };
  const cleanInstructions = typeof instructions === "string" ? instructions.trim() : "";
  if (!cleanInstructions) return { error: "Say what it’s for." };
  if (cleanInstructions.length > MAX_MASCOT_INSTRUCTIONS) return { error: `Keep this under ${MAX_MASCOT_INSTRUCTIONS} characters.` };
  const { palette, accessory } = (look ?? {}) as Record<string, unknown>;
  if (!isOneOf(PALETTES, palette) || !isOneOf(ACCESSORIES, accessory)) return { error: "Choose a look." };
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

// What it can do, in words, for its card and the live preview.
export const sitesInWords = (sites: readonly string[]): string => {
  if (sites.length === 0) return "Any site";
  return sites.length === 1 ? `Only ${sites[0]}` : `Only ${sites[0]} and ${sites.length - 1} more`;
};

const TOOL_VERBS: Record<MascotTool, string> = { visit: "visits", click: "clicks", type: "types" };

export const toolsInWords = (tools: readonly MascotTool[]): string => {
  const can = MASCOT_TOOLS.filter(({ id }) => tools.includes(id));
  if (can.length === 0) return "Only reads";
  return `Reads, ${can.map(({ id }) => TOOL_VERBS[id]).join(", ")}`;
};

const inList = (items: readonly string[]): string =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export interface PermissionLine {
  text: string;
  // True for what isn't limited, so a card can't look as safe as one that is.
  open: boolean;
}

// What a mascot may do, for the Gallery. It reads the same `sites` and `tools` the tool layer enforces, and nothing else.
export const permissionsInWords = ({ sites, tools }: Pick<MascotDraft, "sites" | "tools">): PermissionLine[] => {
  const visits = tools.includes("visit");
  const clicks = tools.includes("click");
  const types = tools.includes("type");
  const where: PermissionLine =
    sites.length > 0
      ? { text: `Only ${visits ? "visits" : "reads"} ${inList(sites)}`, open: false }
      : { text: visits ? "Can go anywhere" : "Reads any page you have open", open: true };
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
