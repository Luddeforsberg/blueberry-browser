import React, { useState } from "react";
import { Check } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import type { RoutinePart } from "@shared/routinePlaces";
import { BERRY_ID } from "@shared/mascots";
import { Choice, Switch } from "@common/components/Controls";
import { StatusPill } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { Berry } from "../components/Berry";
import { useAssistantName } from "../components/useAssistantName";
import { BETWEEN } from "../components/pageRows";
import { MarkedSteps } from "../components/MarkedSteps";
import { FIELD, SiteChips } from "../components/StepCard";
import { narrowerLimits } from "../shortWords";
import { useRunner } from "../useRunner";
import { howOften, scheduleSentence, TIME_CHIPS, withHowOften, type HowOften, type RoutineFormValues } from "../routinesView";
import { blocked, type Set } from "./routineStepRules";

// Part of making a routine (RoutineSteps.tsx): the answer to each step's question.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";

// A choice of one, as a pill: `ink` when chosen, quiet on `card-2` otherwise. Times are the machine's words, in mono.
const Pill: React.FC<{ chosen: boolean; onChoose: () => void; mono?: boolean; quiet: string; children: React.ReactNode }> = ({
  chosen,
  onChoose,
  mono = false,
  quiet,
  children,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={chosen}
    onClick={onChoose}
    className={cn(
      "h-[30px] px-3 inline-flex items-center transition-colors duration-fast",
      mono ? "rounded-[10px] font-mono text-11.5" : "rounded-full text-13",
      chosen ? "bg-ink text-ground" : cn(quiet, "text-ink-2 hover:text-ink"),
      FOCUS,
    )}
  >
    {children}
  </button>
);

// --- Step 1: what it does --------------------------------------------------------------------------------------------

// From Show Berry how, the steps carry their values marked where they stand, and switching one is pressing its mark.
// Chosen when it opens, so editing the last value away doesn't swap the box under the caret.
const DoesAnswer: React.FC<{ values: RoutineFormValues; onChange: (values: RoutineFormValues) => void }> = ({ values, onChange }) => {
  const [marked] = useState(() => (values.recorded?.length ?? 0) > 0);
  if (marked) return <MarkedSteps label="What should I do?" values={values} onChange={onChange} />;
  return (
    <textarea
      autoFocus
      aria-label="What should I do?"
      rows={3}
      maxLength={5000}
      value={values.instructions}
      placeholder="Read SVT and sum up the five biggest stories."
      onChange={(event) => onChange({ ...values, instructions: event.target.value })}
      className={cn(FIELD, "block min-h-[76px] max-h-[260px] px-4 py-[13px] resize-none text-15 leading-[1.5] [field-sizing:content]")}
    />
  );
};

// --- Step 2: when ----------------------------------------------------------------------------------------------------

const HOW_OFTEN: { value: HowOften; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "manual", label: "Only when you ask" },
];

// Monday first, with the numbers the schedule counts by, from Sunday.
const DAYS = [
  { value: 1, short: "Mon", name: "Monday" },
  { value: 2, short: "Tue", name: "Tuesday" },
  { value: 3, short: "Wed", name: "Wednesday" },
  { value: 4, short: "Thu", name: "Thursday" },
  { value: 5, short: "Fri", name: "Friday" },
  { value: 6, short: "Sat", name: "Saturday" },
  { value: 0, short: "Sun", name: "Sunday" },
];

// The schedule read back, with the parts that were chosen on `card-2`.
export const ScheduleSentence: React.FC<{ values: RoutineFormValues; className?: string }> = ({ values, className }) => (
  <p className={cn("text-15 text-ink-2", className)}>
    {scheduleSentence(values).map(({ text, chosen }, at) =>
      chosen ? (
        <b key={at} className="px-[7px] py-0.5 rounded-[7px] bg-card-2 font-medium text-ink">
          {text}
        </b>
      ) : (
        <span key={at}>{text}</span>
      ),
    )}
  </p>
);

