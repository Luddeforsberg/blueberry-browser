import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Lock } from "lucide-react";
import type { DesktopAsk, DesktopEdge, DesktopFace, DesktopPanelState, DesktopTray } from "@shared/ipc";
import { DESKTOP_SHADOW, DESKTOP_SHEET } from "@shared/desktopSizes";
import { SHORTCUTS, shortcutKeys } from "@shared/shortcuts";
import { ExactWords } from "@common/components/ApprovalCard";
import { Button } from "@common/components/Button";
import { Mascot } from "@common/components/Mascot";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { HANDOFF_TITLE } from "./components/approvalWords";
import { FADES_IN, clockTime, elapsed } from "./desktopShape";
import { waitedFor } from "./needsYouWords";
import { asContinuation, withSiteNames } from "./siteNames";
import { desktop, FOCUS } from "./desktopPanelParts";

// Part of the desktop panel (DesktopPanel.tsx): the tray and the ask beside the drop.

const useNow = (every: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
};

const Label: React.FC<{ ask?: boolean; count?: number; children: React.ReactNode }> = ({ ask = false, count, children }) => (
  <h3 className={cn("mt-3 mb-1 px-2.5 flex items-baseline gap-[7px] text-12 font-medium", ask ? "text-ask" : "text-ink-2")}>
    {children}
    {count !== undefined && <span className={cn("font-mono text-11", ask ? "text-ask/75" : "text-faint")}>{count}</span>}
  </h3>
);

const Face: React.FC<{ face: DesktopFace; size: number; showBerry: boolean; still: boolean }> = ({ face, size, showBerry, still }) =>
  showBerry ? (
    <Mascot mood={face.mood} size={size} look={face.look} name={face.name} still className="shrink-0" />
  ) : (
    <span className="shrink-0 grid place-items-center text-ink-3" style={{ width: size, height: size }}>
      <Pips
        pattern={face.mood === "asking" ? "waiting" : face.mood === "fetching" ? "think" : "done"}
        still={still || face.mood !== "fetching"}
        className={face.mood === "asking" || face.mood === "oops" ? "text-ask" : undefined}
      />
    </span>
  );

const ROW = cn(
  "w-full mx-0.5 px-2.5 py-[7px] flex items-center gap-2.5 rounded-tile text-left hover:bg-hover active:bg-press transition-colors duration-fast",
  FOCUS,
);

