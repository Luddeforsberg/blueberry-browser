import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Lock, Plus, UserRound } from "lucide-react";
import type { TabInfo } from "@shared/ipc";
import type { GalleryLinked, GalleryListing, GalleryMascot, MascotProfile } from "@shared/library";
import { MAX_MASCOT_NAME } from "@shared/mascots";
import { galleryParam, galleryPlace } from "@shared/galleryPlaces";
import { Button } from "@common/components/Button";
import { Choice } from "@common/components/Controls";
import type { Mood } from "@common/components/moods";
import { Pips } from "@common/components/Pips";
import { useStill } from "@common/components/motion";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { Berry } from "../components/Berry";
import { ChatError, Markdown } from "../components/ChatMessage";
import { EmptyPage, PageHeader, SearchField } from "../components/PageFrame";
import { openMascots, startMascot } from "../mascotsView";
import {
  addsLine,
  BERRY_NAMES,
  freeName,
  fromPeople,
  GALLERY_VIEW_EVENT,
  galleryFacts,
  galleryGroups,
  galleryKinds,
  galleryLinkAsks,
  galleryView,
  linkCame,
  setGalleryView,
  type GalleryView,
} from "../galleryView";

// DESIGN.md section 10, Gallery: the whole Gallery as tiles, or one mascot's own page in its place, one step in. Which
// one is open lives in the tab's param. Everything from the server is text: what it's told is plain text, and the
// example's answer is markdown that can't load anything or go anywhere.

// From the start, not only while the page shows, so a link that comes while another tab is in front isn't missed.
window.chromeAPI.mascots.onLinked(linkCame);

// Below this, as beside the chat, two tiles to a row and a mascot's page in one column.
const NARROW = 720;
const tileColumns = (width: number) => (width >= 900 ? 4 : width >= NARROW ? 3 : 2);

const asMascot = (entry: GalleryMascot): MascotProfile => ({ ...entry.draft, id: entry.id, deletedAt: null });

const openPlace = (param: string) => void window.chromeAPI.browser.openPage("mascot-gallery", { param });
const openEntry = (id: string) => openPlace(galleryParam({ page: "mascot", id }));

const startChat = (id: string, choose: (id: string) => void) => {
  choose(id);
  void window.chromeAPI.browser.createTab();
};

const tint = (entry: GalleryMascot) => entry.draft.look.palette;

// The four moods the stage can show, so you can see it working before it's yours.
type StageMood = Extract<Mood, "rest" | "thinking" | "asking" | "delivered">;
const STAGE_MOODS: { value: StageMood; label: string }[] = [
  { value: "rest", label: "At rest" },
  { value: "thinking", label: "Working" },
  { value: "asking", label: "Asking" },
  { value: "delivered", label: "Done" },
];

// Its face, or with mascots hidden the pips glyph, so a tile or the stage still holds something.
const Face: React.FC<{ entry: GalleryMascot; size: number; copy?: MascotProfile | null; mood?: Mood; className?: string }> = ({
  entry,
  size,
  copy,
  mood = "rest",
  className,
}) => {
  const { showBerry } = useShell().settings;
  if (!showBerry) {
    return (
      <span
        role="img"
        aria-label={entry.draft.name}
        className={cn("shrink-0 grid place-items-center text-ink-2", className)}
        style={{ width: size, height: size }}
      >
        <span className="grid place-items-center" style={{ transform: `scale(${Math.min(3, Math.max(1, size / 26))})` }}>
          <Pips pattern="think" still />
        </span>
      </span>
    );
  }
  return <Berry mood={mood} size={size} mascot={copy ?? asMascot(entry)} className={className} />;
};

const Yours: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn("flex items-center gap-1 whitespace-nowrap", className)}>
    <Check aria-hidden className="size-3" strokeWidth={1.75} />
    Yours
  </span>
);

