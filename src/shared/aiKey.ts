// The user's own AI key (DESIGN.md section 10, First run). The key goes from the chrome's form to main once and never
// comes back: renderers only ever get which service it's for and its last four characters.

export const AI_SERVICES = ["openai", "anthropic"] as const;
export type AiService = (typeof AI_SERVICES)[number];

export const isAiService = (value: unknown): value is AiService => AI_SERVICES.includes(value as AiService);

export interface AiKeyState {
  service: AiService | null;
  last4: string | null;
}

// How trying a key went. Only "works" is saved. "refused" is the service saying no, and "unreachable" is not getting an
// answer from it at all.
export type AiKeyTried = "works" | "refused" | "unreachable" | "not-a-key" | "not-safe" | "not-saved";

// A key is one word of printable characters. The longest real ones are a little over 200.
export const AI_KEY_LENGTH = { min: 20, max: 400 };
export const looksLikeAiKey = (key: string): boolean =>
  key.length >= AI_KEY_LENGTH.min && key.length <= AI_KEY_LENGTH.max && /^[\x21-\x7e]+$/.test(key);

// How a key shows once it's out of the field: its service's prefix, dots and its last four characters.
const PREFIXES: Record<AiService, string> = { openai: "sk-", anthropic: "sk-ant-" };
export const maskedKey = (service: AiService, last4: string): string => `${PREFIXES[service]}${"•".repeat(16)}${last4}`;

export const NO_KEY = "Berry needs an AI key to answer.";