// What's going, waiting and finished today, beside the drop. Each row opens its chat in Blueberry, and Answer opens the ask.
const TraySheet: React.FC<{ tray: DesktopTray; state: DesktopPanelState; mac: boolean }> = ({ tray, state, mac }) => {
  const now = useNow(1000);
  const { showBerry, still, box } = state;
  const chosen = tray.mascots.find((face) => face.chosen);
  return (
    <section
      data-desktop-tray
      aria-label="Your mascots"
      className={cn("w-[324px] max-h-full overflow-y-auto rounded-menu bg-sheet shadow-lift shrink-0", !still && "animate-menu-in")}
    >
      <div data-sheet-content className="p-2">
        <div className="flex items-center justify-between pl-1.5 pr-2 pt-1.5 pb-0.5">
          <div className="flex gap-1">
            {tray.mascots.map((face, index) => (
              <span key={index} className={cn("p-[3px] rounded-full", face.chosen && "shadow-[inset_0_0_0_1.5px_rgb(var(--ink))]")}>
                <Face face={face} size={22} showBerry={showBerry} still />
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void desktop().openBlueberry()}
            className={cn(
              "press h-7 px-1.5 rounded-row inline-flex items-center gap-1 text-13 font-medium text-ink-2 hover:text-ink",
              FOCUS,
            )}
          >
            Open Blueberry
            <ArrowUpRight className="size-[13px]" strokeWidth={1.75} />
          </button>
        </div>
        {tray.asks.length > 0 && (
          <>
            <Label ask count={tray.asks.length}>
              Needs you
            </Label>
            <ul className="flex flex-col gap-1.5">
              {tray.asks.map((ask) => (
                <li key={ask.key} className="mx-0.5 pl-[9px] pr-2.5 py-2.5 rounded-sheet bg-card shadow-up flex items-center gap-2.5">
                  <Face face={ask} size={24} showBerry={showBerry} still />
                  <span className="min-w-0 flex-1 flex flex-col">
                    <span className="truncate text-14 font-medium text-ink">{ask.words}</span>
                    <span className="font-mono text-11.5 text-ink-3">{waitedFor(ask.since, now)}</span>
                  </span>
                  <Button size="sm" onClick={() => void desktop().trayPress(ask.key)}>
                    Answer
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tray.working.length > 0 && (
          <>
            <Label count={tray.working.length}>Working</Label>
            <ul>
              {tray.working.map((job) => (
                <li key={job.key} className="flex">
                  <button type="button" onClick={() => void desktop().trayPress(job.key)} className={ROW}>
                    <Face face={job} size={24} showBerry={showBerry} still />
                    <span className="min-w-0 flex-1 flex flex-col">
                      <span className="truncate text-14 font-medium text-ink">{job.title}</span>
                      <span className="min-w-0 flex items-center gap-[7px] text-13 text-ink-2">
                        <Pips pattern="think" still={still} />
                        <span className="truncate">{job.step ?? "Thinking.."}</span>
                      </span>
                    </span>
                    {job.since !== null && (
                      <span className="shrink-0 font-mono text-11.5 text-faint tabular-nums">{elapsed(job.since, now)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tray.finished.length > 0 && (
          <>
            <Label>Finished today</Label>
            <ul>
              {tray.finished.map((job) => (
                <li key={job.key} className="flex">
                  <button type="button" onClick={() => void desktop().trayPress(job.key)} className={ROW}>
                    <Face face={job} size={24} showBerry={showBerry} still />
                    <span className="min-w-0 flex-1 flex flex-col">
                      <span className="truncate text-14 font-medium text-ink-2">{job.title}</span>
                      <span className={cn("truncate text-13", job.problem ? "text-ask" : "text-ink-3")}>
                        {job.problem ?? "Done"}
                        <span className="font-mono text-11.5"> · {clockTime(job.at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          onClick={() => void desktop().openBox()}
          className={cn(
            "press mt-2.5 w-full h-[42px] pl-1.5 pr-2.5 rounded-[15px] bg-sheet-2 flex items-center gap-1.5 text-14 text-faint hover:text-ink-2",
            FOCUS,
          )}
        >
          <span className="p-[5px]">{chosen && <Face face={{ ...chosen, mood: "rest" }} size={20} showBerry={showBerry} still />}</span>
          <span className="flex-1 text-left">Give {box.chosen.name} a job</span>
          {box.shortcut && (
            <span className="flex gap-[3px]">
              {shortcutKeys(SHORTCUTS.desktop, mac).map((key) => (
                <kbd
                  key={key}
                  className="min-w-4 px-1 py-[3px] rounded-[4px] bg-ink/[.08] text-center text-[10.5px] leading-none font-medium text-ink-2"
                >
                  {key}
                </kbd>
              ))}
            </span>
          )}
        </button>
      </div>
    </section>
  );
};

// The ask, after Answer: the mascot asking, what it wants with addresses cut to their site, and the exact words, never
// cut. Only the decision goes back to main, which holds which ask this is.
const AskSheet: React.FC<{ ask: DesktopAsk; state: DesktopPanelState }> = ({ ask, state }) => {
  const { showBerry, still } = state;
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const name = ask.face.name;
  const field = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ask.kind === "question") field.current?.focus();
    else sheet.current?.focus();
  }, [ask.kind, state.opened]);

  const decide = async (allow: boolean, words?: string) => {
    if (sent) return;
    setSent(true);
    const result = await desktop().decide(words === undefined ? { key: ask.key, allow } : { key: ask.key, allow, answer: words });
    if (result === "code") {
      setSent(false);
      setProblem("That looks like a code. Codes only go into the page itself, never through here.");
    }
  };

  const wants = withSiteNames(asContinuation(ask.text));
  const lead = "relative mt-2 text-13 text-ink-2";
  const title = "relative mt-0.5 text-[18px] leading-[23px] font-semibold tracking-[-.02em] text-ink [overflow-wrap:anywhere]";
  return (
    <section
      ref={sheet}
      tabIndex={-1}
      data-desktop-ask={ask.kind}
      aria-label={`${name} is asking`}
      className={cn(
        "w-[324px] max-h-full overflow-y-auto shrink-0 rounded-prompt bg-sheet shadow-lift outline-none",
        !still && "animate-menu-in",
      )}
    >
      <div data-sheet-content className="relative px-4 pt-[18px] pb-3.5 text-center">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[150px] max-h-full pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:16px_16px] bg-[position:8px_8px] [mask-image:radial-gradient(120%_100%_at_50%_0,#000_20%,transparent_78%)]"
        />
        <div className="relative flex justify-center">
          {/* Once it's answered, it goes back to work. */}
          <Face face={ask.said ? { ...ask.face, mood: "fetching" } : ask.face} size={56} showBerry={showBerry} still />
        </div>
        {ask.said ? (
          <p role="status" className={cn("relative mt-3 mb-2 text-15 text-ink", FADES_IN)}>
            {ask.said}
          </p>
        ) : ask.kind === "handoff" && ask.handoff ? (
          <>
            <p className={lead}>{name} needs you to</p>
            <h2 className={cn(title, "flex items-center justify-center gap-2")}>
              <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
              {HANDOFF_TITLE[ask.handoff.need]} {ask.handoff.site}
            </h2>
            <p className="relative mt-2 text-13 leading-[19px] text-ink-2">
              Only you can do this, in the page in Blueberry. What you type there goes straight to the site.
            </p>
            <Button className="relative mt-3 w-full h-[42px] text-14" onClick={() => void desktop().seePage()}>
              Open the page
            </Button>
          </>
        ) : ask.kind === "question" ? (
          <>
            <p className={lead}>{name} asks</p>
            <h2 className={title}>{ask.text}</h2>
            {ask.answers.length > 0 && (
              <ul aria-label="Answers" className="relative mt-3 flex flex-col gap-1 text-left">
                {ask.answers.map((each) => (
                  <li key={each} className="flex">
                    <button
                      type="button"
                      disabled={sent}
                      onClick={() => void decide(true, each)}
                      className={cn(
                        "press h-10 flex-1 min-w-0 px-3 rounded-tile bg-card-2 text-14 text-ink truncate text-left hover:[background-image:linear-gradient(var(--hover),var(--hover))]",
                        FOCUS,
                      )}
                    >
                      {each}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="relative mt-3 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (answer.trim()) void decide(true, answer);
              }}
            >
              <input
                ref={field}
                aria-label={`Your answer to ${name}`}
                value={answer}
                placeholder={ask.answers.length > 0 ? "Or type an answer" : "Your answer"}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setProblem(null);
                }}
                className="min-w-0 flex-1 h-9 px-3 rounded-tile bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-14 text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-focus"
              />
              <Button type="submit" disabled={!answer.trim() || sent}>
                Answer
              </Button>
            </form>
            {problem && (
              <p role="alert" className="relative mt-2 text-13 text-ask text-left">
                {problem}
              </p>
            )}
            <div className="relative mt-2 flex">
              <Button variant="ghost" size="sm" className="-ml-2 px-2" disabled={sent} onClick={() => void decide(false)}>
                Skip
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={lead}>{name} wants to</p>
            <h2 className={title}>{wants}</h2>
            <ExactWords className="relative mt-3.5 text-left bg-card-2">{ask.text}</ExactWords>
            <div className="relative mt-3 grid grid-cols-[1.25fr_1fr] gap-2">
              <Button className="h-[42px] text-14" disabled={sent} onClick={() => void decide(true)}>
                Allow
              </Button>
              <Button variant="raised" className="h-[42px] text-14" disabled={sent} onClick={() => void decide(false)}>
                Don’t allow
              </Button>
            </div>
          </>
        )}
        {!ask.said && ask.kind !== "handoff" && (
          <p className="relative mt-3 mx-0.5 flex items-center gap-2.5 text-13 text-ink-3 text-left">
            <span className="min-w-0 flex-1 truncate">For “{ask.job}”</span>
            <button
              type="button"
              onClick={() => void desktop().seePage()}
              className={cn("shrink-0 rounded-row inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink", FOCUS)}
            >
              See the page
              <ArrowUpRight className="size-[13px]" strokeWidth={1.75} />
            </button>
          </p>
        )}
      </div>
    </section>
  );
};

// Side by side beside the drop, the tray nearest it, and as tall as the taller, which main sizes the window to.
export const Sheets: React.FC<{ state: DesktopPanelState; mac: boolean }> = ({ state, mac }) => {
  const { tray, ask, edge, closing, still } = state;
  const root = useRef<HTMLDivElement>(null);
  // What's in them at their own height, however much of it the window has room for, whenever any of it changes.
  const shown = `${!!tray}:${ask?.key ?? ""}`;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const contents = [...element.querySelectorAll<HTMLElement>("[data-sheet-content]")];
    const report = () => void desktop().panelHeight(Math.max(0, ...contents.map((content) => content.offsetHeight)) + 2 * DESKTOP_SHADOW);
    report();
    const observer = new ResizeObserver(report);
    contents.forEach((content) => observer.observe(content));
    return () => observer.disconnect();
  }, [shown]);
  const sheets = [
    tray && <TraySheet key="tray" tray={tray} state={state} mac={mac} />,
    ask && <AskSheet key={ask.key} ask={ask} state={state} />,
  ];
  const align: Record<DesktopEdge, string> = {
    right: "items-center justify-end",
    left: "items-center justify-start",
    top: "items-start justify-center",
    bottom: "items-end justify-center",
  };
  return (
    <div
      ref={root}
      className={cn(
        "absolute inset-0 flex pointer-events-none [&>*]:pointer-events-auto",
        align[edge],
        !still && "transition-opacity duration-fast",
        closing && "opacity-0",
      )}
      style={{ padding: DESKTOP_SHADOW, gap: DESKTOP_SHEET.gap }}
    >
      {edge === "right" ? [...sheets].reverse() : sheets}
    </div>
  );
};
