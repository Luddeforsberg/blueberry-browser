// How a label on a Nest's board names a card it's about, such as a line's source: by the card's title, which says what
// it found, or by its bird when it has no title yet. With every card Berry, the bird's name alone tells them apart by
// nothing. Shared by the chrome's labels and the words main and the chrome both build for what crosses a line.

// The most of a title a label shows, so a line stays short.
export const TITLE_IN_LABEL = 32;

// A card as labels name it. `titled` when it's the card's title, which reads as a quoted name rather than an owner.
export interface CardName {
  text: string;
  titled: boolean;
}

// A file's, page's or table's name is already its own, so a plain string is a name that's never a title.
export type Who = string | CardName;

// The card's title, cut on a character to fit with an ellipsis, or else what it goes by otherwise, usually its bird.
export const cardName = (
  title: string | null | undefined,
  otherwise: string,
): CardName => {
  const line = title?.replace(/\s+/g, " ").trim() ?? "";
  if (!line) return { text: otherwise, titled: false };
  const characters = [...line];
  const shown =
    characters.length > TITLE_IN_LABEL
      ? `${characters
          .slice(0, TITLE_IN_LABEL - 1)
          .join("")
          .trimEnd()}…`
      : line;
  return { text: `“${shown}”`, titled: true };
};

// "Scout", or "“12 candidates, 4 strong”".
export const named = (who: Who): string =>
  typeof who === "string" ? who : who.text;

// Something of a card's: "Scout’s answer", or "the “12 candidates, 4 strong” answer", since a title isn't an owner.
export const whose = (who: Who, thing: string): string =>
  typeof who !== "string" && who.titled
    ? `the ${who.text} ${thing}`
    : `${named(who)}’s ${thing}`;

// For words that start a sentence, such as "The “12 candidates” answer, 14 words".
export const capitalized = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);