// The kinds of job as a row of words, each with its count, All first and only the kinds that have any. The chosen one
// is underlined on the hairline under the row.
const Kinds: React.FC<{ entries: GalleryMascot[]; chosen: string | null }> = ({ entries, chosen }) => {
  const kinds = [
    { kind: null, label: "All", count: entries.length },
    ...galleryKinds(entries).map(({ kind, count }) => ({ kind, label: kind, count })),
  ];
  return (
    <div
      role="group"
      aria-label="Kinds of job"
      className="mt-[18px] flex gap-5 shadow-[inset_0_-1px_0_var(--line)] overflow-x-auto [scrollbar-width:none]"
    >
      {kinds.map(({ kind, label, count }) => (
        <button
          key={label}
          type="button"
          aria-pressed={chosen === kind}
          onClick={() => setGalleryView({ category: kind })}
          className={cn(
            "shrink-0 pb-2.5 flex items-baseline gap-1.5 whitespace-nowrap text-13 outline-none rounded-t-[4px] transition-colors focus-visible:ring-2 focus-visible:ring-focus",
            chosen === kind ? "text-ink shadow-[inset_0_-1.5px_0_rgb(var(--ink))]" : "text-ink-2 hover:text-ink",
          )}
        >
          {label}
          <span className="font-mono text-11 text-faint">{count}</span>
        </button>
      ))}
    </div>
  );
};

