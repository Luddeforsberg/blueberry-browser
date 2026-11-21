// What the cloud's model checker does in a run: seeded steps, each picked by weight. The driver is cloudCheckTesting.ts.

const LENGTH = 40;

// Each step the checker can take, and how often.
const WEIGHTS = [
  ["answer", 40],
  ["startJob", 6],
  ["endJob", 5],
  ["check", 6],
  ["closeTab", 6],
  ["userTab", 3],
  ["takeOver", 3],
  ["watch", 4],
  ["end", 4],
  ["forget", 3],
  ["saveKey", 3],
  ["revokeKey", 1],
  ["windowClose", 3],
  ["windowOpen", 4],
  ["time", 4],
  ["revokeLogin", 3],
  ["bringLogin", 3],
  ["confirm", 4],
  ["drop", 1],
  ["diskFails", 2],
  ["hour", 1],
  ["runnerTakes", 2],
  ["runnerFinishes", 2],
  ["runnerStops", 1],
  ["runnerStarts", 2],
  ["crash", 1],
  ["quit", 1],
] as const;

export type Op = (typeof WEIGHTS)[number][0];

export interface Action {
  op: Op;
  a: number;
  b: number;
}

// What only the window can start.
export const NEEDS_WINDOW: Op[] = ["startJob", "check", "userTab", "end", "forget", "saveKey", "revokeLogin", "bringLogin", "windowClose"];

const mulberry32 = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const actionsFor = (seed: number): Action[] => {
  const random = mulberry32(seed);
  const total = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const pick = (): Op => {
    let left = random() * total;
    for (const [op, weight] of WEIGHTS) if ((left -= weight) < 0) return op;
    return "answer";
  };
  return Array.from({ length: LENGTH }, () => ({ op: pick(), a: Math.floor(random() * 1_000), b: Math.floor(random() * 1_000) }));
};

// Every promise settles before the next step, since nothing here waits on a real timer or the network.
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
};

export const nth = <T>(items: Iterable<T>, index: number): T | undefined => {
  const all = [...items];
  return all[index % Math.max(all.length, 1)];
};

export const quietly = (work: Promise<unknown>) => void work.catch(() => {});
