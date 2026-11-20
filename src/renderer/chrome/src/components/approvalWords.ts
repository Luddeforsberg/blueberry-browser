import type { ChatApproval, HandoffNeed } from "@shared/library";
import { whyWords } from "../askingWords";
import { asContinuation, withSiteNames } from "../siteNames";

export const HANDOFF_TITLE: Record<HandoffNeed, string> = {
  "sign-in": "Sign in on",
  code: "Enter the code on",
  captcha: "Solve the captcha on",
};

// What an approval card says: the sentence, which names the sites, and the exact words under it in full, because
// that's what's being allowed. With no address to shorten and nothing marked, the sentence is them. Why it asks comes
// from the reason's code alone.
export const approvalWords = (approval: ChatApproval, name: string, showBerry: boolean) => {
  const mark = approval.why?.mark;
  return {
    question: `${showBerry ? "I’d like to " : `${name} wants to `}${withSiteNames(asContinuation(approval.text))}`,
    exactly: withSiteNames(approval.text) === approval.text && !mark ? undefined : approval.text,
    mark,
    why: approval.why ? whyWords(approval.why) : null,
  };
};