// The server couldn't be read, so only Blueberry's own are here.
const Unreachable: React.FC<{ onRetry: () => void; className?: string }> = ({ onRetry, className }) => (
  <div role="status" className={cn("px-3 py-2.5 rounded-tile bg-sheet-2 flex items-center gap-3 text-13 text-ink-2", className)}>
    <span className="flex-1 min-w-0">Can’t reach the Gallery, so only Blueberry’s own are here.</span>
    <Button variant="raised" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

const GroupLabel: React.FC<{ label: string; count?: number; note?: string; className?: string }> = ({ label, count, note, className }) => (
  <h2 className={cn("flex items-baseline gap-2 text-13 font-medium text-ink-2", className)}>
    {label}
    {count !== undefined && <span className="font-mono text-11 font-regular text-faint">{count}</span>}
    {note && <span className="ml-auto text-[12.5px] font-regular text-ink-3">{note}</span>}
  </h2>
);

// A tile in the whole Gallery: a grey stage with the mascot, and under it its name, its line and, for a person's, who
// and how many adds. Pointed at, only the stage steps up a shade, so a tile is only ever a way into its page. With no
// `onPick` it's only a picture of one, as publishing shows.
export const GalleryTile: React.FC<{ entry: GalleryMascot; yours?: boolean; onPick?: () => void }> = ({ entry, yours, onPick }) => {
  const line = useId();
  const body = (
    <>
      <span className="relative aspect-[4/3] rounded-[14px] bg-sheet-2 grid place-items-center transition-colors duration-fast group-hover:bg-[color-mix(in_srgb,rgb(var(--sheet-2)),rgb(var(--ink))_4%)] group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-sheet">
        <Face entry={entry} size={64} />
        {yours && <Yours className="absolute left-2.5 top-2.5 font-mono text-11 text-ink-3" />}
      </span>
      <span className="block mx-0.5 mt-2.5 text-[13.5px] font-medium [overflow-wrap:anywhere]">{entry.draft.name}</span>
      <span id={line} className="block mx-0.5 mt-0.5 text-[12.5px] leading-[1.4] text-ink-2 line-clamp-2">
        {entry.description}
      </span>
      {fromPeople(entry) && <span className="block mx-0.5 mt-1.5 font-mono text-11 text-faint truncate">{addsLine(entry)}</span>}
    </>
  );
  if (!onPick) return <div className="group">{body}</div>;
  return (
    <button
      type="button"
      data-gallery-tile={entry.id}
      aria-label={yours ? `${entry.draft.name}, yours` : entry.draft.name}
      aria-describedby={line}
      onClick={onPick}
      className="group block w-full text-left outline-none"
    >
      {body}
    </button>
  );
};

// The question as the user's bubble, and the answer beside the mascot's face, its first lines fading out until it's read.
const Example: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null }> = ({ entry, copy }) => {
  const answer = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [whole, setWhole] = useState(false);
  useLayoutEffect(() => {
    const box = answer.current;
    if (!box) return undefined;
    const measure = () => setLong(box.scrollHeight > box.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    if (box.firstElementChild) watch.observe(box.firstElementChild);
    return () => watch.disconnect();
  }, [entry.example]);
  if (!entry.example) return null;
  const clipped = long && !whole;
  return (
    <section aria-label="An example">
      <GroupLabel label="An example" className="mt-[22px] mb-2.5" />
      <p className="ml-auto w-fit max-w-[78%] px-[13px] py-2 rounded-sheet bg-sheet-2 text-[13.5px] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {entry.example.prompt}
      </p>
      <div className="mt-2.5 flex gap-2.5">
        <Face entry={entry} copy={copy} size={22} className="mt-px" />
        <div ref={answer} className={cn("relative flex-1 min-w-0", !whole && "max-h-[150px] overflow-hidden")}>
          <Markdown
            content={entry.example.answer}
            fromStranger
            className="text-[13.5px] leading-[1.55] [overflow-wrap:anywhere] prose-headings:mt-0 prose-headings:mb-2 prose-headings:text-15 prose-p:my-0 prose-p:mb-2"
          />
          {clipped && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[70px] bg-gradient-to-b from-transparent to-sheet" />}
        </div>
      </div>
      {clipped && (
        <Button variant="ghost" size="sm" className="mt-1 ml-[22px] text-ink" onClick={() => setWhole(true)}>
          Read the whole answer
        </Button>
      )}
    </section>
  );
};

// Its facts as rows between hairlines. Only a real limit has a padlock.
const Facts: React.FC<{ entry: GalleryMascot }> = ({ entry }) => (
  <dl aria-label="About it" className="mt-5 border-t border-line">
    {galleryFacts(entry).map(({ label, lines, mono }) => (
      <div key={label} className="py-2.5 flex gap-2.5 border-b border-line text-13">
        <dt className="w-[84px] shrink-0 text-ink-3">{label}</dt>
        <dd className="flex-1 min-w-0 flex flex-col gap-1">
          {lines.map(({ text, limited }) => (
            <span key={text} className={cn("flex items-center gap-1.5 [overflow-wrap:anywhere]", mono && "font-mono text-[12.5px]")}>
              {label === "Made by" && <UserRound aria-hidden className="size-[13px] shrink-0" strokeWidth={1.75} />}
              {limited && <Lock aria-label="Limited" className="size-3 shrink-0" strokeWidth={1.75} />}
              {text}
            </span>
          ))}
        </dd>
      </div>
    ))}
  </dl>
);

// The crumb on top of a mascot's page: back to the tiles, and where you are.
const Crumb: React.FC<{ name?: string; onClose: () => void }> = ({ name, onClose }) => (
  <nav aria-label="Where you are" className="flex items-center gap-1.5 text-13 text-ink-2 min-w-0">
    <button
      type="button"
      data-gallery-crumb
      onClick={onClose}
      className="-ml-1.5 h-7 pl-1 pr-1.5 flex items-center gap-1 rounded-row hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
      Gallery
    </button>
    {name && (
      <>
        <span aria-hidden className="text-faint">
          /
        </span>
        <span aria-current="page" className="min-w-0 truncate font-medium text-ink">
          {name}
        </span>
      </>
    )}
  </nav>
);

// Add, or once it's yours, Chat with it and its page.
const Actions: React.FC<{ name: string; copy: MascotProfile | null; onAdd: () => void }> = ({ name, copy, onAdd }) => {
  const { choose } = useMascots();
  if (!copy) {
    return (
      <Button aria-label={`Add ${name} to your mascots`} className="w-full h-[38px] text-14" onClick={onAdd}>
        <Plus aria-hidden strokeWidth={1.75} />
        Add to your mascots
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button className="flex-1 min-w-0 h-[38px] text-14" onClick={() => startChat(copy.id, choose)}>
        <span className="truncate">Chat with {copy.name}</span>
      </Button>
      <Button variant="raised" className="h-[38px] text-14" onClick={() => openMascots({ page: "mascot", id: copy.id })}>
        Its page
      </Button>
    </div>
  );
};

// Everything you need to decide, with Add on its first screen: the stage and what it's told on the left, and a column on
// the right that stays in view. Nothing is added until Add, and Add names the version shown, so main copies exactly
// that one.
const MascotPage: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; linked: boolean; narrow: boolean }> = ({
  entry,
  copy,
  linked,
  narrow,
}) => {
  const { mascots } = useMascots();
  const { showBerry } = useShell().settings;
  const { name } = entry.draft;
  const taken = mascots.map((mascot) => mascot.name);
  const clash = !copy && taken.some((other) => other.toLowerCase() === name.toLowerCase());
  const [ownName, setOwnName] = useState(() => freeName(name, taken));
  const [error, setError] = useState<string | null>(null);
  const ownPublished = copy !== null && copy.galleryId !== entry.id;
  // Once it's yours the mascot looks pleased, and adding it turns it so.
  const [mood, setMood] = useState<StageMood>(copy ? "delivered" : "rest");
  const [wasYours, setWasYours] = useState(copy !== null);
  if (wasYours !== (copy !== null)) {
    setWasYours(copy !== null);
    if (copy) setMood("delivered");
  }

  const add = async () => {
    const result = await window.chromeAPI.mascots.addFromGallery(entry.id, entry.version ?? "", clash ? ownName : null);
    setError(result.ok ? null : result.error);
  };

  const note = copy ? (
    <p role="status" className="mt-3.5 text-[12.5px] leading-[1.5] text-ink-2">
      {ownPublished ? (
        "You published this one, so it’s already yours."
      ) : (
        <>
          <span className="font-medium text-ink">Added.</span> It’s your own copy, so nothing in the Gallery can change it.
        </>
      )}
    </p>
  ) : clash ? (
    <div className="mt-3.5 px-3.5 py-3 rounded-[14px] bg-sheet-2 flex flex-col gap-2.5 text-13 text-ink-2">
      <label htmlFor="gallery-own-name">You already have a {name}, so this one needs another name.</label>
      <input
        id="gallery-own-name"
        maxLength={MAX_MASCOT_NAME}
        value={ownName}
        onChange={(event) => setOwnName(event.target.value)}
        className="h-8 w-full px-2.5 rounded-[10px] bg-sheet shadow-rim text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
    </div>
  ) : (
    <p className="mt-3.5 text-[12.5px] leading-[1.5] text-ink-2">
      {fromPeople(entry)
        ? `${entry.author} wrote this, not Blueberry, and nobody has checked it. Its limits are real either way: they’re set by Blueberry, not by what it says about itself.`
        : "You get your own copy. It asks before anything risky, like all of yours, and you can change it any time."}
    </p>
  );

  return (
    <article
      aria-label={name}
      className={cn(
        "mt-4 grid gap-x-10",
        narrow
          ? 'grid-cols-1 [grid-template-areas:"stage""side""told"]'
          : 'grid-cols-[minmax(0,1fr)_340px] [grid-template-areas:"stage_side""told_side"]',
      )}
    >
      <div data-tint={tint(entry)} className="[grid-area:stage] relative aspect-[5/4] rounded-[18px] bg-sheet-2 grid place-items-center">
        {showBerry && (
          <span className="berry-ink absolute left-4 top-3.5 font-mono text-11.5 lowercase">{BERRY_NAMES[entry.draft.look.palette]}</span>
        )}
        <Face entry={entry} copy={copy} size={176} mood={mood} />
        {showBerry && (
          <div className="absolute inset-x-0 bottom-3.5 flex justify-center">
            <Choice label="Mood" value={mood} options={STAGE_MOODS} onChange={setMood} className="bg-transparent" />
          </div>
        )}
      </div>

      <section aria-label="What it’s told" className={cn("[grid-area:told] min-w-0", narrow ? "mt-7" : "mt-[26px]")}>
        <GroupLabel label="What it’s told" note="word for word, as the model reads it" className="mb-2.5" />
        <p className="px-4 py-3.5 rounded-tile bg-sheet-2 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {entry.draft.instructions}
        </p>
      </section>

      <div className={cn("[grid-area:side] min-w-0", narrow ? "mt-6" : "sticky top-6 self-start")}>
        <p className="font-mono text-11.5 text-faint">
          {linked ? "from a link you opened" : fromPeople(entry) ? "From people" : "From Blueberry"}
        </p>
        <h1 className="mt-0.5 mb-1 text-[26px] leading-tight font-semibold tracking-[-.02em] [overflow-wrap:anywhere]">{name}</h1>
        <p className="mt-1.5 mb-[18px] text-[14.5px] leading-[1.45] text-ink-2 [overflow-wrap:anywhere]">{entry.description}</p>
        <Actions name={name} copy={copy} onAdd={() => void add()} />
        {note}
        {error && (
          <div className="mt-3">
            <ChatError message={error} />
          </div>
        )}
        <Facts entry={entry} />
        <Example entry={entry} copy={copy} />
      </div>
    </article>
  );
};

// A mascot that can't be shown: gone from the Gallery, or the server can't be asked. Nothing was added either way.
const Missing: React.FC<{ status: GalleryListing["status"]; onRetry: () => void }> = ({ status, onRetry }) => (
  <EmptyPage
    face={<Berry mood="oops" size={56} />}
    actions={
      status === "unreachable" ? (
        <Button variant="raised" onClick={onRetry}>
          Try again
        </Button>
      ) : undefined
    }
  >
    {status === "live"
      ? "That mascot isn’t in the Gallery any more, so nothing was added."
      : status === "unreachable"
        ? "Couldn’t reach the Gallery, so that mascot can’t be shown, and nothing was added."
        : "This copy of Blueberry only has its own mascots, so that one can’t be shown, and nothing was added."}
  </EmptyPage>
);

const NothingFound: React.FC<{ query: string }> = ({ query }) => (
  <EmptyPage
    face={<Berry mood="oops" size={40} />}
    actions={
      <Button variant="raised" onClick={() => startMascot()}>
        New mascot
      </Button>
    }
    className="min-h-[260px]"
  >
    Nothing in the Gallery for “{query.trim()}”. You can make one yourself.
  </EmptyPage>
);

export const MascotGalleryPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
  const { mascots } = useMascots();
  const still = useStill();
  const [view, setViewState] = useState<GalleryView>(galleryView);
  const [asks, setAsks] = useState(galleryLinkAsks);
  const [listing, setListing] = useState<GalleryListing | null>(null);
  // What the server said about the entry a link asked for, by which id and which ask.
  const [linkedAnswer, setLinkedAnswer] = useState<{ key: string; answer: GalleryLinked } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // The one open before, which keeps the keyboard when the tiles come back, however the page was closed.
  const lookedAt = useRef<string | null>(null);
  // Whether the keyboard was in the page when a tile was picked, so it moves on to the crumb.
  const onTile = useRef(false);
  // Publishing or unpublishing changes this, and that changes what the page should show.
  const ownPublished = mascots.map((mascot) => mascot.publishedId ?? "").join();

  const [retries, setRetries] = useState(0);
  const place = galleryPlace(tab.pageParam);
  const pickedId = place.page === "all" ? null : place.id;
  const linkedId = place.page === "linked" ? place.id : null;
  // Every link that comes asks again, even for the same one, and so does Try again.
  const linkKey = linkedId === null ? null : `${linkedId} ${asks} ${retries}`;

  useEffect(() => {
    const follow = () => {
      setViewState(galleryView());
      setAsks(galleryLinkAsks());
    };
    window.addEventListener(GALLERY_VIEW_EVENT, follow);
    // A link can come between the first render and here.
    follow();
    return () => window.removeEventListener(GALLERY_VIEW_EVENT, follow);
  }, []);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    setWidth(element.clientWidth);
    const watch = new ResizeObserver(() => setWidth(element.clientWidth));
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const asked = useRef(0);
  const load = useCallback(() => {
    const ask = ++asked.current;
    window.chromeAPI.mascots
      .gallery()
      .catch((): GalleryListing => ({ entries: [], status: "unreachable" }))
      .then((answer) => ask === asked.current && setListing(answer));
  }, []);
  useEffect(load, [load, ownPublished]);

  // A link's entry is asked of the server again, rather than taken from the list.
  useEffect(() => {
    if (linkedId === null || linkKey === null) return undefined;
    let left = false;
    window.chromeAPI.mascots
      .galleryLinked(linkedId)
      .catch((): GalleryLinked => ({ entry: null, status: "unreachable" }))
      .then((answer) => {
        if (left) return;
        setLinkedAnswer({ key: linkKey, answer });
        if (answer.entry || answer.status !== "live") return;
        // Gone: its tile goes now, not when the list comes back.
        setListing((shown) => shown && { ...shown, entries: shown.entries.filter((entry) => entry.id !== linkedId) });
        load();
      });
    return () => {
      left = true;
    };
  }, [linkedId, linkKey, load]);

  const entries = listing?.entries ?? [];
  const narrow = width > 0 && width < NARROW;
  const groups = galleryGroups(entries, view.query, view.category);
  // Your own published one counts as yours, so it's never offered back to you.
  const copyOf = ({ id }: GalleryMascot) => mascots.find(({ galleryId, publishedId }) => galleryId === id || publishedId === id) ?? null;
  const linked = place.page === "linked" && linkedAnswer?.key === linkKey ? linkedAnswer.answer : null;
  const picked = place.page === "linked" ? (linked?.entry ?? null) : (entries.find((entry) => entry.id === pickedId) ?? null);
  // Still being asked, so nothing shows rather than something wrong.
  const waiting = pickedId !== null && !picked && (place.page === "linked" ? !linked : !listing);

  const close = useCallback(() => openPlace(galleryParam({ page: "all" })), []);
  const pick = (id: string) => {
    onTile.current = root.current?.contains(document.activeElement) ?? false;
    openEntry(id);
  };

  // Esc goes back to the tiles, unless it's clearing a field that has words in it.
  useEffect(() => {
    if (pickedId === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "search" && target.value) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickedId, close]);

  // Back on the tiles, the one looked at has the keyboard. Picked with the keyboard, the crumb has it.
  useEffect(() => {
    const before = lookedAt.current;
    lookedAt.current = pickedId;
    if (pickedId === null) {
      if (before) root.current?.querySelector<HTMLElement>(`[data-gallery-tile="${CSS.escape(before)}"]`)?.focus();
      return;
    }
    if (onTile.current) root.current?.querySelector<HTMLElement>("[data-gallery-crumb]")?.focus();
    onTile.current = false;
  }, [pickedId]);

  // Opening a page and going back fade over `panel`, and with the motion held still they're instant.
  const mode = pickedId === null ? "all" : `picked ${pickedId}`;
  const [shownMode, setShownMode] = useState(mode);
  const [fading, setFading] = useState(false);
  if (shownMode !== mode) {
    setShownMode(mode);
    setFading(!still);
  }

  const yourMascots = (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => openMascots({ page: "list" })}>
      Your mascots
    </Button>
  );
  const searching = view.query.trim() !== "";
  const nothingFound = searching && groups.every((group) => group.entries.length === 0);

  const column = narrow ? "max-w-[calc(100%-40px)]" : "max-w-[calc(100%-72px)]";
  let content: React.ReactNode = null;
  if (pickedId) {
    content = (
      <div className={cn("w-[1000px] mx-auto pt-[18px] pb-12", column)}>
        <Crumb name={picked?.draft.name} onClose={close} />
        {waiting ? (
          <p role="status" className="mt-8 text-14 text-ink-2">
            Getting the mascot from the Gallery…
          </p>
        ) : picked ? (
          <MascotPage
            key={`${picked.id} ${picked.version ?? ""}`}
            entry={picked}
            copy={copyOf(picked)}
            linked={place.page === "linked"}
            narrow={narrow}
          />
        ) : (
          <Missing
            status={linked?.status ?? (listing?.status === "unreachable" ? "unreachable" : "live")}
            onRetry={() => (linkedId !== null ? setRetries((count) => count + 1) : load())}
          />
        )}
      </div>
    );
  } else if (listing) {
    content = (
      <div className={cn("w-[960px] mx-auto pt-[26px] pb-12", column)}>
        {/* Your mascots as quiet text, with the search on its right. */}
        <PageHeader
          title="Gallery"
          actions={
            <>
              {yourMascots}
              <SearchField
                label="Search the Gallery"
                placeholder="Search mascots or sites"
                value={view.query}
                onChange={(query) => setGalleryView({ query })}
                folded={narrow}
              />
            </>
          }
        >
          Mascots made for one job. Read what each is told, then add your own copy.
        </PageHeader>
        <Kinds entries={entries} chosen={view.category} />
        {listing.status === "unreachable" && <Unreachable onRetry={load} className="mt-5" />}
        {nothingFound ? (
          <NothingFound query={view.query} />
        ) : (
          groups.map((group, index) => (
            <section key={group.key} aria-label={group.label}>
              <GroupLabel
                label={group.label}
                count={group.key === "found" ? undefined : group.entries.length}
                note={group.key === "people" && !narrow ? "Written by people using Blueberry, and not checked by us." : undefined}
                className={index === 0 ? "mt-[22px]" : "mt-[30px]"}
              />
              <ul
                className="mt-3.5 grid gap-x-[18px] gap-y-[26px]"
                style={{ gridTemplateColumns: `repeat(${tileColumns(width)}, minmax(0, 1fr))` }}
              >
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <GalleryTile entry={entry} yours={copyOf(entry) !== null} onPick={() => pick(entry.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    );
  }

  return (
    <div ref={root} className="h-full">
      <div
        key={mode}
        className={cn("h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]", fading && "animate-gallery-fade")}
        onAnimationEnd={(event) => event.target === event.currentTarget && setFading(false)}
      >
        {content}
      </div>
    </div>
  );
};
