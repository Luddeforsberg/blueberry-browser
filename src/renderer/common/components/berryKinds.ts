import type { MascotPalette } from "@shared/library";

// DESIGN.md section 9: the six berries. Each is drawn on a 48-unit square, body bottom at 46.
export type BerryKind = "blueberry" | "lingon" | "cloudberry" | "gooseberry" | "raspberry" | "currant";

// A look is saved by its old palette id, in files, published rows and the phone's flock, so the ids stay and each
// draws as the berry nearest the colour its owner chose. Berry is the blueberry.
export const BERRY_KIND: Record<MascotPalette, BerryKind> = {
  kingfisher: "blueberry",
  robin: "lingon",
  canary: "cloudberry",
  parakeet: "gooseberry",
  flamingo: "raspberry",
  jackdaw: "currant",
};
