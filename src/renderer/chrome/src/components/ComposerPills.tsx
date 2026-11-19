import React, { useRef } from "react";
import { Check, ChevronDown, Cloud, Laptop, Plus } from "lucide-react";
import type { MascotProfile } from "@shared/library";
import type { Mood } from "@common/components/moods";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { limitsInBrief } from "../shortWords";
import { startMascot } from "../mascotsView";
import { MenuRule, MenuSheet } from "./MenuSheet";
import { menuRowClass } from "./menuRows";
import { Tooltip } from "@common/components/Tooltip";
import { SwitchSheet } from "@common/components/Controls";

// Part of the prompt box (Composer.tsx): the mascot's pill and its menu, and where a job runs.

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";

// What the mascot in the pill shows while one gives way to another (see useMascotSwitch on the new tab).
export interface PillFace {
  mood: Mood;
  shut: boolean;
  // Changes each time a new one arrives, so it pops in again.
  arrival: number;
}

// The menu under the pill: one row per mascot, its face, its name and what it may do, with a tick on the current one.
export const MascotMenu: React.FC<{
  chosenId: string;
  above: boolean;
  leaving: boolean;
  onChoose: (id: string) => void;
  onClose: (refocus: boolean) => void;
}> = ({ chosenId, above, leaving, onChoose, onClose }) => {
  const { mascots } = useMascots();
  return (
    <MenuSheet label="Choose who to ask" above={above} align="right" className="w-[316px]" leaving={leaving} onClose={onClose}>
      {mascots.map((mascot) => (
        <MenuRow key={mascot.id} mascot={mascot} checked={mascot.id === chosenId} onChoose={() => onChoose(mascot.id)} />
      ))}
      <MenuRule />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          startMascot();
          onClose(false);
        }}
        className={cn(menuRowClass(false), "text-ink-2 hover:text-ink")}
      >
        <span className="size-7 flex items-center justify-center">
          <Plus className="size-4" strokeWidth={1.75} />
        </span>
        New mascot
      </button>
    </MenuSheet>
  );
};

const MenuRow: React.FC<{ mascot: MascotProfile; checked: boolean; onChoose: () => void }> = ({ mascot, checked, onChoose }) => {
  const name = useAssistantName(mascot);
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} onClick={onChoose} className={menuRowClass(true)}>
      <Berry size={28} mascot={mascot} still />
      <span className="flex-1 min-w-0">
        <span className="block truncate">{name}</span>
        <span className="block mt-px text-13 text-ink-2 truncate">{limitsInBrief(mascot)}</span>
      </span>
      {checked && <Check className="size-4 shrink-0 text-ink" strokeWidth={1.75} />}
    </button>
  );
};

// Says who this goes to. Where the choice is still open it opens the menu, and anywhere else it only says who.
export const MascotPill: React.FC<{
  mascot: MascotProfile;
  face?: PillFace;
  small: boolean;
  // On the chat's card, where a quiet fill is `card-2`.
  onCard: boolean;
  chooser?: { open: boolean; onToggle: () => void; onOpen: () => void; button: React.Ref<HTMLButtonElement> };
}> = ({ mascot, face, small, onCard, chooser }) => {
  const name = useAssistantName(mascot);
  const { keepBerryStill } = useShell().settings;
  const look = cn(
    "shrink-0 flex items-center gap-[7px] rounded-full bg-sheet shadow-[inset_0_0_0_1px_var(--line)] text-13 text-ink",
    small ? "h-7 pl-1 pr-2" : "h-[30px] pl-[5px] pr-[9px]",
  );
  const drawn = (
    <span
      key={face?.arrival}
      className={cn(
        "flex origin-[50%_70%]",
        face && face.arrival > 0 && (keepBerryStill ? "animate-[mascot-fade_150ms_ease-out]" : "animate-mascot-pop"),
      )}
    >
      <Berry size={20} mascot={mascot} mood={face?.mood ?? "rest"} shut={face?.shut} />
    </span>
  );
  if (!chooser) {
    return (
      <span aria-label={`This chat is with ${name}`} className={cn(look, "pr-[11px] cursor-default")}>
        {drawn}
        <span className="max-w-28 truncate">{name}</span>
      </span>
    );
  }
  return (
    <Tooltip words="Choose a mascot">
      <button
        ref={chooser.button}
        type="button"
        aria-label={`Asking ${name}. Choose who to ask`}
        aria-haspopup="menu"
        aria-expanded={chooser.open}
        onClick={chooser.onToggle}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !chooser.open) {
            event.preventDefault();
            chooser.onOpen();
          }
        }}
        className={cn(
          look,
          "press",
          onCard ? "hover:bg-card-2" : "hover:bg-sheet-2",
          chooser.open && (onCard ? "bg-card-2" : "bg-sheet-2"),
          FOCUS,
        )}
      >
        {drawn}
        <span className="max-w-28 truncate">{name}</span>
        <ChevronDown
          className={cn("size-3 text-ink-3 transition-transform duration-menu ease-crisp", chooser.open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
    </Tooltip>
  );
};

// This Mac or Cloud, as a segmented control. The chosen side carries its name, the other is its icon alone, and choosing
// the other slides the sheet across as one name opens out and the other closes.
export const WhereSwitch: React.FC<{ on: boolean; onToggle: () => void; small: boolean }> = ({ on, onToggle, small }) => {
  const group = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  // The words follow the platform (DESIGN.md section 14).
  const mac = useShell().theme.platform === "mac";
  const here = mac ? "This Mac" : "This PC";
  const sides = ([false, true] as const).map((cloud) => ({
    chosen: on === cloud,
    Icon: cloud ? Cloud : Laptop,
    label: cloud ? "Cloud" : here,
    // What each side does, in the state it's in.
    tip: cloud
      ? `${on ? "Runs" : "Run"} in the cloud, with your ${mac ? "Mac" : "PC"} off`
      : `${on ? "Run" : "Runs"} on ${mac ? "this Mac" : "this PC"}`,
  }));
  const side = cn("flex items-center rounded-full text-13", small ? "h-6 px-2" : "h-7 px-2.5");
  const name = (chosen: boolean) =>
    cn("whitespace-nowrap overflow-hidden", chosen ? "max-w-20 ml-1.5 opacity-100" : "max-w-0 ml-0 opacity-0");
  return (
    <div ref={group} role="radiogroup" aria-label="Where it runs" className="relative shrink-0 flex p-0.5 rounded-full bg-sheet-2">
      {/* The sides as they'll end, for the sheet to head for. */}
      <span ref={ruler} aria-hidden className="absolute inset-0 p-0.5 flex invisible pointer-events-none">
        {sides.map(({ chosen, Icon, label }) => (
          <span key={label} data-side className={side}>
            <Icon className="size-4" strokeWidth={1.75} />
            <span className={name(chosen)}>{label}</span>
          </span>
        ))}
      </span>
      <SwitchSheet
        group={group}
        ruler={ruler}
        chosen={on ? 1 : 0}
        className="bg-sheet shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.1)]"
      />
      {sides.map(({ chosen, Icon, label, tip }) => (
        <Tooltip key={label} words={tip}>
          <button
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={label}
            onClick={() => !chosen && onToggle()}
            className={cn(side, "press relative", chosen ? "text-ink" : "text-ink-3 hover:text-ink", FOCUS)}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            <span aria-hidden className={cn(name(chosen), "transition-[max-width,margin,opacity] duration-slide ease-crisp")}>
              {label}
            </span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
};
