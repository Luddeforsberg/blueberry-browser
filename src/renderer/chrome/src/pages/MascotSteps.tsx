import React, { useEffect, useRef, useState } from "react";
import type { MascotProfile } from "@shared/library";
import { mascotsParam, type MascotPart } from "@shared/mascotsPlaces";
import { permissionsInWords } from "@shared/mascots";
import { Button } from "@common/components/Button";
import { BIG_CARD, BIG_SHELL } from "@common/components/cardShell";
import { cn } from "@common/lib/utils";
import { LABEL, StatusPill } from "@common/components/StatusPill";
import { useMascots } from "../contexts/useLibrary";
import { BerrySpot } from "../components/Berry";
import { ChatError } from "../components/ChatMessage";
import { PartNav, StepCard, StepNav } from "../components/StepCard";
import {
  blankMascot,
  keepTabDraft,
  mascotForm,
  NEW_MASCOT_EVENT,
  openMascots,
  surprise,
  tabDraft,
  takeStartedMascot,
  toMascotDraft,
  withPart,
  type MascotFormValues,
} from "../mascotsView";
import { Tooltip } from "@common/components/Tooltip";
import { api, STEPS, QUESTIONS, asProfile, blocked, type Set } from "./mascotStepRules";
import { Answer } from "./MascotAnswers";

// DESIGN.md section 10, Your mascots: making one is four questions, one at a time, each a card set into a shell like the
// prompt box, with the mascot being made standing on it. Changing one part later is the same card, alone.

// The whole draft, saved through the same check as ever. A part changed on its own still saves everything else as it was.
const save = async (values: MascotFormValues): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const result = await api().save(values.id, { ...toMascotDraft(values), worksInCloud: values.worksInCloud });
  return result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error };
};

type Making = { values: MascotFormValues; step: number; from: "next" | "back"; madeId: string | null };

const fresh = (values: MascotFormValues = blankMascot()): Making => ({ values, step: 0, from: "next", madeId: null });

