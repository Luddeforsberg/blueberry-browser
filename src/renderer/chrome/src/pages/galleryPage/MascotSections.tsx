import React from "react";
import { Mascot } from "@common/components/Mascot";
import { Pips } from "@common/components/Pips";
import { PIP_MARKS, PIP_PATTERNS } from "@common/components/pipPatterns";
import { cn } from "@common/lib/utils";
import { Button } from "@common/components/Button";
import { Switch } from "@common/components/Controls";
import { LABEL } from "@common/components/StatusPill";
import { MascotPerch } from "../../components/MascotPerch";
import { MascotRow } from "../MascotsPage";
import { LimitTags } from "../MascotSteps";
import { StepCard } from "../../components/StepCard";
import { GalleryTile } from "../MascotGalleryPage";
import { ACCESSORIES, BERRY_ID, PALETTES } from "@shared/mascots";
import { Section } from "./Section";
import { MOODS, PIP_WORDS, SAMPLE_MASCOT, SAMPLE_GALLERY_ENTRY } from "./gallerySamples";
import { missing } from "@shared/missing";

// Every berry in every mood, at each size where its detail changes, and in everything it can wear (DESIGN.md section 9).
const BERRY_SIZES = [112, 64, 48, 40, 28, 22, 18, 14];
const BerryGrid: React.FC<{ dark: boolean; still: boolean }> = ({ dark, still }) => (
  <div
    data-berry-grid={dark ? "dark" : "light"}
    className={cn("mt-4 p-5 rounded-tile bg-ground text-ink overflow-x-auto", dark ? "dark" : "light")}
  >
    <p className={LABEL}>Every berry, {dark ? "dark" : "light"}</p>
    <table className="mt-3 border-separate border-spacing-x-1.5 border-spacing-y-1">
      <thead>
        <tr>
          <th />
          {MOODS.map((mood) => (
            <th key={mood} className="font-mono text-11 font-normal text-ink-3">
              {mood}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PALETTES.map(({ id, label }) => (
          <tr key={id}>
            <th className="pr-2 text-left text-12 font-normal text-ink-2">{label}</th>
            {MOODS.map((mood) => (
              <td key={mood} className="text-center">
                <Mascot
                  look={{ palette: id, accessory: "none" }}
                  name={label}
                  mood={mood}
                  size={48}
                  still={still}
                  className="inline-block"
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    <div className="mt-5 flex flex-col gap-3">
      {PALETTES.map(({ id, label }) => (
        <div key={id} className="flex flex-wrap items-end gap-3">
          {BERRY_SIZES.map((size) => (
            <Mascot key={size} look={{ palette: id, accessory: "none" }} name={label} size={size} still={still} />
          ))}
          {ACCESSORIES.filter(({ id: accessory }) => accessory !== "none").map(({ id: accessory }) => (
            <Mascot key={accessory} look={{ palette: id, accessory }} name={label} size={48} still={still} />
          ))}
          {ACCESSORIES.filter(({ id: accessory }) => accessory !== "none").map(({ id: accessory }) => (
            <Mascot key={accessory} look={{ palette: id, accessory }} name={label} size={18} still={still} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

// Every mascot, the pips and the Gallery's tiles.
export const MascotSections: React.FC<{ still: boolean; setStill: React.Dispatch<React.SetStateAction<boolean>> }> = ({
  still,
  setStill,
}) => (
  <>
    <Section title="Mascots">
      <label className="flex items-center gap-2 text-14">
        <Switch label="Keep Berry still" checked={still} onChange={setStill} />
        Keep Berry still
      </label>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {[false, true].map((dark) => (
          <div key={String(dark)} className={cn("p-5 rounded-tile bg-ground text-ink", dark && "dark")}>
            <p className={LABEL}>{dark ? "Dark" : "Light"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PALETTES.map(({ id, label }) => (
                <figure key={id} className="w-[60px] flex flex-col items-center gap-1.5">
                  <Mascot look={{ palette: id, accessory: "none" }} name={label} size={52} still={still} />
                  <figcaption className="text-11 text-ink-2">{label}</figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {MOODS.map((mood) => (
                <figure key={mood} className="w-[60px] flex flex-col items-center gap-1.5">
                  <Mascot mood={mood} size={34} still={still} />
                  <figcaption className="font-mono text-11 text-ink-3 text-center">{mood}</figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2.5">
              {ACCESSORIES.map(({ id }, index) => (
                <Mascot
                  key={id}
                  look={{ palette: (PALETTES[(index + 1) % PALETTES.length] ?? missing("a palette")).id, accessory: id }}
                  size={34}
                  still={still}
                />
              ))}
              {[14, 18, 20, 22, 26, 40].map((size) => (
                <Mascot key={size} look={{ palette: "raspberry", accessory: "none" }} size={size} still={still} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 h-8 w-fit pl-2 pr-3 rounded-row bg-ink text-ground">
              <Mascot mood="fetching" size={22} inverted still={still} />
              <span className="font-mono text-11.5">On the address field while it works</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-13 text-ink-2">
              <Mascot size={26} shut still={still} /> Eyes shut, as one mascot gives way to the next.
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 text-13 text-ink-2">
        <Mascot size={24} hidden /> Hide Berry replaces it with a plain icon.
      </div>
      {[false, true].map((dark) => (
        <BerryGrid key={String(dark)} dark={dark} still={still} />
      ))}
    </Section>

    <Section title="Pips">
      <div className="flex flex-wrap gap-2">
        {PIP_PATTERNS.map((pattern) => (
          <span
            key={pattern}
            className={cn(
              "h-7 pl-2.5 pr-3 inline-flex items-center gap-2 rounded-full font-mono text-11.5",
              pattern === "waiting" ? "bg-sheet text-ink shadow-rim" : "bg-ink text-ground",
            )}
          >
            <Pips pattern={pattern} still={still} className={pattern === "waiting" ? "text-ask" : undefined} />
            {PIP_WORDS[pattern]}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PIP_MARKS.map((mark) => (
          <span
            key={mark}
            className="h-7 pl-2.5 pr-3 inline-flex items-center gap-2 rounded-full bg-sheet text-ink shadow-rim font-mono text-11.5"
          >
            <Pips pattern={mark} />
            {mark.charAt(0).toUpperCase() + mark.slice(1)}
          </span>
        ))}
      </div>
    </Section>

    <Section title="Your mascots">
      <div className="mt-4 max-w-xl p-2 rounded-prompt border bg-sheet">
        <MascotPerch selectedId={BERRY_ID} onChoose={() => undefined} />
      </div>
      <ul className="mt-6 max-w-[620px] rounded-sheet bg-sheet shadow-rim">
        <MascotRow mascot={SAMPLE_MASCOT} />
      </ul>
      <div className="mt-6 max-w-[620px] grid grid-cols-4 gap-x-3.5 gap-y-[22px]">
        <GalleryTile entry={SAMPLE_GALLERY_ENTRY} onPick={() => undefined} />
        <GalleryTile entry={SAMPLE_GALLERY_ENTRY} yours onPick={() => undefined} />
        <GalleryTile
          entry={{
            ...SAMPLE_GALLERY_ENTRY,
            author: "Ana",
            addCount: 12,
            publishedAt: 1,
            draft: { ...SAMPLE_MASCOT, look: { palette: "gooseberry", accessory: "cap" } },
          }}
          onPick={() => undefined}
        />
        <GalleryTile
          entry={{ ...SAMPLE_GALLERY_ENTRY, draft: { ...SAMPLE_MASCOT, look: { palette: "currant", accessory: "glasses" } } }}
          onPick={() => undefined}
        />
      </div>
      <div className="mt-6 py-6 rounded-tile bg-well">
        <StepCard
          mascot={SAMPLE_MASCOT}
          mood="rest"
          label="limits"
          question="Where can I go, and what can I do there?"
          hint="I can always read the pages I’m allowed on. I still ask before anything risky, and no limit changes that."
          nav={
            <div className="h-[46px] px-1.5 flex items-center justify-between">
              <Button variant="raised">Cancel</Button>
              <Button>Save</Button>
            </div>
          }
        >
          <LimitTags mascot={SAMPLE_MASCOT} className="justify-center" />
        </StepCard>
      </div>
    </Section>
  </>
);
