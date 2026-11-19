// Why an action needed the user's leave, as a code. Each is one rule in `askFirst.ts`, a tool's own `whyRisky`,
// `pageScripts.ts` or `agent.ts`, and the words a person reads are chosen from it on screen, so nothing the model or a
// page wrote is ever one.
export const ASK_REASONS = [
  // Ask before acting is set to always.
  "always-ask",
  // A drag or a dropdown, which ask whatever they are, because a page can make either do anything.
  "tool-always-asks",
  // A name or password in the address. Marks the `name:password@` part.
  "credentials",
  // Text going out that could carry data: an address's query and fragment, or a web search that isn't plain. Marks it.
  "carries-data",
  // An address whose path or host name looks like data, such as a token or an escape. Marks that path or host.
  "looks-like-data",
  // A new subdomain of a site the job has only been to, whose owner can read the name. Marks the host.
  "new-subdomain",
  // A site the job has no reason to be on. Marks the host.
  "new-site",
  // An element inside a frame from another site, which can say anything about itself. Marks that site's origin.
  "other-origin-frame",
  // A control with no name, which could do anything.
  "unnamed",
  // A control whose name says it changes or sends something, such as Delete or Buy. Marks that word.
  "risky-word",
  // A password, code or card field.
  "secret-field",
  // A control nobody can see.
  "hidden",
  // A checkbox or switch.
  "toggle",
  // It sends a form that posts, or one with a password in it.
  "sends-form",
  // Typing anywhere but a search box.
  "not-search",
  // Typing more than a search's worth of text.
  "long-text",
  // A key that can submit or change something, such as Enter.
  "risky-key",
] as const;

export type AskReason = (typeof ASK_REASONS)[number];

// Why one call asks. `mark` is the piece of the card's words the reason is about.
export interface AskWhy {
  reason: AskReason;
  mark?: string;
}

const isReason = (value: unknown): value is AskReason => ASK_REASONS.includes(value as AskReason);

// What goes on the card with these exact words: a known reason, and a mark only if it's in them verbatim.
export const whyOnCard = (text: string, why: unknown): AskWhy | null => {
  const { reason, mark } = (why ?? {}) as { reason?: unknown; mark?: unknown };
  if (!isReason(reason)) return null;
  return typeof mark === "string" && mark !== "" && text.includes(mark) ? { reason, mark } : { reason };
};