// It ends here: the mascot looking pleased, read back to you.
const MadeCard: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => {
  const { choose } = useMascots();
  return (
    <section aria-label={`${mascot.name} is added`} className="w-[520px] max-w-full mx-auto">
      <div className={BIG_SHELL}>
        <div className={cn(BIG_CARD, "bg-card px-7 pt-[30px] pb-[26px] text-center animate-fade-in")}>
          <div className="mb-3 flex justify-center">
            <BerrySpot size={72} mascot={mascot} mood="delivered" />
          </div>
          <p className={LABEL}>Added to your mascots</p>
          <h2 className="mt-1 mb-2 text-30 font-medium [overflow-wrap:anywhere]">{mascot.name}</h2>
          <p className="mx-auto max-w-[360px] text-14 leading-[1.5] text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {mascot.instructions}
          </p>
          <LimitTags mascot={mascot} className="mt-3.5 justify-center" />
          <div className="mt-[22px] flex justify-center gap-2">
            <Button
              onClick={() => {
                choose(mascot.id);
                void window.chromeAPI.browser.createTab();
              }}
            >
              Give it a job
            </Button>
            <Button variant="raised" onClick={() => openMascots({ page: "mascot", id: mascot.id })}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

// What it may do, as pills, in the words the Gallery uses.
export const LimitTags: React.FC<{ mascot: Pick<MascotProfile, "sites" | "tools">; className?: string }> = ({ mascot, className }) => (
  <ul aria-label="What it may do" className={cn("flex flex-wrap gap-1.5", className)}>
    {permissionsInWords(mascot).map(({ text }) => (
      <li key={text} className="flex">
        <StatusPill className="h-auto min-h-6 py-[3px] whitespace-normal">{text}</StatusPill>
      </li>
    ))}
  </ul>
);

// Making one, in four steps. What's typed lasts while the tab is away, and leaving keeps nothing.
export const NewMascot: React.FC<{ tabId: string }> = ({ tabId }) => {
  const param = mascotsParam({ page: "new" });
  const { mascots } = useMascots();
  const [making, setMakingState] = useState<Making>(() => {
    const started = takeStartedMascot();
    return started ? fresh(started) : tabDraft(tabId, param, () => fresh());
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setMaking = (next: Making) => {
    keepTabDraft(tabId, param, next);
    setMakingState(next);
  };
  const latest = useRef(setMaking);
  latest.current = setMaking;

  // New mascot pressed again while the steps show starts them again, with whatever it was given.
  useEffect(() => {
    const restart = () => {
      const started = takeStartedMascot();
      if (started) {
        latest.current(fresh(started));
        setError(null);
      }
    };
    window.addEventListener(NEW_MASCOT_EVENT, restart);
    return () => window.removeEventListener(NEW_MASCOT_EVENT, restart);
  }, []);

  // Until the library has it, it's read back from what was saved.
  if (making.madeId)
    return <MadeCard mascot={mascots.find(({ id }) => id === making.madeId) ?? { ...asProfile(making.values), id: making.madeId }} />;

  const { values, step } = making;
  const part = STEPS[step];
  const set: Set = (patch) => setMaking({ ...making, values: { ...values, ...patch } });
  const others = mascots.map((mascot) => mascot.name);
  const off = blocked(part, values);
  const last = step === STEPS.length - 1;

  const next = async () => {
    if (off || saving) return;
    if (!last) {
      setError(null);
      setMaking({ ...making, step: step + 1, from: "next" });
      return;
    }
    setSaving(true);
    const result = await save(values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId);
    setError(null);
    setMaking({ ...making, madeId: result.id });
  };

  return (
    <StepCard
      mascot={asProfile(values)}
      mood={QUESTIONS[part].mood}
      label={`${step + 1} / ${STEPS.length}`}
      action={
        part === "look" && (
          <Button type="button" variant="raised" size="sm" className="font-sans" onClick={() => set(surprise(values, others))}>
            Surprise me
          </Button>
        )
      }
      question={QUESTIONS[part].question}
      hint={QUESTIONS[part].hint}
      motionKey={part}
      from={making.from}
      nav={
        <StepNav
          step={step}
          steps={STEPS.length}
          onBack={
            step > 0
              ? () => {
                  setError(null);
                  setMaking({ ...making, step: step - 1, from: "back" });
                }
              : undefined
          }
        >
          <Tooltip words={off}>
            <Button disabled={!!off || saving} onClick={() => void next()}>
              {last ? `Add ${values.name.trim() || "mascot"}` : "Continue"}
            </Button>
          </Tooltip>
        </StepNav>
      }
    >
      <Answer part={part} values={values} set={set} onEnter={() => void next()} making />
      {error && (
        <div className="mt-3 text-center">
          <ChatError message={error} />
        </div>
      )}
    </StepCard>
  );
};

// One part of a mascot, alone, with Cancel and Save. It saves the whole mascot with only that part changed.
export const ChangePart: React.FC<{ tabId: string; mascot: MascotProfile; part: MascotPart }> = ({ tabId, mascot, part }) => {
  const param = mascotsParam({ page: "part", id: mascot.id, part });
  const [values, setValuesState] = useState<MascotFormValues>(() => tabDraft(tabId, param, () => mascotForm(mascot)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set: Set = (patch) => {
    const next = { ...values, ...patch };
    keepTabDraft(tabId, param, next);
    setValuesState(next);
  };
  const off = blocked(part, values);
  const back = () => openMascots({ page: "mascot", id: mascot.id });

  const commit = async () => {
    if (off || saving) return;
    setSaving(true);
    const result = await save(withPart(mascotForm(mascot), values, part));
    setSaving(false);
    if (!result.ok) setError(result.error);
    else back();
  };

  return (
    <StepCard
      mascot={asProfile(values)}
      mood={QUESTIONS[part].mood}
      label={QUESTIONS[part].label}
      question={QUESTIONS[part].question}
      hint={QUESTIONS[part].hint}
      nav={<PartNav off={off} saving={saving} onCancel={back} onSave={() => void commit()} />}
    >
      <Answer part={part} values={values} set={set} onEnter={() => void commit()} making={false} />
      {error && (
        <div className="mt-3 text-center">
          <ChatError message={error} />
        </div>
      )}
    </StepCard>
  );
};
