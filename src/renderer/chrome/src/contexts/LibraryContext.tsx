import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LibrarySnapshot, MascotProfile } from "@shared/library";
import { BERRY, BERRY_ID } from "@shared/mascots";

const EMPTY: LibrarySnapshot = {
  pinned: [],
  bookmarks: [],
  chats: [],
  routines: [],
  mascots: [BERRY],
  needsYou: [],
  memory: { facts: [], offers: [] },
};

const LibraryContext = createContext<LibrarySnapshot>(EMPTY);

export const useLibrary = () => useContext(LibraryContext);

const ChosenContext = createContext<{ chosenId: string; choose: (id: string) => void }>({ chosenId: BERRY_ID, choose: () => undefined });

// The flock, and who the next new chat runs as. Chosen on any composer, and shown on all of them.
export const useFlock = () => {
  const { mascots } = useLibrary();
  const { chosenId, choose } = useContext(ChosenContext);
  return useMemo(() => {
    const flock = mascots.filter((mascot) => mascot.deletedAt === null);
    // Only for showing who something runs as. What it may do is decided in main.
    const find = (id: string | null): MascotProfile =>
      mascots.find((mascot) => mascot.id === (id ?? BERRY_ID)) ?? { ...BERRY, id: id ?? BERRY_ID, name: "A lost mascot" };
    return { flock, find, choose, chosen: flock.find((mascot) => mascot.id === chosenId) ?? BERRY };
  }, [mascots, chosenId, choose]);
};

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY);
  const [chosenId, setChosenId] = useState(BERRY_ID);
  // Saved, because the bird on the desktop goes by it too, and a mascot's card over the page chooses from another view.
  const choose = useCallback((id: string) => {
    setChosenId(id);
    void window.chromeAPI.mascots.choose(id === BERRY_ID ? null : id);
  }, []);
  const chosen = useMemo(() => ({ chosenId, choose }), [chosenId, choose]);

  useEffect(() => {
    const api = window.chromeAPI.library;
    api
      .getLibrary()
      .then(setLibrary)
      .catch((error) => console.error("Failed to load library:", error));
    void window.chromeAPI.settings.getSettings().then(({ chosenMascotId }) => setChosenId(chosenMascotId ?? BERRY_ID));
    // Chosen in another view, it's chosen here too.
    const unfollow = window.chromeAPI.settings.onSettingsUpdated(({ chosenMascotId }) => setChosenId(chosenMascotId ?? BERRY_ID));
    const unsubscribe = api.onLibraryUpdated(setLibrary);
    return () => {
      unfollow();
      unsubscribe();
    };
  }, []);

  return (
    <LibraryContext.Provider value={library}>
      <ChosenContext.Provider value={chosen}>{children}</ChosenContext.Provider>
    </LibraryContext.Provider>
  );
};
