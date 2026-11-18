import type { ChatStep } from "@shared/library";

// Whether a mascot has done something in this chat, so it has something to repeat.
export const didWork = (messages: Array<{ role: string; steps?: ChatStep[] }>) =>
  messages.some((message) => message.role === "assistant" && (message.steps?.length ?? 0) > 0);
