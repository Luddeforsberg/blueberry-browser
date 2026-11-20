import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { TabInfo } from "@shared/ipc";
import type { GalleryLinked, GalleryListing, GalleryMascot } from "@shared/library";
import { galleryParam, galleryPlace } from "@shared/galleryPlaces";
import { Button } from "@common/components/Button";
import { useStill } from "@common/components/motion";
import { cn } from "@common/lib/utils";
import { useLatest } from "@common/lib/latest";
import { useMascots } from "../contexts/useLibrary";
import { Berry } from "../components/Berry";
import { EmptyPage, PageHeader, SearchField } from "../components/PageFrame";
import { openMascots, startMascot } from "../mascotsView";
import {
  GALLERY_VIEW_EVENT,
  galleryGroups,
  galleryKinds,
  galleryLinkAsks,
  galleryView,
  linkCame,
  setGalleryView,
  type GalleryView,
} from "../galleryView";
import { GroupLabel, GalleryTile } from "./GalleryTile";
import { MascotPage } from "./MascotPage";
export { GalleryTile } from "./GalleryTile";

// DESIGN.md section 10, Gallery: the whole Gallery as tiles, or one mascot's own page in its place, one step in. Which
// one is open lives in the tab's param. Everything from the server is text: what it's told is plain text, and the
// example's answer is markdown that can't load anything or go anywhere.

// From the start, not only while the page shows, so a link that comes while another tab is in front isn't missed.
window.chromeAPI.mascots.onLinked(linkCame);

// Below this, as beside the chat, two tiles to a row and a mascot's page in one column.
const NARROW = 720;
const tileColumns = (width: number) => (width >= 900 ? 4 : width >= NARROW ? 3 : 2);

const openPlace = (param: string) => void window.chromeAPI.browser.openPage("mascot-gallery", { param });
const openEntry = (id: string) => openPlace(galleryParam({ page: "mascot", id }));

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

// The crumb on top of a mascot's page: back to the tiles, and where you are.
const Crumb: React.FC<{ name?: string | undefined; onClose: () => void }> = ({ name, onClose }) => (
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

  const lists = useLatest();
  const load = useCallback(() => {
    const ask = lists.next();
    void window.chromeAPI.mascots
      .gallery()
      .catch((): GalleryListing => ({ entries: [], status: "unreachable" }))
      .then((answer) => ask.current && setListing(answer));
  }, [lists]);
  useEffect(load, [load, ownPublished]);

  // A link's entry is asked of the server again, rather than taken from the list.
  useEffect(() => {
    if (linkedId === null || linkKey === null) return undefined;
    let left = false;
    void window.chromeAPI.mascots
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
