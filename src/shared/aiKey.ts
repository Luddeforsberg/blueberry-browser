// The user's own AI key (DESIGN.md section 10, First run). The key goes from the chrome's form to main once and never
// comes back: renderers only ever get which service it's for and its last four characters.

export const AI_SERVICES = ["openai", "anthropic"] as const;
export type AiService = (typeof AI_SERVICES)[number];

export const isAiService = (value: unknown): value is AiService => AI_SERVICES.includes(value as AiService);

export interface AiKeyState {
  service: AiService | null;
  last4: string | null;
}

// How trying a key went. Only "works" is saved. "refused" is the service saying no, "unreachable" is not getting an
// answer from it at all, and "overtaken" is another try or a removal starting before the answer came, so it says nothing
// about the key and nothing was kept.
export type AiKeyTried = "works" | "refused" | "unreachable" | "not-a-key" | "not-safe" | "not-saved" | "overtaken";

// A key is its service's prefix, then letters, digits, dashes and underscores. The longest real ones are a little over
// 200. Anthropic's start with OpenAI's prefix too, so OpenAI's shape leaves those out. Being this strict is what keeps a
// password on the clipboard from coming back through Paste, and one service's key from being sent to the other.
const AI_KEY_LENGTH = { min: 20, max: 400 };
const PREFIXES: Record<AiService, string> = { openai: "sk-", anthropic: "sk-ant-" };
const KEY_SHAPE: Record<AiService, RegExp> = { openai: /^sk-(?!ant-)[A-Za-z0-9_-]+$/, anthropic: /^sk-ant-[A-Za-z0-9_-]+$/ };
export const looksLikeAiKey = (service: AiService, key: string): boolean =>
  key.length >= AI_KEY_LENGTH.min && key.length <= AI_KEY_LENGTH.max && KEY_SHAPE[service].test(key);

// How a key shows once it's out of the field: its service's prefix, dots and its last four characters.
export const maskedKey = (service: AiService, last4: string): string => `${PREFIXES[service]}${"•".repeat(16)}${last4}`;

export const NO_KEY = "Berry needs an AI key to answer.";
export const KEY_REFUSED = "The AI service turned down the key. Check it in Settings, under Connections.";
// What only a key can fix, so a reply that went wrong this way offers Add a key, never Try again, which can't help.
export const NEEDS_A_KEY: readonly string[] = [NO_KEY, KEY_REFUSED];
