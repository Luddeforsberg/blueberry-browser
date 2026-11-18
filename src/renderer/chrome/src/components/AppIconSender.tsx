import React, { useEffect, useRef } from "react";
import { APP_ICON_SIZE, iconMascotId } from "@shared/appIcon";
import { useShell } from "../contexts/ShellContext";
import { useFlock } from "../contexts/LibraryContext";
import { AppIcon } from "./AppIcon";
import { iconPicture } from "../iconPicture";

// Draws the chosen app icon off screen and hands main the picture, whenever the choice or that mascot's look changes,
// and once when the window opens. A mascot that's gone draws as Berry. Main only takes it if it's for what's chosen.
export const AppIconSender: React.FC = () => {
  const { settings } = useShell();
  const { flock } = useFlock();
  const drawing = useRef<HTMLDivElement>(null);
  const mascotId = iconMascotId(settings.appIconMascotId, flock);
  const look = flock.find((mascot) => mascot.id === mascotId)?.look;
  const ground = settings.appIconGround;

  useEffect(() => {
    const svg = drawing.current?.querySelector("svg");
    if (!svg) return;
    iconPicture(svg, APP_ICON_SIZE)
      .then((png) => window.chromeAPI.settings.setAppIcon(png, mascotId, ground))
      .catch((error) => console.error("Failed to draw the app icon:", error));
  }, [mascotId, ground, look?.palette, look?.accessory]);

  return (
    <div ref={drawing} aria-hidden className="fixed -left-[9999px] top-0 pointer-events-none">
      <AppIcon look={look} ground={ground} size={APP_ICON_SIZE} />
    </div>
  );
};
