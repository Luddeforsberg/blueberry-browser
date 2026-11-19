// A mascot, what it remembers, and the Gallery it can be published to. Part of library.ts, which everything imports it
// from.

// Which of the six berries a mascot is (DESIGN.md section 9), and one accessory. Berry is always the blueberry.
export type MascotPalette = "blueberry" | "lingon" | "cloudberry" | "gooseberry" | "raspberry" | "currant";
export type MascotAccessory = "none" | "crown" | "cap" | "glasses" | "headphones" | "bow";

export interface MascotLook {
  palette: MascotPalette;
  accessory: MascotAccessory;
}

// What a mascot may do beyond reading pages, as named switches rather than a list of tools, so a saved mascot means
// the same thing when the tools change.
export type MascotTool = "visit" | "click" | "type";

// What the user fills in. Plain data, so a mascot can be saved, and later published, as it is.
export interface MascotDraft {
  name: string;
  look: MascotLook;
  // In the user's words: what it's for and how it should work. Goes into the prompt, marked as theirs.
  instructions: string;
  // The sites it may use, as hostnames, each with its subdomains. Empty means it isn't limited to any.
  sites: string[];
  tools: MascotTool[];
}

export interface MascotProfile extends MascotDraft {
  id: string;
  // A deleted mascot stays on file, so its chats keep their look and, above all, their limits.
  deletedAt: number | null;
  // The Gallery entry this is a copy of, only so the Gallery can say it's added. The copy never reads from the entry.
  galleryId?: string;
  // Its row on the Gallery's server, if the user published it. Saving here doesn't change that row.
  publishedId?: string;
  // Choosing it turns on Do this in the cloud. Only the user's own choice here, so it's never published or shared.
  worksInCloud?: boolean;
}

// Something one mascot remembers about how the user likes things done, because they pressed Remember. It's kept apart from
// the mascot, in a file of its own, so nothing that copies or publishes a mascot can take it along.
export interface MemoryFact {
  id: string;
  mascotId: string;
  // Exactly what the user saw, and exactly what the model reads.
  text: string;
  // The one site it's about, as a hostname. Null if it's about how they like things anywhere.
  site: string | null;
  savedAt: number;
}

// What a mascot would like to remember, waiting for the user. It's not memory, and nothing reads it but the screen it's on.
export interface MemoryOffer {
  id: string;
  mascotId: string;
  // The chat or routine run it came after.
  sourceId: string;
  text: string;
  site: string | null;
}

export interface MemoryState {
  facts: MemoryFact[];
  offers: MemoryOffer[];
}

export type MemoryResult = { ok: true } | { ok: false; error: string };

// "I asked this, and here's what it gave me". Plain text everywhere it shows, never rendered as markdown.
export interface MascotExample {
  prompt: string;
  answer: string;
}

// One card in the Gallery. Add makes a copy of `draft`, and only `draft`, through the same checks as a hand-made mascot.
export interface GalleryMascot {
  id: string;
  author: string;
  category: string;
  // One line on what it does. Its limits come from `draft`, in `permissionsInWords`.
  description: string;
  draft: MascotDraft;
  // Starters only have one from a real run. Left out, there's none to show.
  example?: MascotExample | null;
  // These are for what people published. A starter has no server row, so it has no count to show.
  addCount?: number;
  publishedAt?: number;
  // Its public page, once the site's address is set.
  link?: string | null;
  // Set by main on everything it sends the page, from what a copy would be made of. Add names it back.
  version?: string;
}

// What the Gallery page shows, and whether the published ones are among it. "starters" means no server is set up, so
// there's nothing to report. "unreachable" means one is, and it couldn't be read.
export interface GalleryListing {
  entries: GalleryMascot[];
  status: "starters" | "live" | "unreachable";
}

// One entry a link asked for, from the server. Null when it isn't there, or can't be asked.
export interface GalleryLinked {
  entry: GalleryMascot | null;
  status: GalleryListing["status"];
}

// What the user chooses when publishing. The rest of what goes public is read from the mascot in main.
export interface PublishChoices {
  author: string;
  description: string;
  category: string;
  example: MascotExample | null;
}

export type PublishResult = { ok: true; id: string; link: string | null } | { ok: false; error: string };

// One of the user's own, for Settings and for publishing again.
export interface PublishedMascot extends PublishChoices {
  id: string;
  name: string;
  addCount: number;
  link: string | null;
  // We took it out of the Gallery, from the dashboard.
  hidden: boolean;
}
