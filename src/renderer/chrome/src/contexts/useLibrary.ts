import { createContext, useContext, useMemo } from "react";
import type { LibrarySnapshot, MascotProfile } from "@shared/library";
import { BERRY, BERRY_ID } from "@shared/mascots";

export const EMPTY: LibrarySnapshot = {
  pinned: [],
  bookmarks: [],
  chats: [],
  routines: [],
  mascots: [BERRY],
  needsYou: [],
  memory: { facts: [], offers: [] },
};

export const LibraryContext = createContext<LibrarySnapshot>(EMPTY);

export const useLibrary = () => useContext(LibraryContext);

export const ChosenContext = createContext<{ chosenId: string; choose: (id: string) => void }>({
  chosenId: BERRY_ID,
  choose: () => undefined,
});

// The mascots, and who the next new chat runs as. Chosen on any composer, and shown on all of them.
export const useMascots = () => {
  const { mascots } = useLibrary();
  const { chosenId, choose } = useContext(ChosenContext);
  return useMemo(() => {
    const current = mascots.filter((mascot) => mascot.deletedAt === null);
    // Only for showing who something runs as. What it may do is decided in main.
    const find = (id: string | null): MascotProfile =>
      mascots.find((mascot) => mascot.id === (id ?? BERRY_ID)) ?? { ...BERRY, id: id ?? BERRY_ID, name: "A lost mascot" };
    return { mascots: current, find, choose, chosen: current.find((mascot) => mascot.id === chosenId) ?? BERRY };
  }, [mascots, chosenId, choose]);
};
