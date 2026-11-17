// How much of a berry is drawn at a size in pixels (DESIGN.md section 9, The six). From 48px everything; from 28px no
// texture, but the shine, the shade and the mouth; under that only the outline, what grows on top and heavier eyes.
export type MascotDetail = "full" | "mid" | "small";

export const mascotDetail = (size: number): MascotDetail =>
  size >= 48 ? "full" : size >= 28 ? "mid" : "small";
