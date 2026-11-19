import type { MascotPalette } from "@shared/library";

// Colours are the mascots' own tokens, as attributes, so a drawing copied out of the app keeps them without styles.
export const c = (token: string) => `var(--berry-${token})`;
export const EYE = c("eye");
export const WHITE = "#fff";

// The ids of a drawing's gradients, mask and clips. Many drawings share a document, so each has its own.
export interface Ids {
  shade: string;
  fade: string;
  fadeGradient: string;
  clip: (kind: MascotPalette) => string;
}
export const url = (id: string) => `url(#${id})`;
