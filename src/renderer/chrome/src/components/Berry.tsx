import React from "react";
import type { MascotProfile } from "@shared/library";
import { Mascot } from "@common/components/Mascot";
import type { Mood } from "@common/components/moods";
import { useShell } from "../contexts/useShell";
import { atPointer } from "./menuAnchors";

// Berry, or one of the mascots, as the settings say: hidden, still, or itself. Right-clicking it offers both switches.
// `still` holds it still whatever the settings say, where something else in its area already moves.
export const Berry: React.FC<{
  mood?: Mood | undefined;
  size: number;
  className?: string | undefined;
  mascot?: MascotProfile | undefined;
  still?: boolean | undefined;
  shut?: boolean | undefined;
}> = ({ mascot, ...props }) => {
  const { settings } = useShell();

  return (
    <Mascot
      {...props}
      look={mascot?.look}
      name={mascot?.name}
      hidden={!settings.showBerry}
      lively
      onContextMenu={(event) => {
        event.preventDefault();
        void window.chromeAPI.settings.showBerryMenu(atPointer(event));
      }}
    />
  );
};

// A mascot where a page has room for it, such as an empty chat. With Berry hidden there's nothing in its place.
export const BerrySpot: React.FC<{ size: number; mascot?: MascotProfile; mood?: Mood }> = ({ size, mascot, mood }) => {
  const { settings } = useShell();

  return settings.showBerry ? <Berry size={size} mascot={mascot} mood={mood} /> : null;
};
