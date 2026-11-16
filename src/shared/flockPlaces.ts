// Where the mascots' page is (DESIGN.md section 10, Your mascots). Like Settings, the place lives in the tab's param, so
// main's Back can step out of a page, and a restored session or another page lands in the same place.

import { BERRY_ID } from "./mascots";

// The parts of a mascot that are changed one at a time, each from its own row.
export const MASCOT_PARTS = ["look", "name", "purpose", "limits"] as const;
export type MascotPart = (typeof MASCOT_PARTS)[number];

export type FlockPlace =
  | { page: "list" }
  // Making one, in four steps.
  | { page: "new" }
  | { page: "mascot"; id: string }
  | { page: "part"; id: string; part: MascotPart }
  | { page: "memory"; id: string }
  | { page: "publish"; id: string };

const isPart = (value: string): value is MascotPart => (MASCOT_PARTS as readonly string[]).includes(value);

// A mascot's id never has a slash, and is never one of the words the list and the steps use.
export const flockParam = (place: FlockPlace): string => {
  switch (place.page) {
    case "list":
    case "new":
      return place.page;
    case "mascot":
      return place.id;
    case "part":
      return `${place.id}/${place.part}`;
    default:
      return `${place.id}/${place.page}`;
  }
};

// Where a param lands. None, or one nobody knows, is the list. Berry can't be changed or published, so those land on
// its page instead.
export const flockPlace = (param: string | null): FlockPlace => {
  if (!param || param === "list") return { page: "list" };
  if (param === "new") return { page: "new" };
  const [id, sub, ...rest] = param.split("/");
  if (!id || rest.length > 0) return { page: "list" };
  if (sub === undefined) return { page: "mascot", id };
  if (sub === "memory") return { page: "memory", id };
  if (id === BERRY_ID) return { page: "mascot", id };
  if (sub === "publish") return { page: "publish", id };
  if (isPart(sub)) return { page: "part", id, part: sub };
  return { page: "mascot", id };
};

// One step back: from a mascot's part, memory or publishing to its page, and from its page or the steps to the list.
// The list has nowhere to go back to.
export const flockBack = (param: string | null): string | null => {
  const place = flockPlace(param);
  if (place.page === "list") return null;
  if (place.page === "new" || place.page === "mascot") return flockParam({ page: "list" });
  return flockParam({ page: "mascot", id: place.id });
};
