// What the user calls themselves on the account, kept in Settings on this computer only. Counted in characters as drawn,
// so a name in another script isn't cut short.
export const ACCOUNT_NAME_MAX = 60;

// Trimmed. Empty clears it, and anything too long or with a control character or line break in it keeps what was there.
export const cleanAccountName = (value: unknown, fallback: string | null): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const name = value.trim();
  if (name === "") return null;
  return [...name].length <= ACCOUNT_NAME_MAX && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name) ? name : fallback;
};

// The name the new tab greets with, the one place it's said: "Where to, Sam?", or "Where to?" with no name.
export const greetingName = (name: string | null): string | null => name?.trim() || null;
