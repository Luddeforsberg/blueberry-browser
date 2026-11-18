import type { MascotProfile } from "@shared/library";
import { BERRY_ID } from "@shared/mascots";
import { useShell } from "../contexts/useShell";

// With Berry hidden, the copy turns neutral too. A mascot the user named keeps its name, so they can tell who's who.
export const useAssistantName = (mascot?: MascotProfile) => {
  const { showBerry } = useShell().settings;
  if (mascot && mascot.id !== BERRY_ID) return mascot.name;
  return showBerry ? "Berry" : "Assistant";
};
