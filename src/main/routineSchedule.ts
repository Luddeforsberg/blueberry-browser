import type { RoutineDraft, RoutineSchedule } from "../shared/library";
import { normaliseSite } from "../shared/mascots";

const MAX_NAME_LENGTH = 100;
const MAX_INSTRUCTIONS_LENGTH = 5000;
const MAX_SITES = 20;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const clock = (time: string): [hour: number, minute: number] => {
  const [hour, minute] = time.split(":").map(Number);
  return [hour, minute];
};

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

const onDay = (date: Date, offset: number, time: string): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, ...clock(time));

// The first time after `after`, in local time so 07:30 stays 07:30 across a clock change. A time the clocks skip
// runs just after the gap, and a time they repeat runs the first time only. Null if there won't be another.
export const nextRun = (schedule: RoutineSchedule, after: number): number | null => {
  if (schedule.kind === "manual") return null;
  const from = new Date(after);
  if (schedule.kind === "once") return schedule.at > after ? schedule.at : null;
  if (schedule.kind === "monthly") {
    const [hour, minute] = clock(schedule.time);
    for (let offset = 0; ; offset++) {
      const start = new Date(from.getFullYear(), from.getMonth() + offset, 1);
      const day = Math.min(schedule.day, daysInMonth(start.getFullYear(), start.getMonth()));
      const at = new Date(start.getFullYear(), start.getMonth(), day, hour, minute).getTime();
      if (at > after) return at;
    }
  }
  for (let offset = 0; ; offset++) {
    const at = onDay(from, offset, schedule.time);
    const scheduled = schedule.kind === "daily" || schedule.days.includes(at.getDay());
    if (scheduled && at.getTime() > after) return at.getTime();
  }
};

const ordinal = (day: number): string => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
};

export const scheduleLabel = (schedule: RoutineSchedule): string => {
  switch (schedule.kind) {
    case "once": {
      const at = new Date(schedule.at);
      const date = at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      return `Once on ${date} at ${time}`;
    }
    case "manual":
      return "When you ask";
    case "daily":
      return `Daily at ${schedule.time}`;
    case "weekly": {
      const days = [...schedule.days].sort((a, b) => a - b);
      if (days.length === WEEKDAYS.length) return `Daily at ${schedule.time}`;
      if (days.length === 1) return `${WEEKDAYS[days[0]]}s at ${schedule.time}`;
      return `${days.map((day) => WEEKDAYS[day].slice(0, 3)).join(", ")} at ${schedule.time}`;
    }
    case "monthly":
      return `${ordinal(schedule.day)} of each month at ${schedule.time}`;
  }
};

const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const isWhole = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export const parseSchedule = (input: unknown): RoutineSchedule | null => {
  const value = (input ?? {}) as Record<string, unknown>;
  if (value.kind === "once") {
    return Number.isFinite(value.at) && (value.at as number) > 0 ? { kind: "once", at: value.at as number } : null;
  }
  if (value.kind === "manual") return { kind: "manual" };
  if (!isTime(value.time)) return null;
  if (value.kind === "daily") return { kind: "daily", time: value.time };
  if (value.kind === "weekly") {
    if (!Array.isArray(value.days) || value.days.length === 0) return null;
    if (!value.days.every((day) => isWhole(day, 0, 6))) return null;
    return { kind: "weekly", days: [...new Set<number>(value.days)], time: value.time };
  }
  if (value.kind === "monthly" && isWhole(value.day, 1, 31)) {
    return { kind: "monthly", day: value.day, time: value.time };
  }
  return null;
};

// What comes from the renderer is checked here, and its errors are worded for the form.
export const parseDraft = (input: unknown): { draft: RoutineDraft } | { error: string } => {
  const { name, instructions, schedule: rawSchedule, mascotId, sites } = (input ?? {}) as Record<string, unknown>;
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanInstructions = typeof instructions === "string" ? instructions.trim() : "";
  if (!cleanName) return { error: "Give the routine a name." };
  if (cleanName.length > MAX_NAME_LENGTH) return { error: `Keep the name under ${MAX_NAME_LENGTH} characters.` };
  if (!cleanInstructions) return { error: "Say what the routine should do." };
  if (cleanInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return { error: `Keep the instructions under ${MAX_INSTRUCTIONS_LENGTH} characters.` };
  }
  const schedule = parseSchedule(rawSchedule);
  if (!schedule) return { error: "Choose when the routine should run." };
  const cleanSites: string[] = [];
  for (const site of Array.isArray(sites) ? sites : []) {
    const clean = typeof site === "string" ? normaliseSite(site) : null;
    if (!clean) return { error: `“${String(site)}” doesn’t look like a site. Try something like example.com.` };
    if (!cleanSites.includes(clean)) cleanSites.push(clean);
  }
  if (cleanSites.length > MAX_SITES) return { error: `Keep it to ${MAX_SITES} sites.` };
  // Only a scheduled routine has anything for the cloud to run.
  const inCloud = (input as { inCloud?: unknown } | null)?.inCloud === true && schedule.kind !== "manual";
  return { draft: { name: cleanName, instructions: cleanInstructions, schedule, sites: cleanSites, ...(typeof mascotId === "string" ? { mascotId } : {}), ...(inCloud ? { inCloud } : {}) } };
};
