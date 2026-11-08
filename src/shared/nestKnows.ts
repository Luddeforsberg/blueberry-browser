import type { LineCrossing } from "./nestTable";

// What a card knows from outside its own thread, counted, never anything of what's in it. `sent` when it's what the
// card's last message went with, counted in main as that message was built, at `at`. Otherwise it's what the card will
// read when it's sent, counted the same way from what would go now.
export interface CardKnows {
  sent: boolean;
  at: number;
  // Other cards whose words went: threads, tables, rows and notes.
  cards: number;
  // Pages and links. A page whose text didn't come, once sent, counts as cut short too.
  pages: number;
  // Files, the card's own and those its lines bring, and tables from a file.
  files: number;
  // The user's own notes on the card.
  notes: number;
  // Of what went, how much was cut to fit.
  cut: number;
  // Cards further up with no room left, and files the card had no room for.
  leftOutCards: number;
  leftOutFiles: number;
}

const counted = (value: number, one: string) => `${value.toLocaleString("en-US")} ${one}${value === 1 ? "" : "s"}`;

// "Knows: 3 cards, 2 files, 1 cut short", or on a card not sent yet, "Reads when sent: 3 cards". For-each cards say what
// their last run knew, or what each run reads, since each run has its own row.
export const knowsWords = (knows: CardKnows, forEach = false): string => {
  const parts = [
    knows.cards > 0 ? counted(knows.cards, "card") : "",
    knows.pages > 0 ? counted(knows.pages, "page") : "",
    knows.files > 0 ? counted(knows.files, "file") : "",
    knows.notes > 0 ? counted(knows.notes, "note") : "",
    knows.cut > 0 ? `${knows.cut.toLocaleString("en-US")} cut short` : "",
    knows.leftOutCards > 0 ? `${counted(knows.leftOutCards, "card")} left out` : "",
    knows.leftOutFiles > 0 ? `${counted(knows.leftOutFiles, "file")} left out` : "",
  ].filter(Boolean);
  const lead = knows.sent ? (forEach ? "Last run knew" : "Knows") : forEach ? "Each run reads when sent" : "Reads when sent";
  return `${lead}: ${parts.length > 0 ? parts.join(", ") : "nothing from other cards"}`;
};

// Whether any of what crosses a line is cut or left out to fit, the way its card sends: whole, or with For each row,
// one row each on the line that drives the runs and the rest shared by every run.
export const lineCut = (crossing: LineCrossing, forEach: boolean): boolean => {
  const { whole, each, files, shared } = crossing;
  const before = (part: { before?: { cut: boolean; leftOut: number } } | null | undefined) => !!part?.before && (part.before.cut || part.before.leftOut > 0);
  const own = (part: LineCrossing["whole"] | undefined) =>
    !!part &&
    (before(part) ||
      (part.kind === "thread" && (part.cut || part.earlier > 0)) ||
      (part.kind === "table" && part.leftOut > 0) ||
      (part.kind === "note" && part.cut));
  const filesLost = (files?.leftOut.length ?? 0) > 0;
  if (!forEach) return own(whole) || filesLost;
  return (each ? !!each.cut || before(each) : own(shared)) || filesLost;
};