// How often as pills, the time as chips with Other…, and what each needs besides. `often` limits the pills, as the card
// under a chat offers only the ones that repeat. `centred` is for the step card. It's always on a card, the step's or
// the one under a chat, whose quiet fill is `card-2`.
export const WhenAnswer: React.FC<{ values: RoutineFormValues; set: Set; often?: HowOften[]; centred?: boolean; cloud?: boolean }> = ({
  values,
  set,
  often,
  centred = true,
  cloud = true,
}) => {
  const quiet = "bg-card-2";
  const [runner] = useRunner();
  const [other, setOther] = useState(() => !TIME_CHIPS.includes(values.time));
  const scheduled = values.kind !== "manual";
  // Only with a runner that has accepted, which is what runs it. One already on stays, so it can be turned off.
  const canRunInCloud = cloud && scheduled && (runner.status === "linked" || values.inCloud === true);
  const row = cn("flex flex-wrap gap-1.5", centred && "justify-center");
  const toggleDay = (day: number) =>
    set({ days: values.days.includes(day) ? values.days.filter((each) => each !== day) : [...values.days, day] });
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="How often" className={row}>
        {HOW_OFTEN.filter(({ value }) => !often || often.includes(value)).map(({ value, label }) => (
          <Pill key={value} quiet={quiet} chosen={howOften(values) === value} onChoose={() => set(withHowOften(values, value))}>
            {label}
          </Pill>
        ))}
      </div>
      {values.kind === "weekly" && howOften(values) === "weekly" && (
        <div role="group" aria-label="Days" className={row}>
          {DAYS.map(({ value, short, name }) => (
            <button
              key={value}
              type="button"
              aria-label={name}
              aria-pressed={values.days.includes(value)}
              onClick={() => toggleDay(value)}
              className={cn(
                "h-[30px] w-12 rounded-full text-13 transition-colors duration-fast",
                values.days.includes(value) ? "bg-ink text-ground" : cn(quiet, "text-ink-2 hover:text-ink"),
                FOCUS,
              )}
            >
              {short}
            </button>
          ))}
        </div>
      )}
      {(values.kind === "monthly" || values.kind === "once") && (
        <div className={row}>
          {values.kind === "monthly" ? (
            <label className={cn("h-[30px] pl-3 pr-1 inline-flex items-center gap-2 rounded-full text-13 text-ink-2", quiet)}>
              On day
              <input
                type="number"
                min={1}
                max={31}
                aria-label="Day of the month"
                value={values.day}
                onChange={(event) => set({ day: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })}
                className="w-14 h-6 px-2 rounded-full bg-sheet text-ink font-mono text-11.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </label>
          ) : (
            <input
              type="date"
              aria-label="Date"
              value={values.date}
              onChange={(event) => set({ date: event.target.value })}
              className={cn(
                "h-[30px] px-3 rounded-[10px] text-ink font-mono text-11.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus",
                quiet,
              )}
            />
          )}
        </div>
      )}
      {scheduled && (
        <div role="radiogroup" aria-label="Time" className={row}>
          {TIME_CHIPS.map((time) => (
            <Pill
              key={time}
              quiet={quiet}
              mono
              chosen={!other && values.time === time}
              onChoose={() => {
                setOther(false);
                set({ time });
              }}
            >
              {time}
            </Pill>
          ))}
          {other ? (
            <input
              type="time"
              autoFocus={!TIME_CHIPS.includes(values.time)}
              aria-label="Other time"
              value={values.time}
              onChange={(event) => set({ time: event.target.value })}
              className="h-[30px] px-3 rounded-[10px] bg-ink text-ground font-mono text-11.5 tabular-nums outline-none [color-scheme:dark] dark:[color-scheme:light] focus-visible:ring-2 focus-visible:ring-focus"
            />
          ) : (
            <Pill quiet={quiet} chosen={false} onChoose={() => setOther(true)}>
              Other…
            </Pill>
          )}
        </div>
      )}
      <p className={cn("mt-1 text-13 text-ink-2", centred && "text-center")}>
        {!scheduled
          ? "It only runs when you press Run now."
          : values.inCloud
            ? "It runs in the cloud at this time, even with your computer off, and its run shows as a chat."
            : values.kind === "monthly" && values.day > 28
              ? "In shorter months, it runs on the last day. If Blueberry is closed then, it runs once when you next open it."
              : "If Blueberry is closed at this time, it runs once when you next open it and says it was late."}
      </p>
      {canRunInCloud && (
        <div className={cn("flex items-center gap-3", centred && "justify-center")}>
          <span id="routine-in-cloud" className="text-14 text-ink">
            Runs even when your computer is off
          </span>
          <Switch labelledBy="routine-in-cloud" checked={values.inCloud === true} onChange={(on) => set({ inCloud: on })} />
        </div>
      )}
    </div>
  );
};

