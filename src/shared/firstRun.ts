// DESIGN.md section 10, First run: its steps, where it starts again after leaving part way, and First jobs on the new tab
// afterwards. Pure, so main's settings and the chrome agree.

export const FIRST_RUN_STEPS = ["meet", "account", "yours", "brain", "history", "see"] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

// The account step only with a server to make one on, and history only with a browser to bring it from.
export const firstRunSteps = ({ accounts, browsers }: { accounts: boolean; browsers: boolean }): FirstRunStep[] =>
  FIRST_RUN_STEPS.filter((step) => (step !== "account" || accounts) && (step !== "history" || browsers));

// The first step that isn't done. The account is done by being signed in and the brain by a saved key or putting it off;
// the rest by having been passed, which Settings keeps.
export const firstRunStart = (
  steps: FirstRunStep[],
  { passed, signedIn, hasKey }: { passed: FirstRunStep[]; signedIn: boolean; hasKey: boolean },
): number => {
  const done = (step: FirstRunStep) => (step === "account" ? signedIn : (step === "brain" && hasKey) || passed.includes(step));
  const at = steps.findIndex((step) => !done(step));
  return at === -1 ? steps.length - 1 : at;
};

export const FIRST_JOBS = ["key", "history", "try", "meet"] as const;
// The mascot that only reads, which the last row meets: the starter's id in the Gallery.
export const PLAIN_WORDS = "plain-words";
export type FirstJob = (typeof FIRST_JOBS)[number];

// The rows First jobs starts with when the first run ends: a key first if it was put off, history only with a browser to
// bring it from, then a first job and a mascot that only reads.
export const firstJobsFor = ({ hasKey, browsers }: { hasKey: boolean; browsers: boolean }): FirstJob[] =>
  FIRST_JOBS.filter((job) => (job !== "key" || !hasKey) && (job !== "history" || browsers));

// What the new tab shows: each row and whether it's done, or nothing once every row is.
export const firstJobRows = (jobs: FirstJob[], done: FirstJob[]): { job: FirstJob; done: boolean }[] => {
  const rows = jobs.map((job) => ({ job, done: done.includes(job) }));
  return rows.every((row) => row.done) ? [] : rows;
};

// Only known values, once each, in their own order. For Settings, from disk or a renderer.
export const knownOnly = <T extends string>(value: unknown, known: readonly T[], fallback: T[]): T[] =>
  Array.isArray(value) ? known.filter((item) => value.includes(item)) : fallback;
