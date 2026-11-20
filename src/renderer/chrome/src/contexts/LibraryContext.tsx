import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { LibrarySnapshot } from "@shared/library";
import { BERRY_ID } from "@shared/mascots";
import { ChosenContext, EMPTY, LibraryContext } from "./useLibrary";

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY);
  const [chosenId, setChosenId] = useState(BERRY_ID);
  // Saved, because the mascot on the desktop goes by it too, and a mascot's card over the page chooses from another view.
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
