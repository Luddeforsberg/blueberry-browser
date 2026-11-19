import React, { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@common/lib/utils";
import { Button } from "@common/components/Button";
import { StatusPill, type PillTone } from "@common/components/StatusPill";
import { LINE_BETWEEN, ON_ROW, ROW } from "./pageRows";

// DESIGN.md section 10, Settings and A page in a tab: a group is a label in words and its rows, straight on the page,
// and a row has its name on the left, at most one line of explanation, and one control on the right. Anything longer
// waits behind More, or on a page one step in.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";

// What a group is called. Over named settings it's a heading, 15px semibold in `ink` with a hairline under it, so it's
// never weaker than the rows it names. In a `list`, where it only divides rows of content, such as the days of History,
// it's a label, 13px medium in `ink-2`. `count` is beside it in mono, and `trailing` sits at its right, such as a button
// that adds a row.
export const SettingsLabel: React.FC<{
  id?: string;
  list?: boolean | undefined;
  count?: number | undefined;
  tone?: "ask" | undefined;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, list = false, count, tone, trailing, children }) => (
  <h3
    id={id}
    className={cn(
      "flex items-baseline gap-[7px]",
      list ? "min-h-[18px] mt-6 mb-1.5 px-2 text-13 font-medium" : "mt-8 mx-2 pb-[9px] border-b border-line text-15 font-semibold",
      tone === "ask" ? "text-ask" : list ? "text-ink-2" : "text-ink",
    )}
  >
    {children}
    {count !== undefined && <span className="font-mono text-11.5 font-normal text-faint tabular-nums">{count}</span>}
    {trailing && <span className="ml-auto self-center flex items-center">{trailing}</span>}
  </h3>
);

export const SettingsGroup: React.FC<{
  label?: React.ReactNode;
  list?: boolean;
  count?: number | undefined;
  tone?: "ask" | undefined;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, list, count, tone, trailing, children }) => {
  const id = useId();
  return (
    <section aria-labelledby={label ? id : undefined} className={label ? undefined : "mt-4"}>
      {label && (
        <SettingsLabel id={id} list={list} count={count} tone={tone} trailing={trailing}>
          {label}
        </SettingsLabel>
      )}
      <div>{children}</div>
    </section>
  );
};

// A row's name is a heading under its group's label, so a screen reader can move from row to row.
const Words: React.FC<{ id: string; title: React.ReactNode; description?: React.ReactNode; more?: string | undefined }> = ({
  id,
  title,
  description,
  more,
}) => (
  <div className="flex-1 min-w-0">
    <h4 id={id} className="text-14 font-medium text-ink break-words">
      {title}
    </h4>
    {description && (
      <div className="mt-0.5 text-13 text-ink-2 break-words">
        {description}
        {more && (
          <>
            {" "}
            <More about={id} text={more} />
          </>
        )}
      </div>
    )}
  </div>
);

// Where the hairline between rows starts: where the text does, after the 32px tile when a row has one.
const lineFrom = (lead: React.ReactNode) => (lead ? "before:left-[52px]" : "before:left-2");

// A row. `children` is its one control, at the right. `below` is what can't fit beside its name, such as a form, and goes
// under it at the row's full width. `lead` is an icon or face before the name.
export const SettingsRow: React.FC<{
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  more?: string | undefined;
  lead?: React.ReactNode;
  below?: React.ReactNode;
  // For a control taller than a line, such as pictures: the name sits at the top beside it.
  top?: boolean;
  children?: React.ReactNode;
}> = ({ id, title, description, more, lead, below, top = false, children }) => (
  <div className={cn(ROW, LINE_BETWEEN, lineFrom(lead), "min-h-[52px]", top ? "pt-3.5 pb-3" : "py-[11px]")}>
    <div className={cn("min-h-[30px] flex gap-3", top ? "items-start" : "items-center")}>
      {lead}
      <Words id={id} title={title} description={description} more={more} />
      {children}
    </div>
    {below && <div className="mt-2.5 mb-1">{below}</div>}
  </div>
);

