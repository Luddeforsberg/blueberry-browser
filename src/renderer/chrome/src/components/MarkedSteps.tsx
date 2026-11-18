import React, { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@common/lib/utils";
import {
  askingLines,
  stepsPieces,
  switchAsking,
  typedInto,
  withStepsPieces,
  type RecordedChangeValue,
  type RoutineFormValues,
  type StepsPiece,
} from "../routinesView";
import { FIELD } from "./StepCard";

// DESIGN.md section 10, Routines, From Show Berry how: the steps in the box, with each value that might differ from run
// to run marked where it stands, and beside it what happens to it, which is a button that switches it. The box is plain
// text you type in, and the marks are drawn into it here rather than by React, because the browser changes the text as
// the user types. After every change it's read back as plain text and values, so what shows is what's saved, and a value
// whose mark is emptied stops being one.

const MARK = "data-value";
const SWITCH = "data-switch";
// The value in medium on a tint of `focus`, and the switch carrying on the tint, so the two read as one mark.
const VALUE = "rounded-l-[7px] bg-focus/10 py-[3px] pl-1.5 font-medium [box-decoration-break:clone]";
// The focus ring goes round the words on the switch, so its gap never covers the value beside it.
const SWITCHED = "group/switch rounded-r-[7px] bg-focus/10 py-[3px] pl-1.5 pr-[3px] select-none cursor-pointer outline-none";
const SAYS =
  "rounded-[5px] bg-sheet px-[5px] py-px font-mono text-11 text-ink-2 shadow-[0_0_0_1px_rgb(var(--focus)/0.18)] group-hover/switch:text-ink group-focus-visible/switch:ring-2 group-focus-visible/switch:ring-focus";

const said = (row: RecordedChangeValue) => (row.ask ? "ask me each run" : "same each run");

// What the box says, as plain text and values. A switch isn't part of it, and nor is the break that keeps an empty last
// line open. Text the browser put beside a value, but outside it, is plain.
const readPieces = (from: Node): StepsPiece[] => {
  const pieces: StepsPiece[] = [];
  const add = (text: string, row?: number) => {
    const last = pieces.at(-1);
    if (last && last.row === row) last.text += text;
    else if (text) pieces.push({ text, row });
  };
  const walk = (node: Node, row?: number) =>
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return add(child.textContent ?? "", row);
      if (!(child instanceof HTMLElement) || child.hasAttribute(SWITCH) || child.hasAttribute("data-end")) return;
      if (child.tagName === "BR") return add("\n");
      // A line the browser made a block of starts on a line of its own.
      if (child.tagName === "DIV" || child.tagName === "P") {
        if (pieces.length > 0 && !pieces.at(-1)?.text.endsWith("\n")) add("\n");
      }
      walk(child, child.hasAttribute(MARK) ? Number(child.getAttribute(MARK)) : row);
    });
  walk(from);
  return pieces;
};

const textOf = (pieces: StepsPiece[]) => pieces.map(({ text }) => text).join("");

// How far into what the box says a point is.
const offsetOf = (box: HTMLElement, node: Node, offset: number) => {
  const range = document.createRange();
  range.selectNodeContents(box);
  range.setEnd(node, offset);
  return textOf(readPieces(range.cloneContents())).length;
};

// The caret at a point in what the box says. At the end of a value it stays in the value, so typing there changes it.
const placeCaret = (box: HTMLElement, offset: number) => {
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(`[${SWITCH}]`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let left = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (left <= length) return getSelection()?.collapse(node, left);
    left -= length;
  }
  getSelection()?.collapse(box, box.childNodes.length);
};

const draw = (box: HTMLElement, pieces: StepsPiece[], rows: RecordedChangeValue[]) => {
  const nodes = pieces.flatMap(({ text, row }): Node[] => {
    if (row === undefined) return [document.createTextNode(text)];
    const value = document.createElement("span");
    value.setAttribute(MARK, String(row));
    value.className = VALUE;
    value.textContent = text;
    const button = document.createElement("button");
    button.type = "button";
    button.contentEditable = "false";
    button.setAttribute(SWITCH, String(row));
    button.setAttribute("aria-label", `${rows[row].label}: ${said(rows[row])}`);
    button.className = SWITCHED;
    const words = document.createElement("span");
    words.className = SAYS;
    words.textContent = said(rows[row]);
    button.append(words);
    return [value, button];
  });
  // A last line with nothing on it only shows with a break after it.
  if (textOf(pieces).endsWith("\n")) {
    const end = document.createElement("br");
    end.setAttribute("data-end", "");
    nodes.push(end);
  }
  box.replaceChildren(...nodes);
};

