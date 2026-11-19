import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useLibrary } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { ToolBarButton } from "./ToolBarButton";
import { cn } from "@common/lib/utils";
import { SegmentSwitch } from "./SegmentSwitch";
import { SHORTCUTS } from "@shared/shortcuts";
import { TabsFace } from "./SidebarTabs";
import { ChatsFace } from "./SidebarChats";
import { SidebarFoot } from "./SidebarFoot";
export { MascotCard, DockMascot } from "./SidebarFoot";
export { ChatRow, ChatsFace } from "./SidebarChats";
export { SiteDragGhost } from "./SidebarTabs";

// DESIGN.md section 10, Sidebar: straight on the ground, with two faces and the dock under both.

// --- The sidebar ----------------------------------------------------------------------------------------------------

type Face = "tabs" | "chats";

// Tabs or Chats. A dot in `ask` on Chats while anything needs you, on either face.
const FaceSwitch: React.FC<{ face: Face; onChange: (face: Face) => void }> = ({ face, onChange }) => {
  const waiting = useLibrary().needsYou.length;
  return (
    <SegmentSwitch
      label="Sidebar"
      current={face}
      onChange={onChange}
      className="mx-0.5 mb-3 h-[30px] rounded-[10px] [&>button]:rounded-[8px] text-13"
      items={[
        { value: "tabs", label: "Tabs" },
        {
          value: "chats",
          label: "Chats",
          after: waiting > 0 && (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ask" />
              <span className="sr-only">
                , {waiting} {waiting === 1 ? "needs" : "need"} you
              </span>
            </>
          ),
        },
      ]}
    />
  );
};

// Whether a scrolling list has rows below what shows.
const useMoreBelow = () => {
  const list = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const check = () => {
    const element = list.current;
    if (element) setMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
  };
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    // The rows' own wrapper, since adding a tab changes what scrolls but not the list's size.
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return { list, moreBelow, check };
};

// `floating` is the collapsed sidebar shown over the page, where the button pins it open again.
export const Sidebar: React.FC<{ floating?: boolean }> = ({ floating = false }) => {
  const { layout, theme, toggleSidebar } = useShell();
  const [face, setFace] = useState<Face>("tabs");

  // The top row lines up with the toolbar, wherever this sidebar starts: the floating one is inset in its view.
  const nav = useRef<HTMLElement>(null);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => setTop(nav.current?.getBoundingClientRect().top ?? 0), []);
  const above = layout.addressRow.y - (floating ? layout.floatingSidebar.y : layout.sidebar.y) - top;
  const { list, moreBelow, check } = useMoreBelow();

  return (
    <nav ref={nav} aria-label="Sidebar" className="h-full flex flex-col pl-3 pr-2.5 pb-2.5">
      <div
        className="shrink-0 -ml-1 flex items-center justify-end box-content app-region-drag"
        style={{
          // Padding, so the space above can still drag the window.
          paddingTop: Math.max(above, 0),
          marginTop: Math.min(above, 0),
          height: layout.addressRow.height,
          paddingLeft: theme.platform === "mac" ? layout.controls.width : undefined,
        }}
      >
        <ToolBarButton
          Icon={PanelLeft}
          label={floating ? "Keep sidebar open" : "Hide sidebar"}
          shortcut={SHORTCUTS.sidebar}
          onClick={toggleSidebar}
        />
      </div>

      <FaceSwitch face={face} onChange={setFace} />

      {/* While rows go on below, the cut one fades out, so none looks as if it's under the dock. */}
      <div
        ref={list}
        onScroll={check}
        role="tabpanel"
        aria-label={face === "tabs" ? "Tabs" : "Chats"}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2",
          moreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]",
        )}
      >
        <div>{face === "tabs" ? <TabsFace /> : <ChatsFace />}</div>
      </div>

      <SidebarFoot />
    </nav>
  );
};
