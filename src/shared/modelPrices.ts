// What a model's tokens cost, so a card can say what its chats cost and what For each row will cost before it sends.
// The evals price their runs from the same table.

export interface TokenUsage {
  input: number;
  // Of `input`, the part read from the provider's cache, which costs less.
  cached: number;
  output: number;
}

// US$ per million tokens: [input, cached input, output]. OpenAI's from developers.openai.com/api/docs/pricing on
// 2026-10-31, Anthropic's from its model table on 2026-10-06. Haiku 5.5's cache price isn't listed there, so it's taken
// as a tenth of its input, as the others are. A model that starts with a listed name is priced as that one.
export const PRICES: Record<string, readonly [number, number, number]> = {
  "gpt-6.1-sol": [2, 0.1, 10],
  "gpt-6.1-terra": [1, 0.05, 5],
  "gpt-6-luna": [0.1, 0.01, 0.5],
  "claude-opus-5-5": [4, 0.2, 20],
  "claude-sonnet-5-5": [2, 0.2, 10],
  "claude-haiku-5-5": [0.1, 0.01, 0.5],
};

export const priceOf = (model: string): readonly [number, number, number] | null => {
  const match = Object.keys(PRICES).find((name) => model.startsWith(name));
  return match ? PRICES[match] : null;
};

// Null for a model the table doesn't know, so nothing made up is shown.
export const costOf = (model: string, { input, cached, output }: TokenUsage): number | null => {
  const price = priceOf(model);
  if (!price) return null;
  const fresh = Math.max(0, input - cached);
  return (fresh * price[0] + Math.min(cached, input) * price[1] + output * price[2]) / 1_000_000;
};

// What one run of For each row takes when there's nothing to go on yet: a few pages read and a short answer, about ten
// model calls. Only ever shown as a rough guess.
export const ROUGH_RUN: TokenUsage = { input: 80_000, cached: 30_000, output: 3_000 };

export const roughRunCost = (model: string): number | null => costOf(model, ROUGH_RUN);

// "$0.04", "under $0.01", or whole dollars from $100.
export const costWords = (usd: number): string => {
  if (usd < 0.005) return "under $0.01";
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
};

// What one run of For each row will likely cost: what this card's own runs cost on average, or else what the card its
// rows come from cost per run, or per job for a card with one chat, or else a rough guess for the model. Null with
// nothing to go on and no price for the model.
export const perRunEstimate = ({ own, source, rough }: { own: readonly number[]; source: readonly number[]; rough: number | null }): { cost: number; rough: boolean } | null => {
  const average = (costs: readonly number[]) => costs.reduce((total, cost) => total + cost, 0) / costs.length;
  if (own.length > 0) return { cost: average(own), rough: false };
  if (source.length > 0) return { cost: average(source), rough: false };
  return rough === null ? null : { cost: rough, rough: true };
};
