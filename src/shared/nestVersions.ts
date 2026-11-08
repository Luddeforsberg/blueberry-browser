// Versions of one card: several takes on the same prompt, each its own thread, to compare and pick from. Shared by main,
// which checks every number here, and the card, which draws them.

// How many versions one card can have, sent together or added later with More like this.
export const MAX_VERSIONS = 5;
// How long a version's note can be, typed or suggested.
export const MAX_ANGLE_LENGTH = 160;

// A version's letter by its place: A, B, C…
export const versionLetter = (position: number): string => String.fromCharCode(65 + position);

// What a note means when it's left empty: the version should still differ.
export const NO_ANGLE = "Make this one clearly different from the others";

// What a version made by More like this is told, in code, with the letter of the one it's like.
export const moreLike = (letter: string): string => `More like version ${letter}`;

// Said before sending more than one, as For each row's Retry says it: each version runs on its own.
export const VERSIONS_WARNING = "Each version runs on its own, so anything it does, such as a click, happens once per version.";
