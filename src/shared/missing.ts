// For a value the code has already made sure of, so it can't be missing. If it ever is, this says which one.
export const missing = (what: string): never => {
  throw new Error(`Missing ${what}`);
};