// --- Step 3: who does it ---------------------------------------------------------------------------------------------

const WhoAnswer: React.FC<{ values: RoutineFormValues; set: Set }> = ({ values, set }) => {
  const { mascots } = useMascots();
  const chosen = values.mascotId ?? BERRY_ID;
  return (
    <ul
      role="radiogroup"
      aria-label="Who does it"
      className="max-h-[300px] overflow-y-auto rounded-sheet shadow-[inset_0_0_0_1px_var(--line)]"
    >
      {mascots.map((mascot) => {
        const limits = narrowerLimits(mascot);
        const on = chosen === mascot.id;
        return (
          <li key={mascot.id} className={cn(BETWEEN, "before:left-[52px]")}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ mascotId: mascot.id === BERRY_ID ? null : mascot.id })}
              className={cn("w-full min-h-12 py-2 pl-3 pr-3 flex items-center gap-3 text-left transition-colors hover:bg-hover", FOCUS)}
            >
              <Berry size={28} mascot={mascot} still />
              <MascotName mascot={mascot} />
              {limits && <StatusPill>{limits}</StatusPill>}
              <span
                aria-hidden
                className={cn(
                  "size-5 shrink-0 grid place-items-center rounded-full",
                  on ? "bg-ink text-ground" : "shadow-[inset_0_0_0_1.5px_var(--faint)]",
                )}
              >
                {on && <Check className="size-3" strokeWidth={2.5} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const MascotName: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => (
  <span className="flex-1 min-w-0 truncate text-14 font-medium text-ink">{useAssistantName(mascot)}</span>
);

// --- Step 4: where it may go -----------------------------------------------------------------------------------------

const WhereAnswer: React.FC<{ values: RoutineFormValues; set: Set }> = ({ values, set }) => {
  const mascot = useMascots().find(values.mascotId);
  const name = useAssistantName(mascot);
  return (
    <>
      <div className="mb-2.5 flex justify-center">
        <Choice
          label="Where it may go"
          value={values.onlySomeSites ? "some" : "any"}
          onChange={(choice) => set({ onlySomeSites: choice === "some" })}
          options={[
            { value: "any", label: "Anywhere" },
            { value: "some", label: "Only these sites" },
          ]}
        />
      </div>
      {values.onlySomeSites && <SiteChips sites={values.sites} onChange={(sites) => set({ sites })} problem={blocked("where", values)} />}
      {mascot.sites.length > 0 && (
        <p className="mt-3 text-center text-13 text-ink-2">
          {name} keeps to {mascot.sites.join(", ")} anyway. This can only narrow that.
        </p>
      )}
    </>
  );
};

const NameAnswer: React.FC<{ values: RoutineFormValues; set: Set; onEnter: () => void }> = ({ values, set, onEnter }) => (
  <input
    autoFocus
    aria-label="Name"
    maxLength={100}
    value={values.name}
    onChange={(event) => set({ name: event.target.value })}
    onKeyDown={(event) => {
      if (event.key === "Enter") onEnter();
    }}
    className={cn(FIELD, "h-[52px] px-4 text-center text-20 font-medium")}
  />
);

export const Answer: React.FC<{
  part: RoutinePart;
  values: RoutineFormValues;
  onChange: (values: RoutineFormValues) => void;
  onEnter: () => void;
}> = ({ part, values, onChange, onEnter }) => {
  const set: Set = (patch) => onChange({ ...values, ...patch });
  switch (part) {
    case "does":
      return <DoesAnswer values={values} onChange={onChange} />;
    case "when":
      return (
        <>
          <ScheduleSentence values={values} className="mb-4 text-center" />
          <WhenAnswer values={values} set={set} />
        </>
      );
    case "who":
      return <WhoAnswer values={values} set={set} />;
    case "where":
      return <WhereAnswer values={values} set={set} />;
    case "name":
      return <NameAnswer values={values} set={set} onEnter={onEnter} />;
  }
};
