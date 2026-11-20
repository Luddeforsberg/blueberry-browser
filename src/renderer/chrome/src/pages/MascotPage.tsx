import React, { useLayoutEffect, useRef, useState } from "react";
import { Lock, Plus, UserRound } from "lucide-react";
import type { GalleryMascot, MascotProfile } from "@shared/library";
import { MAX_MASCOT_NAME } from "@shared/mascots";
import { Button } from "@common/components/Button";
import { Choice } from "@common/components/Controls";
import type { Mood } from "@common/components/moods";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { ChatError, Markdown } from "../components/ChatMessage";
import { openMascots } from "../mascotsView";
import { BERRY_NAMES, freeName, fromPeople, galleryFacts } from "../galleryView";
import { Face, GroupLabel } from "./GalleryTile";

// Part of the Gallery (MascotGalleryPage.tsx): one mascot's own page.

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
export const MascotPage: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; linked: boolean; narrow: boolean }> = ({
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
