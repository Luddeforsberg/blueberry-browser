import { z } from "zod";
import type { PageTarget } from "./pageTarget";
import { pageTool, tabId } from "./pageTool";
import type { ToolContext } from "./toolContext";
import { HANDOFF_WORDS } from "./handoffWords";
import { NO_ACCESS } from "./toolMessages";
import { plausibleCode } from "../phone/phoneReplies";

// The tools that wait: for a moment, for the user's answer, or for the user to do something in a tab themselves.

const MAX_WAIT_SECONDS = 10;

// Ones the model might reach for when a page asks. These go in the page, typed by the user, and never through a model.
const SECRET_REQUEST =
  /pass ?(word|code|phrase)|lösenord|\b2fa\b|two.factor|one.time|\botp\b|(?<!(postal|zip|post|promo|discount|coupon|area|country|source) )\bcode\b|\bkod(en)?\b|engångskod|verifieringskod|\bcvc\b|\bcvv\b|card (number|details)|kortnummer|personnummer|\bpin\b/i;

// Answers ask_user offers to press, so a choice is one press.
const MAX_ANSWERS = 3;
const MAX_ANSWER_LENGTH = 60;

export const askingTools = <T extends PageTarget>(context: ToolContext<T>) => {
  const { handOver, ask, canSee, allowed, offLimits, find, noTab, usedTab, site, whereNow } = context;
  let lastQuestion: Promise<void> = Promise.resolve();
  // Tools can run at the same time, and the chat shows one request at a time.
  const oneAtATime = <T>(ask: () => Promise<T>): Promise<T> => {
    const turn = lastQuestion.then(ask);
    lastQuestion = turn.then(
      () => {},
      () => {},
    );
    return turn;
  };

  return {
    wait: pageTool({
      name: "wait",
      kind: "wait",
      description: `Wait up to ${MAX_WAIT_SECONDS} seconds for a page to catch up, such as after an action that takes a moment to show.`,
      schema: z.object({ seconds: z.number().min(0).max(MAX_WAIT_SECONDS) }),
      label: () => "Waited a moment",
      run: async ({ seconds }) => {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return `Waited ${seconds} seconds.`;
      },
    }),
    ask_user: pageTool({
      name: "ask_user",
      kind: "ask",
      description:
        "Ask the user a question and carry on with their answer, only for something the job can't go on without and that you can't find out yourself, such as which of two options they meant. Whenever the choices are few and known, such as two flights or three dates you found, always list them in answers, so the user can answer with one press. Leave answers out only when you can't know the choices, such as a name or a budget. They can always type their own. Never ask for a password, a code or card details: use hand_to_user, so they type those in the page themselves. Don't use this for permission to act, because the browser asks that by itself.",
      schema: z.object({
        question: z.string().min(1).max(500),
        answers: z
          .array(z.string().min(1).max(MAX_ANSWER_LENGTH))
          .max(MAX_ANSWERS)
          .optional()
          .describe(
            `The choices, when they're few and known: up to ${MAX_ANSWERS} answers the user can press, each a few plain words, such as “Friday evening”.`,
          ),
      }),
      label: () => "Asked you something",
      run: async ({ question, answers = [] }) => {
        if ([question, ...answers].some((words) => SECRET_REQUEST.test(words))) {
          return "That wasn't asked, because passwords, codes and card details never go through this chat. If a page needs one, use hand_to_user so the user types it in the page themselves.";
        }
        // A code only ever goes into the page, so nothing shaped like one is offered to press.
        const offered = answers.map((words) => words.trim()).filter((words) => words !== "" && plausibleCode(words) === null);
        const answer = await oneAtATime(() => ask(question, offered));
        return answer === null
          ? "The user chose not to answer. Carry on without it if you can, or say what you couldn't do."
          : `The user answered: ${answer}`;
      },
    }),
    hand_to_user: pageTool({
      name: "hand_to_user",
      kind: "ask",
      description:
        "Hand a tab to the user when a page needs a sign-in, a one-time or two-factor code, or a captcha. They do it themselves in the page. You can't see or use the tab meanwhile, and this call ends when they say they're done. Then look at the page again and carry on with the job. Never try to get past these yourself.",
      schema: z.object({ need: z.enum(["sign-in", "code", "captcha"]), tabId }),
      label: ({ need, tabId: id }) => `Asked you to ${HANDOFF_WORDS[need]} on ${site(id)}`,
      run: async ({ need, tabId: id }) => {
        if (!canSee()) return NO_ACCESS;
        const tab = find(id);
        if (!tab) return noTab(id);
        if (!allowed(tab.url)) return offLimits(tab.url).message;
        const done = await oneAtATime(() => handOver(tab, need));
        if (!done)
          return "The user didn't do that, so the page is as it was or the tab is gone. Carry on without it if you can, and say what you couldn't do. Don't hand it to them again unless they ask.";
        // They may have ended up anywhere, and a limited mascot still doesn't get to read it.
        if (!allowed(tab.url)) return offLimits(tab.url).message;
        usedTab(tab);
        const back =
          done === "code"
            ? `A code was entered in tab ${tab.id} from the user's phone, and the tab is yours again.`
            : `The user says they're done, and tab ${tab.id} is yours again.`;
        return `${back} ${await whereNow(tab)} You couldn't see it meanwhile, so look at the page again to see whether it worked, then carry on with the job.`;
      },
    }),
  };
};
