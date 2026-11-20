// For tests: what a test expects to be there, such as a list's item or a map's entry, or a failure saying it wasn't.
export const defined = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Expected a value, but it was undefined");
  return value;
};