// A row that opens something: a page one step in, or another page. The whole row is the button, with an arrow at its end
// and, before that, its state as a pill or a quiet value. With a next step, such as Set up, that's a raised button
// beside the pill in place of the arrow. It does what the row does or its own one thing, and sits over the row's button,
// since one button can't hold another.
export const SettingsLink: React.FC<{
  title: string;
  description?: string;
  lead?: React.ReactNode;
  // A quiet value, which may lead with a small face. It's cut short rather than pushing the name aside.
  value?: React.ReactNode;
  state?: { words: string; tone?: PillTone } | undefined;
  action?: { label: string; onAct: () => void } | undefined;
  onOpen: () => void;
}> = ({ title, description, lead, value, state, action, onOpen }) => {
  const descriptionId = useId();
  const row = cn(ROW, ON_ROW, LINE_BETWEEN, lineFrom(lead), "w-full min-h-[52px] py-[11px] flex items-center gap-3 text-left");
  const words = (
    <>
      {lead}
      <span className="flex-1 min-w-0">
        <span className="block text-14 font-medium text-ink break-words">{title}</span>
        {description && (
          <span id={descriptionId} className="block mt-0.5 text-13 text-ink-2 break-words">
            {description}
          </span>
        )}
      </span>
      {value && (
        <span className="min-w-0 max-w-[300px] flex items-center gap-[7px] text-13 text-ink-2 whitespace-nowrap [&>:last-child]:truncate">
          {value}
        </span>
      )}
      {state && <StatusPill tone={state.tone}>{state.words}</StatusPill>}
    </>
  );
  if (action) {
    return (
      <div className={cn(row, "has-[>button:first-child:active]:bg-press")}>
        <button
          type="button"
          aria-label={state ? `${title}, ${state.words}` : title}
          aria-describedby={description ? descriptionId : undefined}
          onClick={onOpen}
          className={cn("absolute inset-0 rounded-[inherit]", FOCUS)}
        />
        <span className="contents pointer-events-none [&>*]:pointer-events-none">{words}</span>
        <Button variant="raised" size="sm" className="relative" onClick={action.onAct}>
          {action.label}
        </Button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={cn(row, "active:bg-press", FOCUS)}>
      {words}
      <ChevronRight aria-hidden className="leans size-3.5 shrink-0 -ml-1 text-faint" strokeWidth={1.75} />
    </button>
  );
};

// An icon that stands for a thing, on a 32px `sheet-2` tile with a hairline, before a row's name.
export const RowTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    aria-hidden
    className="size-8 shrink-0 flex items-center justify-center rounded-[10px] bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)] text-ink [&>svg]:size-4"
  >
    {children}
  </span>
);

// A quiet way back, naming where it goes.
export const BackButton: React.FC<{ back: string; onBack: () => void }> = ({ back, onBack }) => (
  <button
    type="button"
    onClick={onBack}
    className={cn(
      "self-start h-[26px] -ml-1.5 mb-3 pl-1 pr-2.5 inline-flex items-center gap-1 rounded-row text-13 text-ink-2 transition-colors hover:bg-hover hover:text-ink",
      FOCUS,
    )}
  >
    <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
    <span>
      <span className="sr-only">Back to </span>
      {back}
    </span>
  </button>
);

// The top of a page one step in: a quiet way back naming its section, its title, and a line or two on what it is.
export const StepInHeader: React.FC<{ back: string; onBack: () => void; title: string; children?: React.ReactNode }> = ({
  back,
  onBack,
  title,
  children,
}) => (
  <>
    <BackButton back={back} onBack={onBack} />
    <h2 className="text-20 font-semibold">{title}</h2>
    {children && <p className="mt-1 max-w-[520px] text-14 leading-[1.45] text-ink-2">{children}</p>}
  </>
);

// A quiet link at the end of a line that shows the rest under it. `about` is the heading it belongs to, for a screen reader.
export const More: React.FC<{ text: string; about?: string }> = ({ text, about }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={about}
        onClick={() => setOpen(!open)}
        className="rounded-row text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
      >
        {open ? "Less" : "More"}
      </button>
      {open && (
        <span id={id} className="block mt-1">
          {text}
        </span>
      )}
    </>
  );
};
