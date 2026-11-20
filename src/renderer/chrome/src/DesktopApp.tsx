import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DesktopDropPart, DesktopDropState, Point } from "@shared/ipc";
import { DESKTOP_DROP } from "@shared/desktopSizes";
import { SHORTCUTS, shortcutKeys } from "@shared/shortcuts";
import { Pips } from "@common/components/Pips";
import { TIP_KEY } from "@common/components/Tooltip";
import { cn } from "@common/lib/utils";
import { DropFaces, DropShape } from "./DesktopDrop";
import { FADES_IN, dropAt, elapsed, restingSize, thickness } from "./desktopShape";
import { useDesktopTheme } from "./useDesktopTheme";
import { useFromMain } from "@common/lib/latest";

const desktop = () => window.chromeAPI.desktop;

// Past this much movement a press on the drop is a drag.
const DRAG_FROM_PX = 3;
// The words of a finished reply, in two lines at most.
const RESULT_WIDTH = 200;
const TITLE_WIDTH = 200;

const useNow = (every: number | null): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (every === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
};

const useRoom = () => {
  const [room, setRoom] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resized = () => setRoom({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  return room;
};

// A button on the drop, which is pressed for itself and not as the drop.
const PartButton: React.FC<{ part: DesktopDropPart; label: string; className: string; children: React.ReactNode }> = ({
  part,
  label,
  className,
  children,
}) => (
  <button
    type="button"
    aria-label={label}
    data-desktop-part={part}
    tabIndex={-1}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      void desktop().press(part);
    }}
    className={cn("press shrink-0 outline-none", className)}
  >
    {children}
  </button>
);

