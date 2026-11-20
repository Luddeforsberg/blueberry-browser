// Reading a value from outside the code: a file on disk, a server, a renderer or another app. Nothing here casts, so
// every field comes out `unknown` and has to be checked before it's used.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Its fields to destructure. Anything that isn't an object has none, so each field reads as undefined.
export const fieldsOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

// Each entry of a list through `parse`, which gives null for one it can't use. The rest are kept, and `dropped` counts
// what went, so the caller can say so. Anything that isn't a list has no entries.
export const entriesOf = <T>(value: unknown, parse: (entry: unknown) => T | null): { entries: T[]; dropped: number } => {
  if (!Array.isArray(value)) return { entries: [], dropped: 0 };
  const entries: T[] = [];
  value.forEach((entry: unknown) => {
    const parsed = parse(entry);
    if (parsed !== null) entries.push(parsed);
  });
  return { entries, dropped: value.length - entries.length };
};
