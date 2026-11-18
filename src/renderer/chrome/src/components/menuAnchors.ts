import type React from "react";
import type { MenuAnchor } from "@shared/ipc";

// Where a menu main opens hangs from, in this view: the pointer for a right-click, or under a button.
export const atPointer = (event: React.MouseEvent): MenuAnchor => ({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
export const underBox = (element: Element): MenuAnchor => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};
