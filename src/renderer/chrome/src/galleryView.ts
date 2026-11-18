import type { GalleryMascot, MascotPalette } from "@shared/library";
// Relative because the unit tests have no alias for them.
import { MAX_MASCOT_NAME, permissionsInWords } from "../../../shared/mascots";
import { GALLERY_CATEGORIES } from "../../../shared/publishing";

// What's typed in the search and the kind of job chosen. Which mascot is open lives in the tab's param
// (`galleryPlaces.ts`), so Back and a restored session find it.
export interface GalleryView {
  query: string;
  // Null shows every kind.
  category: string | null;
}

export const GALLERY_VIEW_EVENT = "blueberry:gallery-view";

// Lasts while the page isn't showing, so going to another tab doesn't lose your place.
let current: GalleryView = { query: "", category: null };

export const galleryView = () => current;

export const setGalleryView = (patch: Partial<GalleryView>) => {
  current = { ...current, ...patch };
  window.dispatchEvent(new Event(GALLERY_VIEW_EVENT));
};

// How many `blueberry://mascot/` links have come, so the same one twice asks the server again.
let linkAsks = 0;
export const galleryLinkAsks = () => linkAsks;

// Main has already checked the id is a uuid and put it in the tab's param. A link only opens that entry's page, where
// adding still takes Add.
export const linkCame = () => {
  linkAsks += 1;
  setGalleryView({ query: "", category: null });
};

// A starter has no server row, so it has no date or count. Everything else was published by someone.
export const fromPeople = (entry: GalleryMascot) => entry.publishedAt !== undefined;

// Cards use a curly apostrophe, and keyboards type a straight one.
const forSearch = (text: string) => text.toLowerCase().replace(/’/g, "'");

// Every word has to be in its name, its line, what it's told or a site it may visit, so "svt read" narrows rather
// than widens.
export const filterGallery = (entries: readonly GalleryMascot[], query: string, category: string | null): GalleryMascot[] => {
  const words = forSearch(query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (category !== null && entry.category !== category) return false;
    const { name, instructions, sites } = entry.draft;
    const text = forSearch([name, entry.description, instructions, ...sites].join(" "));
    return words.every((word) => text.includes(word));
  });
};

const byAdds = (a: GalleryMascot, b: GalleryMascot) => (b.addCount ?? 0) - (a.addCount ?? 0) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0);

// People's first, the most added first and then the newest, then Blueberry's in the order they come.
export const sortGallery = (entries: readonly GalleryMascot[]): GalleryMascot[] => [
  ...entries.filter(fromPeople).sort(byAdds),
  ...entries.filter((entry) => !fromPeople(entry)),
];

// The kinds of job that have any, each with how many, in the order publishing offers them.
export const galleryKinds = (entries: readonly GalleryMascot[]): { kind: string; count: number }[] => {
  const known = [...GALLERY_CATEGORIES, ...entries.map((entry) => entry.category)];
  return [...new Set(known)]
    .map((kind) => ({ kind, count: entries.filter((entry) => entry.category === kind).length }))
    .filter(({ count }) => count > 0);
};

export interface GalleryGroup {
  key: "people" | "blueberry" | "found";
  label: string;
  entries: GalleryMascot[];
}

// While searching it's one group with how many were found. Otherwise people's and Blueberry's, each only if it has any.
export const galleryGroups = (entries: readonly GalleryMascot[], query: string, category: string | null): GalleryGroup[] => {
  const shown = sortGallery(filterGallery(entries, query, category));
  if (query.trim()) return [{ key: "found", label: `${shown.length} found`, entries: shown }];
  const groups: GalleryGroup[] = [
    { key: "people", label: "From people", entries: shown.filter(fromPeople) },
    { key: "blueberry", label: "From Blueberry", entries: shown.filter((entry) => !fromPeople(entry)) },
  ];
  return groups.filter((group) => group.entries.length > 0);
};

// How many times a person's was added, for its tile ("Sam K. · 1,204 adds") and its page ("1,204 times").
const counted = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
export const addsLine = (entry: GalleryMascot) => `${entry.author} · ${counted(entry.addCount ?? 0, "add", "adds")}`;

export interface GalleryFact {
  label: "Made by" | "Added" | "Visits" | "Can" | "Kind of job";
  // A line each, and `limited` only for a real limit, which is the only one with a padlock.
  lines: { text: string; limited: boolean }[];
  mono?: boolean;
}

// The facts on a mascot's page. Where it goes and what it can do are `permissionsInWords`, read from the sites and tools
// the tool layer enforces, never from what the entry says about itself. A starter has no count, so no Added.
export const galleryFacts = (entry: GalleryMascot): GalleryFact[] => {
  const [where, ...hands] = permissionsInWords(entry.draft).map(({ text, open }) => ({ text, limited: !open }));
  const plain = (text: string) => [{ text, limited: false }];
  return [
    { label: "Made by", lines: plain(entry.author) },
    ...(fromPeople(entry) ? [{ label: "Added" as const, lines: plain(counted(entry.addCount ?? 0, "time", "times")), mono: true }] : []),
    { label: "Visits", lines: [where] },
    { label: "Can", lines: hands },
    { label: "Kind of job", lines: plain(entry.category) },
  ];
};

// The Gallery tells mascots apart by their berry, so it names each one in full.
export const BERRY_NAMES: Record<MascotPalette, string> = {
  kingfisher: "Blueberry",
  robin: "Lingonberry",
  canary: "Cloudberry",
  parakeet: "Gooseberry",
  flamingo: "Raspberry",
  jackdaw: "Blackcurrant",
};

// A name that's free, to start from when the entry's own is taken: Scout, then Scout 2. It stays within the limit.
export const freeName = (name: string, taken: readonly string[]): string => {
  const lower = taken.map((other) => other.toLowerCase());
  if (!lower.includes(name.toLowerCase())) return name;
  for (let number = 2; ; number++) {
    const suffix = ` ${number}`;
    const next = `${name.slice(0, MAX_MASCOT_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!lower.includes(next.toLowerCase())) return next;
  }
};
