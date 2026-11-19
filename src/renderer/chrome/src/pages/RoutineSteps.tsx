import React, { useEffect, useRef, useState } from "react";
import type { Routine } from "@shared/library";
import { routinesParam, type RoutinePart } from "@shared/routinePlaces";
import { Button } from "@common/components/Button";
import { BIG_CARD, BIG_SHELL } from "@common/components/cardShell";
import { LABEL } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { BerrySpot } from "../components/Berry";
import { useAssistantName } from "../components/useAssistantName";
import { ChatError } from "../components/ChatMessage";
import { PartNav, StepCard, StepNav } from "../components/StepCard";
import { formatTime } from "../components/formatTime";
import { keepTabDraft, tabDraft } from "../mascotsView";
import {
  blankForm,
  formFor,
  NEW_ROUTINE_EVENT,
  openRoutines,
  readBack,
  takeStartedRoutine,
  toDraft,
  withRoutinePart,
  type RoutineFormValues,
} from "../routinesView";
import { Tooltip } from "@common/components/Tooltip";
import { PART_NAMES } from "./routineParts";
import { STEPS, QUESTIONS, hintFor, blocked } from "./routineStepRules";
import { Answer } from "./RoutineAnswers";
export { ScheduleSentence, WhenAnswer } from "./RoutineAnswers";

// DESIGN.md section 10, Routines: making one is four questions, one at a time, in the voice of the mascot that will do
// it, on the same card as making a mascot. The name is never asked for: main names it from what it does. Changing one
// part later is the same card, alone.

const api = () => window.chromeAPI.routines;

// --- Making one ------------------------------------------------------------------------------------------------------

type Making = { values: RoutineFormValues; step: number; from: "next" | "back"; savedId: string | null };

const fresh = (values: RoutineFormValues = blankForm()): Making => ({ values, step: 0, from: "next", savedId: null });

// It ends here: the mascot looking pleased, and the routine read back as one sentence.
const SavedCard: React.FC<{ routine: Routine | null; values: RoutineFormValues; id: string }> = ({ routine, values, id }) => {
  const mascot = useMascots().find(routine?.mascotId ?? values.mascotId);
  const name = useAssistantName(mascot);
  const shown = routine ? formFor(routine) : values;
  return (
    <section aria-label="Saved as a routine" className="w-[520px] max-w-full mx-auto">
      <div className={BIG_SHELL}>
        <div className={cn(BIG_CARD, "bg-card px-7 pt-[30px] pb-[26px] text-center animate-fade-in")}>
          <div className="mb-3 flex justify-center">
            <BerrySpot size={72} mascot={mascot} mood="delivered" />
          </div>
          <p className={LABEL}>Saved as a routine</p>
          <h2 className="mt-1.5 mb-2 text-20 font-medium line-clamp-3 [overflow-wrap:anywhere]">{readBack(shown, name)}</h2>
          {routine?.nextRunAt && <p className="font-mono text-11.5 text-ink-3">next {formatTime(routine.nextRunAt)}</p>}
          <div className="mt-[22px] flex justify-center gap-2">
            <Button
              onClick={() => {
                void api().runNow(id);
                openRoutines({ page: "routine", id });
              }}
            >
              Run it now
            </Button>
            <Button variant="raised" onClick={() => openRoutines({ page: "routine", id })}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

// Making one, in four steps. What's typed lasts while the tab stays open, and saves nothing until the last step.
export const NewRoutine: React.FC<{ tabId: string; routines: Routine[] }> = ({ tabId, routines }) => {
  const param = routinesParam({ page: "new" });
  const { find } = useMascots();
  const [making, setMakingState] = useState<Making>(() => {
    const started = takeStartedRoutine();
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

  // Started again from elsewhere while the steps show, with whatever it was given.
  useEffect(() => {
    const restart = () => {
      const started = takeStartedRoutine();
      if (started) {
        latest.current(fresh(started));
        setError(null);
      }
    };
    window.addEventListener(NEW_ROUTINE_EVENT, restart);
    return () => window.removeEventListener(NEW_ROUTINE_EVENT, restart);
  }, []);

  const { values, step, savedId } = making;
  if (savedId) return <SavedCard routine={routines.find((routine) => routine.id === savedId) ?? null} values={values} id={savedId} />;

  const part = STEPS[step];
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
    const result = await api().save(null, toDraft(values));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId);
    setError(null);
    setMaking({ ...making, savedId: result.id });
  };

  return (
    <StepCard
      mascot={find(values.mascotId)}
      mood={QUESTIONS[part].mood}
      label={`${step + 1} / ${STEPS.length}`}
      question={QUESTIONS[part].question}
      hint={hintFor(part, values)}
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
              {last ? "Save routine" : "Continue"}
            </Button>
          </Tooltip>
        </StepNav>
      }
    >
      <Answer part={part} values={values} onChange={(changed) => setMaking({ ...making, values: changed })} onEnter={() => void next()} />
      {error && (
        <div className="mt-3 text-center">
          <ChatError message={error} />
        </div>
      )}
    </StepCard>
  );
};

// One part of a routine, alone, with Cancel and Save. It saves the whole routine with only that part changed.
export const ChangeRoutinePart: React.FC<{ tabId: string; routine: Routine; part: RoutinePart }> = ({ tabId, routine, part }) => {
  const param = routinesParam({ page: "part", id: routine.id, part });
  const { find } = useMascots();
  const [values, setValuesState] = useState<RoutineFormValues>(() => tabDraft(tabId, param, () => formFor(routine)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setValues = (next: RoutineFormValues) => {
    keepTabDraft(tabId, param, next);
    setValuesState(next);
  };
  const off = blocked(part, values);
  const back = () => openRoutines({ page: "routine", id: routine.id });

  const commit = async () => {
    if (off || saving) return;
    setSaving(true);
    const result = await api().save(routine.id, toDraft(withRoutinePart(formFor(routine), values, part)));
    setSaving(false);
    if (!result.ok) setError(result.error);
    else back();
  };

  return (
    <StepCard
      mascot={find(values.mascotId)}
      mood={QUESTIONS[part].mood}
      label={PART_NAMES[part]}
      question={QUESTIONS[part].question}
      hint={hintFor(part, values)}
      nav={<PartNav off={off} saving={saving} onCancel={back} onSave={() => void commit()} />}
    >
      <Answer part={part} values={values} onChange={setValues} onEnter={() => void commit()} />
      {error && (
        <div className="mt-3 text-center">
          <ChatError message={error} />
        </div>
      )}
    </StepCard>
  );
};
