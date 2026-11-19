import { BERRY_ID } from "../../shared/mascots";
import { starterMascots } from "./mascotCatalog";
import type { MascotStore } from "./MascotStore";
import type { SettingsStore } from "../settings/SettingsStore";

// Four of the berries other than Berry's own blueberry, chosen to be of use to most people, since Berry and four is
// what the dock holds at its usual width. Each can do only less than Berry.
export const STARTER_IDS = ["plain-words", "competitor-watch", "meeting-prep", "newsletter-builder"] as const;

// A profile with only Berry gets these once, as copies from the Gallery, so they're ordinary mascots to edit or delete,
// and deleting them never brings them back. A profile with mascots of its own gets none.
export const addStarters = (
  mascots: Pick<MascotStore, "all" | "addFromGallery">,
  settings: Pick<SettingsStore, "get" | "update">,
): void => {
  if (settings.get().startersAdded) return;
  const own = mascots.all().filter((mascot) => mascot.id !== BERRY_ID && mascot.deletedAt === null);
  if (own.length === 0) {
    const catalog = starterMascots();
    for (const id of STARTER_IDS) {
      const entry = catalog.find((candidate) => candidate.id === id);
      if (entry) mascots.addFromGallery(entry.id, entry.draft);
    }
  }
  settings.update({ startersAdded: true });
};
