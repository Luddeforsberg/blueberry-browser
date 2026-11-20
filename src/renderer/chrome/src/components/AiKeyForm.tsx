import React, { useRef } from "react";
import { ArrowUpRight, ClipboardPaste, KeyRound, Lock } from "lucide-react";
import { AI_SERVICES, maskedKey, type AiService } from "@shared/aiKey";
import { Button } from "@common/components/Button";
import { Pips } from "@common/components/Pips";
import { StatusPill } from "@common/components/StatusPill";
import { cn } from "@common/lib/utils";
import { useShell } from "../contexts/useShell";
import { Berry } from "./Berry";
import { ServiceMark } from "./ServiceMark";
import { SERVICES, type KeyTry, type Said } from "./useAiKey";
import { missing } from "@shared/missing";

// DESIGN.md section 10, First run, Give me a brain, and Settings > Connections > AI service: the two services as tiles
// side by side, and one field under them for the chosen one's key. The key is only ever in that field until it's sent to
// main, and the field is emptied once main has kept it. Main never sends it back, only the service and its last four
// characters.

const PROBLEMS: Record<Exclude<Said, "works" | "trying" | null>, (service: AiService) => string> = {
  "nothing-to-paste": () => "There’s no key on the clipboard. Copy it from the service’s page, then press Paste.",
  refused: (service) =>
    `${SERVICES[service].name} turned that key down. Check that it’s whole, and that the account behind it can still be charged.`,
  unreachable: (service) =>
    `I couldn’t reach ${SERVICES[service].name} to try it, so I can’t tell yet. Check your connection and try again.`,
  "not-a-key": () => "That doesn’t look like a key. Paste the whole key, with nothing around it.",
  "not-safe": () => "This computer can’t keep the key encrypted, so it wasn’t saved.",
  "not-saved": () => "The key works, but it couldn’t be saved. Try again.",
  overtaken: () => "Another key or a removal came in while this one was being tried, so this one wasn’t kept. Try again to use it.",
};

// The key itself was wrong, rather than the service out of reach or nothing pasted, so the field says so too.
const KEY_AT_FAULT: Said[] = ["refused", "not-a-key"];

// The two services, a choice of one. The arrow keys move it, as in any group of radio buttons, and only the chosen tile
// is a stop for Tab.
const ServiceTiles: React.FC<{ keyTry: KeyTry }> = ({ keyTry }) => {
  const group = useRef<HTMLDivElement>(null);
  const step = (by: number) => {
    const next = AI_SERVICES[(AI_SERVICES.indexOf(keyTry.service) + by + AI_SERVICES.length) % AI_SERVICES.length] ?? missing("a service");
    keyTry.choose(next);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[AI_SERVICES.indexOf(next)]?.focus();
  };
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="AI service"
      onKeyDown={(event) => {
        const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!by) return;
        event.preventDefault();
        step(by);
      }}
      className="grid grid-cols-2 gap-2"
    >
      {AI_SERVICES.map((service) => {
        const on = keyTry.service === service;
        return (
          <button
            key={service}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => keyTry.choose(service)}
            className={cn(
              "relative h-[60px] px-3.5 flex items-center gap-3 rounded-[14px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
              on
                ? "text-ink shadow-[0_0_0_1.5px_rgb(var(--ink))]"
                : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-ink",
            )}
          >
            <ServiceMark service={service} size={22} />
            <span className="flex-1 min-w-0">
              <span className="block text-14 font-medium truncate">{SERVICES[service].name}</span>
              <span className="block text-13 text-ink-3 truncate">{SERVICES[service].models}</span>
            </span>
            {on && <i aria-hidden className="size-2 shrink-0 rounded-full bg-ink" />}
          </button>
        );
      })}
    </div>
  );
};

// One 46px field, whatever it holds. In the first run's card, as in the cards that make a mascot, the caret marks focus.
const Field: React.FC<{ inCard?: boolean | undefined; atFault?: boolean; focusRing?: boolean; children: React.ReactNode }> = ({
  inCard,
  atFault,
  focusRing,
  children,
}) => (
  <div
    className={cn(
      "h-[46px] mt-2.5 pl-3.5 pr-2 flex items-center gap-2.5 rounded-[14px] text-15",
      inCard ? "bg-card-2" : "bg-sheet-2",
      atFault ? "shadow-[inset_0_0_0_1px_rgb(var(--ask)/0.45)]" : "shadow-[inset_0_0_0_1px_var(--line)]",
      focusRing && !inCard && "focus-within:ring-2 focus-within:ring-focus",
    )}
  >
    {children}
  </div>
);

