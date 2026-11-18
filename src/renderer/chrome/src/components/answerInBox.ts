import type { Attached } from "../useAttachments";

// While a question waits, what's sent from the prompt box is its answer, through `chat:decide` like a pressed one. An
// answer is words only, so with anything attached it isn't sent, and stays in the box.
export const answerInBox = (chatId: string, approvalId: string, words: string, attached: Attached): Promise<boolean> =>
  attached.files.length > 0 || attached.tabs.length > 0
    ? Promise.resolve(false)
    : window.chromeAPI.chat.decide(chatId, approvalId, true, words).catch(() => false);