// The drop on the edge of the screen, in a clear window of its own that lets clicks through everywhere but here. Main
// decides everything it says, and the window doesn't change size for any of it: the shape grows inside it.
export const DesktopApp: React.FC = () => {
  const [state] = useFromMain<DesktopDropState | null>(null, desktop().state, desktop().onState);
  const theme = useDesktopTheme();
  const room = useRoom();
  const row = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const [held, setHeld] = useState<Point | null>(null);
  const latest = useRef<DesktopDropState | null>(null);
  latest.current = state;
  const now = useNow(state?.says.kind === "working" && state.says.since !== null ? 1000 : null);
  const dragging = state?.dragging ?? false;
  // A new row for each thing it says, so its words fade in.
  const rowKey = state === null ? null : dragging ? "held" : state.says.kind;

  // Laid out at its own size, so the shape can grow to it.
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => setNatural({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rowKey]);

  useEffect(() => {
    if (!dragging) setHeld(null);
  }, [dragging]);

  const edge = state?.edge ?? "right";
  const kind = state?.says.kind ?? "rest";
  const resting = restingSize(edge);
  const width = dragging ? DESKTOP_DROP.along : Math.max(resting.width, natural.width);
  const height = dragging ? DESKTOP_DROP.along : Math.max(thickness(kind, edge), natural.height);
  const at = dragging && held ? held : dropAt(edge, state?.anchor ?? { x: 0, y: 0 }, { width, height }, room);

  // What takes the pointer: the shape as it will be, not as it is part way through growing.
  const frame = state?.frame;
  const shown = state?.shown ?? false;
  useLayoutEffect(() => {
    if (frame === undefined || !shown || dragging) return;
    void desktop().dropBox({ x: at.x, y: at.y, width, height }, frame);
  }, [at.x, at.y, width, height, frame, shown, dragging]);

  if (!state) return null;
  const { says, faces, working, still, showBerry } = state;
  const thick = thickness(kind, edge);
  const inside = Math.min(Math.max((thick - 20) / 2, 4), 12);
  // Hidden mascots: the glyph is the pips already.
  const pips = working && showBerry && (says.kind === "rest" || says.kind === "working" || says.kind === "counts");
  // At rest it's 28 out of the edge around the face, and a little more with the pips beside it.
  const padding =
    kind === "rest"
      ? pips || faces.length > 1
        ? "0 6px"
        : `0 ${(resting.width - 20) / 2}px`
      : `0 ${says.kind === "asking" || says.kind === "finished" ? 9 : inside}px 0 ${inside}px`;
  const front = faces[0];
  const keys = shortcutKeys(SHORTCUTS.desktop, theme?.platform === "mac");

  return (
    <div className="fixed inset-0 overflow-hidden">
      <DropShape
        edge={edge}
        x={at.x}
        y={at.y}
        width={width}
        height={height}
        still={still || dragging}
        out={state.shown}
        loose={dragging}
        role="button"
        aria-label={
          says.kind === "asking" ? says.words : says.kind === "finished" ? says.text : `Give ${state.faces[0]?.name ?? "Berry"} a job`
        }
        data-desktop-drop
        data-says={says.kind}
        data-edge={edge}
        data-mood={front?.mood}
        onContextMenu={(event) => {
          event.preventDefault();
          void desktop().menu();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { startX: event.screenX, startY: event.screenY, moved: false };
          // From the press, since the drop is small enough for a quick drag to leave it before it counts as one.
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pressed = drag.current;
          if (!pressed) return;
          if (!pressed.moved) {
            if (Math.hypot(event.screenX - pressed.startX, event.screenY - pressed.startY) < DRAG_FROM_PX) return;
            pressed.moved = true;
            void desktop().dragStart();
          }
          const current = latest.current;
          if (!current?.dragging) return;
          setHeld({
            x: event.screenX - current.origin.x - DESKTOP_DROP.along / 2,
            y: event.screenY - current.origin.y - DESKTOP_DROP.along / 2,
          });
        }}
        onPointerUp={() => {
          if (drag.current?.moved) void desktop().dragEnd();
        }}
        // However a drag gets cut off, or the window would go on taking clicks across the screen.
        onLostPointerCapture={() => {
          if (drag.current?.moved) void desktop().dragEnd();
        }}
        onPointerCancel={() => {
          if (drag.current?.moved) void desktop().dragEnd();
          drag.current = null;
        }}
        onClickCapture={(event) => {
          // The end of a drag isn't a press.
          if (drag.current?.moved) event.stopPropagation();
          drag.current = null;
        }}
        onClick={() => void desktop().press("drop")}
      >
        {/* Laid out at its own size from the drop's start, and the shape around it shows as much as it has grown. */}
        <div
          ref={row}
          key={rowKey}
          className={cn(
            "dark absolute left-0 top-0 w-max flex items-center whitespace-nowrap text-13 font-medium text-tip-ink",
            !still && FADES_IN,
          )}
          style={{
            minHeight: dragging ? DESKTOP_DROP.along : thick,
            padding: dragging ? `0 ${(DESKTOP_DROP.along - 20) / 2}px` : padding,
            gap: kind === "rest" ? 6 : 8,
          }}
        >
          <DropFaces faces={dragging ? faces.slice(0, 1) : faces} showBerry={showBerry} still={still} />
          {pips && !dragging && <Pips pattern="think" still={still} className="text-tip-ink" />}
          {!dragging && says.kind === "job" && (
            <>
              <span>Give {front?.name ?? "Berry"} a job</span>
              {says.shortcut && (
                <span className="flex gap-[3px]">
                  {keys.map((key) => (
                    <kbd key={key} className={TIP_KEY}>
                      {key}
                    </kbd>
                  ))}
                </span>
              )}
            </>
          )}
          {!dragging && says.kind === "working" && (
            <>
              <span className="truncate" style={{ maxWidth: TITLE_WIDTH }}>
                Working on “{says.title}”
              </span>
              {says.since !== null && (
                <span className="font-mono text-11.5 font-regular text-tip-ink/60 tabular-nums">{elapsed(says.since, now)}</span>
              )}
            </>
          )}
          {!dragging &&
            says.kind === "counts" &&
            says.counts.map((count, index) => (
              <span key={count} className={cn(index > 0 && "text-tip-ink/60")}>
                {count}
              </span>
            ))}
          {!dragging && says.kind === "asking" && (
            <>
              <span>{says.words}</span>
              <PartButton part="answer" label="Answer" className="h-[26px] px-[11px] rounded-full bg-tip-ink text-tip text-13 font-medium">
                Answer
              </PartButton>
            </>
          )}
          {!dragging && says.kind === "finished" && (
            <>
              <span className="py-2.5 whitespace-normal font-regular leading-[17px] line-clamp-2" style={{ width: RESULT_WIDTH }}>
                {says.text}
              </span>
              <PartButton
                part="open"
                label="Open"
                className="h-[26px] px-[11px] rounded-full bg-tip-ink/[.16] text-tip-ink text-13 font-medium"
              >
                Open
              </PartButton>
              <PartButton
                part="dismiss"
                label="Not now"
                className="-ml-1 size-[22px] grid place-items-center rounded-full text-tip-ink/60 hover:text-tip-ink"
              >
                <X className="size-[13px]" strokeWidth={2} />
              </PartButton>
            </>
          )}
        </div>
      </DropShape>
    </div>
  );
};
