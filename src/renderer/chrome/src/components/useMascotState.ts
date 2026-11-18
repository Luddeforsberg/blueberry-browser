import type { MascotProfile } from "@shared/library";
import { useLibrary } from "../contexts/useLibrary";
import { BERRY_ID } from "@shared/mascots";

// What a mascot's face says in the dock: asking, working, or at rest.
export const useMascotState = () => {
  const library = useLibrary();
  return (mascot: MascotProfile) => {
    const ownChats = library.chats.filter((chat) => (chat.mascotId ?? BERRY_ID) === mascot.id);
    const asking = library.needsYou.filter((item) => item.mascotId === mascot.id);
    const running = ownChats.filter((chat) => chat.running && !asking.some((item) => item.id === chat.id));
    const mood = asking.length > 0 ? "asking" : running.length > 0 ? "fetching" : "rest";
    return { mood, asking, running, recent: ownChats.filter((chat) => !chat.running).slice(0, 3) } as const;
  };
};
