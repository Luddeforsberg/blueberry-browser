import React, { useEffect, useState } from "react";
import type { TabPreviewShown } from "@shared/ipc";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import motion from "@common/motion.json";
import { missing } from "@shared/missing";

const { ms, ease } = motion;

// What the card shows of one tab, without where it goes.
type Face = Pick<TabPreviewShown, "tabId" | "title" | "site" | "picture" | "working" | "still">;

// One tab's picture and words. Following the pointer to the next tab, the last one stays a moment underneath, fading, so
// the picture crosses over.
const CardFace: React.FC<{ face: Face; className?: string }> = ({ face, className }) => (
  <div className={className}>
    {face.picture && (
      <img src={face.picture} alt="" draggable={false} className="block w-full aspect-[16/10] object-cover object-top bg-sheet-2" />
    )}
    <div className="px-3 pt-2.5 pb-3">
      <p className="text-[13.5px] leading-[18px] font-semibold text-ink line-clamp-2 break-words">{face.title}</p>
      <p className="mt-0.5 text-[12.5px] leading-[17px] text-ink-3 truncate">{face.site}</p>
      {face.working && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] leading-4 text-ink-2">
          <Pips pattern="think" still={face.still} />
          <span className="min-w-0 truncate">{face.working} is working here</span>
        </p>
      )}
    </div>
  </div>
);

const TabPreviewCard: React.FC<{ shown: TabPreviewShown; on: boolean }> = ({ shown, on }) => {
  const [faces, setFaces] = useState<Face[]>([shown]);
  const newest = faces.at(-1) ?? missing("a face");
  if (newest.tabId !== shown.tabId) setFaces(shown.slide ? [newest, shown] : [shown]);
  // The same tab again, such as with a fresh picture, is simply redrawn.
  else if (newest !== shown) setFaces([...faces.slice(0, -1), shown]);
  useEffect(() => {
    if (faces.length < 2) return;
    const timer = window.setTimeout(() => setFaces((all) => all.slice(-1)), ms.move);
    return () => window.clearTimeout(timer);
  }, [faces]);

  // Drawn off first, so the first card fades in too.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const appear = `opacity ${ms.tip}ms ${ease}, transform ${ms.tip}ms ${ease}`;
  const { card } = shown;
  return (
    <div
      data-fade
      data-tab-preview
      aria-hidden
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        transition: shown.slide ? `${appear}, left ${ms.move}ms ${ease}, top ${ms.move}ms ${ease}` : appear,
      }}
      className={cn(
        "absolute rounded-[14px] bg-sheet shadow-lift overflow-hidden pointer-events-none select-none",
        on && drawn ? "opacity-100" : "opacity-0 translate-y-[3px] scale-[.98]",
      )}
    >
      {faces.map((face, index) => (
        <CardFace
          key={face.tabId}
          face={face}
          className={cn(
            index < faces.length - 1
              ? "absolute inset-x-0 top-0 opacity-0 transition-opacity duration-move"
              : faces.length > 1 && "relative animate-fade",
          )}
        />
      ))}
    </div>
  );
};

// A tab's preview card over the page, in its own view: main places the view and says what to draw. The pointer reaching
// it means it has left the tabs, so it goes at once rather than standing in the way of the page.
export const TabPreviewApp: React.FC = () => {
  const [shown, setShown] = useState<TabPreviewShown | null>(null);
  // The last one stays drawn while it fades.
  const [last, setLast] = useState<TabPreviewShown | null>(null);

  useEffect(() => {
    const api = window.chromeAPI;
    void api.theme.getTheme().then((theme) => document.documentElement.classList.toggle("dark", theme.isDark));
    const unsubscribe = [
      api.theme.onThemeUpdated((theme) => document.documentElement.classList.toggle("dark", theme.isDark)),
      api.preview.onShown((next) => {
        setShown(next);
        if (next) setLast(next);
      }),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, []);

  const hide = () => void window.chromeAPI.preview.hide();
  return (
    <div className="h-full" onPointerMove={hide} onPointerDown={hide}>
      {last && <TabPreviewCard shown={last} on={!!shown} />}
    </div>
  );
};
