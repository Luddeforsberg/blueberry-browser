import React from "react";
import type { Bookmark } from "@shared/library";
import { atPointer } from "./menuAnchors";
import { holdWhile } from "../menuHold";

export const sameSite = (a: string, b: string) => {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
};

export const savedSiteMenu = (event: React.MouseEvent, site: Bookmark) => {
  event.preventDefault();
  void holdWhile(window.chromeAPI.library.showBookmarkMenu(site.id, atPointer(event)));
};