const samePieces = (a: StepsPiece[], b: StepsPiece[]) =>
  a.length === b.length && a.every((piece, at) => piece.text === b[at].text && piece.row === b[at].row);

// Each switch in the box saying what its value's row says.
const switchesMatch = (box: HTMLElement, rows: RecordedChangeValue[], marks: number) => {
  const switches = [...box.querySelectorAll<HTMLElement>(`[${SWITCH}]`)];
  return switches.length === marks && switches.every((button) => button.textContent === said(rows[Number(button.getAttribute(SWITCH))]));
};

export const MarkedSteps: React.FC<{ label: string; values: RoutineFormValues; onChange: (values: RoutineFormValues) => void }> = ({
  label,
  values,
  onChange,
}) => {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ values, onChange });
  latest.current = { values, onChange };
  // Where the caret goes once the box is drawn again, after a change made here rather than by the browser.
  const caret = useRef<number | null>(null);
  const rows = values.recorded ?? [];
  const asking = askingLines(rows);

  // Drawn again only when what it shows isn't what the values say, so typing never moves the caret.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const pieces = stepsPieces(values);
    const marks = pieces.filter(({ row }) => row !== undefined).length;
    if (samePieces(readPieces(element), pieces) && switchesMatch(element, rows, marks)) return;
    const focused = document.activeElement;
    const selection = getSelection();
    const at =
      caret.current ?? (focused === element && selection?.focusNode ? offsetOf(element, selection.focusNode, selection.focusOffset) : null);
    const switchFocused = focused instanceof HTMLElement && element.contains(focused) ? focused.getAttribute(SWITCH) : null;
    caret.current = null;
    draw(element, pieces, rows);
    if (switchFocused !== null) element.querySelector<HTMLElement>(`[${SWITCH}="${switchFocused}"]`)?.focus();
    else if (at !== null) placeCaret(element, at);
  });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.focus();
    // Typing over a selection, and a line break, are done by hand, because the browser gets them wrong here: typed
    // over all or part of a value, the mark could go with the text it held, and a break at the end of one goes
    // inside it, twice. Typing or pasting a line at the caret is left to the browser.
    const typeOver = (event: InputEvent) => {
      const breaks = event.inputType === "insertParagraph" || event.inputType === "insertLineBreak";
      const typed = breaks ? "\n" : event.inputType.startsWith("insert") ? (event.data ?? event.dataTransfer?.getData("text/plain")) : null;
      const [range] = event.getTargetRanges();
      if (!typed || !range || (range.collapsed && !typed.includes("\n"))) return;
      const start = offsetOf(element, range.startContainer, range.startOffset);
      const end = offsetOf(element, range.endContainer, range.endOffset);
      const changed = typedInto(readPieces(element), start, end, typed);
      event.preventDefault();
      caret.current = start + typed.length;
      const { values: now, onChange: change } = latest.current;
      change(withStepsPieces(now, changed));
    };
    element.addEventListener("beforeinput", typeOver);
    return () => element.removeEventListener("beforeinput", typeOver);
  }, []);

  const switchAt = (target: EventTarget) => (target instanceof Element ? target.closest(`[${SWITCH}]`) : null);

  return (
    <div className={cn(FIELD, "px-4 py-[13px] text-15 leading-7")}>
      {/* The lines that make a run ask are part of what's saved, so they show, but they come from the marks. */}
      {asking.map((line) => (
        <p key={line} className="mb-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {line}
        </p>
      ))}
      <div
        ref={box}
        role="textbox"
        aria-multiline
        aria-label={label}
        contentEditable="plaintext-only"
        onInput={() => {
          const element = box.current;
          if (element) onChange(withStepsPieces(values, readPieces(element)));
        }}
        onClick={(event) => {
          const button = switchAt(event.target);
          if (button) onChange(switchAsking(values, Number(button.getAttribute(SWITCH))));
        }}
        className="min-h-[50px] max-h-[260px] overflow-y-auto outline-none whitespace-pre-wrap [overflow-wrap:anywhere]"
      />
    </div>
  );
};
