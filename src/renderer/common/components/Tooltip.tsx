import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { shortcutKeys } from "@shared/shortcuts";
import { cn } from "../lib/utils";
import motion from "../motion.json";
import { GRACE_MS, IDLE, REST_MS, placeTip, slidesFrom, stepTip, type Box, type TipEvent, type TipState } from "./tooltipState";

// DESIGN.md section 8, A tooltip: one near-black pill for the whole view, which waits for the pointer to rest, then
// follows it along a row of controls. The system's own tooltip isn't used anywhere in the chrome, and a lint rule
// keeps `title` off the DOM.

export interface TipWords {
  words: string;
  // The shortcut's keys, as this computer writes them.
  keys: string[];
}

export interface TipShowing extends TipWords {
  box: Box;
  // Sliding over from a neighbour, rather than appearing.
  slide: boolean;
}

// Somewhere else to draw a tooltip, for one the chrome can't: over a web page, whose view covers the chrome.
export interface TipElsewhere {
  takes: (box: Box) => boolean;
  show: (tip: TipShowing) => void;
  hide: () => void;
}

interface Entry {
  element: () => HTMLElement | null;
  read: () => TipWords | null;
}

interface TipApi {
  mac: boolean;
  send: (event: TipEvent) => void;
  register: (id: string, entry: Entry) => () => void;
  // Words changed on a control, which shows them if its tooltip is up.
  changed: (id: string) => void;
}

const TipContext = createContext<TipApi | null>(null);

const { ms, ease } = motion;

// The label and a key, the same in the pill and in the ruler that measures it.
const LABEL = "h-[26px] px-2 inline-flex items-center gap-1.5 text-12 font-medium whitespace-nowrap";
export const TIP_KEY =
  "min-w-4 px-1 font-sans py-[3px] rounded-[4px] bg-tip-ink/[.16] text-center text-[10.5px] leading-none font-medium text-tip-ink/[.85]";

const TipLabel: React.FC<{ tip: TipWords; className?: string }> = ({ tip, className }) => (
  <span className={cn(LABEL, "max-w-full", className)}>
    <span className="min-w-0 truncate">{tip.words}</span>
    {tip.keys.map((key) => (
      <kbd key={key} className={cn(TIP_KEY, "shrink-0")}>
        {key}
      </kbd>
    ))}
  </span>
);

const keyOf = (tip: TipWords) => `${tip.words}\u0000${tip.keys.join(" ")}`;

// The pill itself, here or in the view over a page. Sliding, the words cross over as it moves and resizes.
export const TipPill: React.FC<{ tip: TipShowing; on: boolean; fixed?: boolean }> = ({ tip, on, fixed = true }) => {
  const key = keyOf(tip);
  const [labels, setLabels] = useState([{ key, tip: tip as TipWords }]);
  // New words: sliding, the old ones stay a moment to cross over, and appearing, they're simply replaced.
  if (labels[labels.length - 1].key !== key) setLabels(tip.slide ? [...labels.slice(-1), { key, tip }] : [{ key, tip }]);
  useEffect(() => {
    if (labels.length < 2) return;
    const timer = window.setTimeout(() => setLabels((shown) => shown.slice(-1)), ms.move);
    return () => window.clearTimeout(timer);
  }, [labels]);

  const appear = `opacity ${ms.tip}ms ${ease}, transform ${ms.tip}ms ${ease}`;
  return (
    <div
      data-fade
      aria-hidden
      style={{
        left: tip.box.x,
        top: tip.box.y,
        width: tip.box.width,
        transition: tip.slide ? `${appear}, left ${ms.move}ms ${ease}, top ${ms.move}ms ${ease}, width ${ms.move}ms ${ease}` : appear,
      }}
      className={cn(
        fixed ? "fixed z-[1000]" : "absolute",
        "h-[26px] rounded-[8px] bg-tip text-tip-ink shadow-tip overflow-hidden pointer-events-none select-none",
        on ? "opacity-100" : "opacity-0 translate-y-[3px] scale-[.97]",
      )}
    >
      {labels.map((label, index) => (
        <TipLabel
          key={label.key}
          tip={label.tip}
          className={cn(
            "absolute left-0 top-0 transition-opacity",
            index < labels.length - 1 ? "opacity-0" : labels.length > 1 && "animate-fade",
          )}
        />
      ))}
    </div>
  );
};

// Words cut with an ellipsis, anywhere in the control.
const isCut = (element: HTMLElement) =>
  [element, ...element.querySelectorAll<HTMLElement>("*")].some(
    (each) => each.scrollWidth > each.clientWidth && getComputedStyle(each).textOverflow === "ellipsis",
  );

