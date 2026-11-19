import type { HandoffNeed } from "../../shared/library";

// What the user is handed a tab to do, after "needs you to" and "Asked you to".
export const HANDOFF_WORDS: Record<HandoffNeed, string> = {
  "sign-in": "sign in",
  code: "enter a code",
  captcha: "solve a captcha",
};
