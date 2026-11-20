import type { NeedsYouItem } from "@shared/library";

// DESIGN.md section 10, Needs you: the words the page says about what's waiting, worked out from the list alone.

const MINUTE = 60_000;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// How long one has waited, in mono beside it: "just now", "4 min", "2 h".
export const waitedFor = (askedAt: number, now: number): string => {
  const minutes = Math.floor((now - askedAt) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
};

const longWait = (askedAt: number, now: number): string => {
  const minutes = Math.floor((now - askedAt) / MINUTE);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return count(minutes, "minute", "minutes");
  return count(Math.floor(minutes / 60), "hour", "hours");
};

// "3 things are waiting, from 3 chats. The oldest has waited 4 minutes."
export const waitingLine = (items: readonly Pick<NeedsYouItem, "id" | "routineId" | "askedAt">[], now: number): string | null => {
  if (items.length === 0) return null;
  const jobs = new Map(items.map((item) => [item.id, item.routineId !== null]));
  const routines = [...jobs.values()].filter(Boolean).length;
  const chats = jobs.size - routines;
  const from = [chats > 0 && count(chats, "chat", "chats"), routines > 0 && count(routines, "routine", "routines")]
    .filter(Boolean)
    .join(" and ");
  const oldest = Math.min(...items.map((item) => item.askedAt));
  const waiting = items.length === 1 ? "1 thing is waiting" : `${items.length} things are waiting`;
  return `${waiting}, from ${from}. ${items.length === 1 ? "It has" : "The oldest has"} waited ${longWait(oldest, now)}.`;
};

// Under the list: how many have been answered on this visit, of all there were.
export const tallyWords = (answered: number, waiting: number): string => `${answered} of ${answered + waiting} answered`;
