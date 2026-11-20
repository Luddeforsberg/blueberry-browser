import React from "react";
import ReactDOM from "react-dom/client";
import { ChromeApp } from "./ChromeApp";
import { OverlayApp } from "./OverlayApp";
import { FindApp } from "./FindApp";
import { SuggestionsApp } from "./SuggestionsApp";
import { TooltipApp } from "./TooltipApp";
import { TabPreviewApp } from "./TabPreviewApp";
import { PromptApp } from "./PromptApp";
import { DesktopApp } from "./DesktopApp";
import { DesktopPanelApp } from "./DesktopPanel";
import { MenuApp } from "./MenuApp";
import { DarkMarkFilter } from "./components/Favicon";
import "./index.css";

// A scroll shows the thumb for a moment, as hovering does, since the keyboard can scroll with the pointer elsewhere.
const SHOW_THUMB_MS = 800;
const scrolled = new WeakMap<Element, number>();
document.addEventListener(
  "scroll",
  ({ target }) => {
    if (!(target instanceof Element)) return;
    target.setAttribute("data-scrolling", "");
    window.clearTimeout(scrolled.get(target));
    scrolled.set(
      target,
      window.setTimeout(() => target.removeAttribute("data-scrolling"), SHOW_THUMB_MS),
    );
  },
  { capture: true, passive: true },
);

// Main loads this page into each chrome view, and `view` says which one it is.
const view = new URLSearchParams(window.location.search).get("view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DarkMarkFilter />
    {view === "overlay" ? (
      <OverlayApp />
    ) : view === "find" ? (
      <FindApp />
    ) : view === "suggestions" ? (
      <SuggestionsApp />
    ) : view === "tooltip" ? (
      <TooltipApp />
    ) : view === "preview" ? (
      <TabPreviewApp />
    ) : view === "prompt" ? (
      <PromptApp />
    ) : view === "desktop" ? (
      <DesktopApp />
    ) : view === "composer" ? (
      <DesktopPanelApp />
    ) : view === "menu" || view === "drop-menu" ? (
      <MenuApp />
    ) : (
      <ChromeApp />
    )}
  </React.StrictMode>,
);
