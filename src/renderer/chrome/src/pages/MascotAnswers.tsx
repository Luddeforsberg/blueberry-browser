import React, { useEffect, useState } from "react";
import type { GalleryMascot } from "@shared/library";
import type { MascotPart } from "@shared/mascotsPlaces";
import { ACCESSORIES, BERRY, MASCOT_TOOLS, MAX_MASCOT_INSTRUCTIONS, MAX_MASCOT_NAME, PALETTES } from "@shared/mascots";
import { Button } from "@common/components/Button";
import { Choice, Switch } from "@common/components/Controls";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { Berry } from "../components/Berry";
import { BETWEEN } from "../components/pageRows";
import { FIELD, SiteChips } from "../components/StepCard";
import type { MascotFormValues } from "../mascotsView";
import { api, blocked, type Set } from "./mascotStepRules";

// Part of making a mascot (MascotSteps.tsx): the answer to each step's question.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";

// A berry or a thing to wear, with its name under it.
const LookChoice: React.FC<{ label: string; chosen: boolean; onChoose: () => void; children: React.ReactNode }> = ({
  label,
  chosen,
  onChoose,
  children,
}) => (
  <li>
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={cn(
        "w-full pt-2.5 pb-2 flex flex-col items-center gap-1.5 rounded-tile text-13 transition-colors",
        chosen ? "bg-card-2 text-ink font-medium" : "text-ink-2 hover:bg-hover hover:text-ink",
        FOCUS,
      )}
    >
      <span aria-hidden>{children}</span>
      {label}
    </button>
  </li>
);

// The berries not chosen are asleep, and the chosen one is awake. The things to wear are drawn on the chosen berry.
const LookAnswer: React.FC<{ values: MascotFormValues; set: Set }> = ({ values, set }) => (
  <>
    <ul aria-label="Berries" className="grid grid-cols-6 gap-1">
      {PALETTES.map(({ id, label }) => (
        <LookChoice key={id} label={label} chosen={values.palette === id} onChoose={() => set({ palette: id })}>
          <Berry
            size={36}
            mood={values.palette === id ? "rest" : "off-duty"}
            mascot={{ ...BERRY, name: label, look: { palette: id, accessory: "none" } }}
            still
          />
        </LookChoice>
      ))}
    </ul>
    <ul aria-label="Things to wear" className="mt-1 grid grid-cols-6 gap-1">
      {ACCESSORIES.map(({ id, label }) => (
        <LookChoice key={id} label={label} chosen={values.accessory === id} onChoose={() => set({ accessory: id })}>
          <Berry size={36} mascot={{ ...BERRY, name: label, look: { palette: values.palette, accessory: id } }} still />
        </LookChoice>
      ))}
    </ul>
  </>
);

const NameAnswer: React.FC<{ values: MascotFormValues; set: Set; onEnter: () => void }> = ({ values, set, onEnter }) => (
  <input
    autoFocus
    aria-label="Name"
    maxLength={MAX_MASCOT_NAME}
    value={values.name}
    onChange={(event) => set({ name: event.target.value })}
    onKeyDown={(event) => {
      if (event.key === "Enter") onEnter();
    }}
    className={cn(FIELD, "h-[60px] px-4 text-center text-30 font-medium")}
  />
);

// Up to three of the bundled starters the user hasn't added. Pressing one fills in its words, never its sites or tools.
const useStarters = (): GalleryMascot[] => {
  const { mascots } = useMascots();
  const [entries, setEntries] = useState<GalleryMascot[]>([]);
  useEffect(() => {
    let live = true;
    void api()
      .gallery()
      .then(({ entries }) => live && setEntries(entries.filter((entry) => entry.publishedAt === undefined)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return entries.filter((entry) => !mascots.some((mascot) => mascot.galleryId === entry.id)).slice(0, 3);
};

const PurposeAnswer: React.FC<{ values: MascotFormValues; set: Set; offerStarters: boolean }> = ({ values, set, offerStarters }) => {
  const starters = useStarters();
  return (
    <>
      <textarea
        autoFocus
        aria-label="What it’s for"
        rows={3}
        maxLength={MAX_MASCOT_INSTRUCTIONS}
        value={values.instructions}
        placeholder="Keep an eye on my pull requests and tell me what needs me. Be brief."
        onChange={(event) => set({ instructions: event.target.value })}
        className={cn(FIELD, "block min-h-[76px] px-4 py-[13px] resize-none text-15 leading-[1.5]")}
      />
      {offerStarters && starters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-13 text-ink-2">
          <span id="start-from" className="mr-0.5">
            Or start from
          </span>
          {starters.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant="raised"
              size="sm"
              aria-describedby="start-from"
              onClick={() => set({ instructions: entry.draft.instructions })}
            >
              {entry.draft.name}
            </Button>
          ))}
        </div>
      )}
    </>
  );
};

const LimitsAnswer: React.FC<{ values: MascotFormValues; set: Set }> = ({ values, set }) => (
  <>
    <div className="mb-2.5 flex justify-center">
      <Choice
        label="Where it can go"
        value={values.onlySomeSites ? "some" : "any"}
        onChange={(choice) => set({ onlySomeSites: choice === "some" })}
        options={[
          { value: "any", label: "Any site" },
          { value: "some", label: "Only these sites" },
        ]}
      />
    </div>
    {values.onlySomeSites && (
      <div className="mb-3.5">
        <SiteChips sites={values.sites} onChange={(sites) => set({ sites })} problem={blocked("limits", values)} />
      </div>
    )}
    <ul aria-label="What it can do" className="rounded-sheet shadow-[inset_0_0_0_1px_var(--line)]">
      {MASCOT_TOOLS.map(({ id, label, hint }) => (
        <li key={id} className={cn(BETWEEN, "before:left-3.5 min-h-11 py-2 pl-3.5 pr-3 flex items-center gap-3")}>
          <div className="flex-1 min-w-0">
            <p id={`mascot-tool-${id}`} className="text-14 text-ink">
              {label}
            </p>
            <p className="mt-0.5 text-13 leading-[1.4] text-ink-2">{hint}</p>
          </div>
          <Switch
            labelledBy={`mascot-tool-${id}`}
            checked={values.tools.includes(id)}
            onChange={(on) => set({ tools: on ? [...values.tools, id] : values.tools.filter((tool) => tool !== id) })}
          />
        </li>
      ))}
    </ul>
  </>
);

export const Answer: React.FC<{ part: MascotPart; values: MascotFormValues; set: Set; onEnter: () => void; making: boolean }> = ({
  part,
  values,
  set,
  onEnter,
  making,
}) => {
  switch (part) {
    case "look":
      return <LookAnswer values={values} set={set} />;
    case "name":
      return <NameAnswer values={values} set={set} onEnter={onEnter} />;
    case "purpose":
      return <PurposeAnswer values={values} set={set} offerStarters={making} />;
    case "limits":
      return <LimitsAnswer values={values} set={set} />;
  }
};
