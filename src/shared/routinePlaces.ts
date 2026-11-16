// Where the Routines page is (DESIGN.md section 10, Routines). As on Settings and Your mascots, the place lives in the
// tab's param, so main's Back can step out of a page, and a restored session or another page lands in the same place.

// The parts of a routine that are changed one at a time, each from its own row, in the order the steps ask them.
export const ROUTINE_PARTS = ["does", "when", "who", "where", "name"] as const;
export type RoutinePart = (typeof ROUTINE_PARTS)[number];

export type RoutinePlace =
  | { page: "list" }
  // Making one, in four steps.
  | { page: "new" }
  | { page: "routine"; id: string }
  | { page: "part"; id: string; part: RoutinePart };

const isPart = (value: string): value is RoutinePart => (ROUTINE_PARTS as readonly string[]).includes(value);

// A routine's id never has a slash, and is never one of the words the list and the steps use.
export const routinesParam = (place: RoutinePlace): string => {
  switch (place.page) {
    case "list":
    case "new":
      return place.page;
    case "routine":
      return place.id;
    case "part":
      return `${place.id}/${place.part}`;
  }
};

// Where a param lands. None, or one nobody knows, is the list, and an unknown part is the routine's page.
export const routinesPlace = (param: string | null): RoutinePlace => {
  if (!param || param === "list") return { page: "list" };
  if (param === "new") return { page: "new" };
  const [id, sub, ...rest] = param.split("/");
  if (!id || rest.length > 0) return { page: "list" };
  if (sub !== undefined && isPart(sub)) return { page: "part", id, part: sub };
  return { page: "routine", id };
};

// One step back: from a part to its routine, and from a routine or the steps to the list, which has nowhere to go.
export const routinesBack = (param: string | null): string | null => {
  const place = routinesPlace(param);
  if (place.page === "list") return null;
  if (place.page === "part") return routinesParam({ page: "routine", id: place.id });
  return routinesParam({ page: "list" });
};