export const TooltipProvider: React.FC<{ mac: boolean; elsewhere?: TipElsewhere; children: React.ReactNode }> = ({
  mac,
  elsewhere,
  children,
}) => {
  const entries = useRef(new Map<string, Entry>());
  const state = useRef<TipState>(IDLE);
  const timer = useRef<number>(undefined);
  const [shown, setShown] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pill, setPill] = useState<{ tip: TipShowing; on: boolean } | null>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  const away = useRef(elsewhere);
  away.current = elsewhere;
  // Where it last was, and whether that was here or elsewhere, so a neighbour's slides from there.
  const last = useRef<{ box: Box; away: boolean } | null>(null);

  const send = useCallback((event: TipEvent) => {
    const step = stepTip(state.current, event);
    state.current = step.state;
    setShown(step.state.shown);
    if (step.timer === "keep") return;
    window.clearTimeout(timer.current);
    if (step.timer === "rest") timer.current = window.setTimeout(() => send({ type: "rested" }), REST_MS);
    if (step.timer === "grace") timer.current = window.setTimeout(() => send({ type: "grace-over" }), GRACE_MS);
  }, []);

  const api = useMemo<TipApi>(
    () => ({
      mac,
      send,
      register: (id, entry) => {
        entries.current.set(id, entry);
        return () => {
          entries.current.delete(id);
          send({ type: "leave", id, now: true });
        };
      },
      changed: (id) => {
        if (state.current.shown === id) setVersion((at) => at + 1);
      },
    }),
    [mac, send],
  );

  const measure = (tip: TipWords) => {
    const element = ruler.current;
    if (!element) return 0;
    element.replaceChildren(
      document.createTextNode(tip.words),
      ...tip.keys.map((key) => {
        const kbd = document.createElement("kbd");
        kbd.className = TIP_KEY;
        kbd.textContent = key;
        return kbd;
      }),
    );
    return element.getBoundingClientRect().width;
  };

  useLayoutEffect(() => {
    const entry = shown ? entries.current.get(shown) : undefined;
    const element = entry?.element();
    const words = element?.isConnected ? entry?.read() : null;
    if (!element || !words) {
      if (last.current?.away) away.current?.hide();
      last.current = null;
      setPill((was) => was && { ...was, on: false });
      return;
    }
    const room = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const box = placeTip(element.getBoundingClientRect(), measure(words), room);
    const there = !!away.current?.takes(box);
    const before = last.current;
    const slide = !!before && before.away === there && slidesFrom(before.box, box);
    last.current = { box, away: there };
    if (there) {
      setPill((was) => was && { ...was, on: false });
      away.current?.show({ ...words, box, slide });
    } else {
      if (before?.away) away.current?.hide();
      setPill({ tip: { ...words, box, slide }, on: true });
    }
  }, [shown, version]);

  // Escape, a scroll anywhere, the window going to the back, or the pointer leaving the view take it away.
  useEffect(() => {
    const dismiss = () => {
      if (state.current.shown || state.current.waiting) send({ type: "dismiss" });
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && dismiss();
    const left = () => {
      const id = state.current.shown ?? state.current.waiting;
      if (id) send({ type: "leave", id, now: true });
    };
    const root = document.documentElement;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("blur", dismiss);
    root.addEventListener("mouseleave", left);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("blur", dismiss);
      root.removeEventListener("mouseleave", left);
      window.clearTimeout(timer.current);
    };
  }, [send]);

  return (
    <TipContext.Provider value={api}>
      {children}
      {createPortal(
        <>
          <span ref={ruler} aria-hidden className={cn(LABEL, "fixed left-0 top-0 invisible pointer-events-none")} />
          {pill && <TipPill tip={pill.tip} on={pill.on} />}
        </>,
        document.body,
      )}
    </TipContext.Provider>
  );
};

// Gives the one element inside it a tooltip: what pressing it does in two or three words, and its shortcut if it has
// one, as an Electron accelerator from `SHORTCUTS`. `whenCut` is for words cut with an ellipsis, which it gives in full
// only when they really are cut. The control keeps its own accessible name: the pill is hidden from screen readers.
export const Tooltip: React.FC<{
  words: string | null | undefined;
  shortcut?: string;
  whenCut?: boolean;
  children: React.ReactElement;
}> = ({ words, shortcut, whenCut = false, children }) => {
  const api = useContext(TipContext);
  const id = useId();
  const element = useRef<HTMLElement | null>(null);
  const latest = useRef({ words, shortcut, whenCut });
  latest.current = { words, shortcut, whenCut };

  useEffect(
    () =>
      api?.register(id, {
        element: () => element.current,
        read: () => {
          const { words: now, shortcut: keys, whenCut: cut } = latest.current;
          const shownOn = element.current;
          if (!now || !shownOn || (cut && !isCut(shownOn))) return null;
          return { words: now, keys: keys ? shortcutKeys(keys, api.mac) : [] };
        },
      }),
    [api, id],
  );
  useEffect(() => api?.changed(id), [api, id, words, shortcut]);

  // Always through a Slot, so words coming and going never makes the control anew, which would drop its focus.
  if (!api || !words) return <Slot>{children}</Slot>;
  return (
    <Slot
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") return;
        element.current = event.currentTarget;
        api.send({ type: "enter", id, via: "pointer" });
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => api.send({ type: "leave", id, now: event.relatedTarget === null })}
      onFocus={(event: React.FocusEvent<HTMLElement>) => {
        element.current = event.currentTarget;
        if (event.currentTarget.matches(":focus-visible")) api.send({ type: "enter", id, via: "keyboard" });
      }}
      onBlur={() => api.send({ type: "leave", id, now: true })}
      onPointerDown={() => api.send({ type: "press", id })}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") api.send({ type: "press", id });
      }}
    >
      {children}
    </Slot>
  );
};