// The key as it shows once it's out of the field, with a lock: its service's prefix, dots and its last four characters.
const Masked: React.FC<{ service: AiService; last4: string }> = ({ service, last4 }) => (
  <>
    <Lock aria-hidden className="size-[15px] shrink-0 text-ink-3" strokeWidth={1.75} />
    <span className="flex-1 min-w-0 truncate font-mono text-12 text-ink" aria-label={`${SERVICES[service].name} key ending in ${last4}`}>
      {maskedKey(service, last4)}
    </span>
  </>
);

// The two tiles, the field, and one line under it. `tryButton` puts Try the key under the field, for Settings, where
// there's no shell with a button for it. `onRemove` offers Remove in the field once a key is kept.
export const AiKeyForm: React.FC<{ keyTry: KeyTry; onRemove?: () => void; tryButton?: boolean; inCard?: boolean }> = ({
  keyTry,
  onRemove,
  tryButton,
  inCard,
}) => {
  const { saved, service, key, setKey, said, tryKey, works } = keyTry;
  const { accountName } = useShell().settings;
  const input = useRef<HTMLInputElement>(null);
  const { name } = SERVICES[service];
  const kept = works && saved.last4;

  let field: React.ReactNode;
  if (said === "trying") {
    field = (
      <Field inCard={inCard}>
        <Masked service={service} last4={key.trim().slice(-4)} />
        <span role="status" className="mr-1.5 shrink-0 flex items-center gap-2 font-mono text-11.5 text-ink-2">
          <Pips pattern="think" />
          Trying it..
        </span>
      </Field>
    );
  } else if (kept) {
    field = (
      <Field inCard={inCard}>
        <Masked service={service} last4={kept} />
        {said === "works" && (
          <StatusPill tone="on" className="bg-sheet dark:bg-sheet-2 shadow-chip">
            Works
          </StatusPill>
        )}
        {onRemove && (
          <Button variant="raised" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </Field>
    );
  } else {
    field = (
      <Field inCard={inCard} atFault={KEY_AT_FAULT.includes(said)} focusRing>
        <KeyRound aria-hidden className="size-[15px] shrink-0 text-ink-3" strokeWidth={1.75} />
        <input
          ref={input}
          type="password"
          aria-label={`${name} key`}
          aria-invalid={KEY_AT_FAULT.includes(said) || undefined}
          placeholder={`Paste your ${name} key`}
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (tryButton && event.key === "Enter") {
              event.preventDefault();
              void tryKey();
            }
          }}
          className="flex-1 min-w-0 h-full bg-transparent font-mono text-12 text-ink caret-ink outline-none placeholder:font-sans placeholder:text-15 placeholder:text-faint"
        />
        {/* Main gives back the clipboard only if it holds a key, so nothing else on it can be read this way. */}
        <Button
          type="button"
          variant="raised"
          size="sm"
          onClick={() => {
            input.current?.focus();
            void keyTry.paste();
          }}
        >
          <ClipboardPaste aria-hidden strokeWidth={1.75} />
          Paste
        </Button>
      </Field>
    );
  }

  let under: React.ReactNode;
  if (kept && said === "works") {
    under = (
      <p role="status" className="mt-2.5 mx-1 flex items-center gap-[9px] text-14 text-left">
        <span aria-hidden className="flex shrink-0">
          <Berry size={20} mood="delivered" still />
        </span>
        “Hello{accountName ? `, ${accountName}` : ""}. That works. I can think now.”
      </p>
    );
  } else if (said && said !== "works" && said !== "trying") {
    under = (
      <p role="alert" className="mt-2.5 mx-1 text-13 text-ask text-left">
        {PROBLEMS[said](service)}
      </p>
    );
  } else {
    under = (
      <p className="mt-[9px] mx-1 flex justify-between gap-3.5 text-[12.5px] leading-[18px] text-ink-3 text-left">
        <span>Kept encrypted on this computer. You pay {name} for what I use.</span>
        <button
          type="button"
          onClick={() => void window.chromeAPI.aiKey.find(service)}
          className="shrink-0 h-fit inline-flex items-center gap-[3px] font-medium text-ink underline decoration-line underline-offset-[3px] rounded-row outline-none hover:decoration-ink-3 focus-visible:ring-2 focus-visible:ring-focus"
        >
          Get a key
          <ArrowUpRight aria-hidden className="size-3" strokeWidth={1.75} />
        </button>
      </p>
    );
  }

  return (
    <div className="text-left">
      <ServiceTiles keyTry={keyTry} />
      {field}
      {under}
      {tryButton && !kept && (
        <div className="mt-3 flex justify-end">
          <Button disabled={!keyTry.canTry} onClick={() => void tryKey()}>
            Try the key
          </Button>
        </div>
      )}
    </div>
  );
};
