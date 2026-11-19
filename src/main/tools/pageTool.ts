import { z } from "zod";
import type { StepKind } from "../../shared/library";
import type { AskWhy } from "../../shared/asking";

// Plain data, so this file doesn't load LangChain at startup. `agent.ts` turns these into its tools.
export interface PageTool {
  name: string;
  description: string;
  schema: z.ZodObject;
  // What the chat shows for this call. It goes back to the model in later messages as Berry's own words,
  // so nothing a page could have written goes in it: no titles, and no search text.
  label: (args: unknown) => string;
  run: (args: unknown) => Promise<string>;
  // Set on anything that changes something. Says exactly what will happen, for the user to allow. It's worked
  // out again just before the tool runs, and a different answer means nothing happens.
  describe?: (args: unknown) => Promise<string>;
  // Called once as a card about this call is put to the user, not when `describe` is checked again.
  whileAsking?: (args: unknown) => void;
  // Whether to ask in the default mode, and why: anything that could delete, send, buy or change text. Null when it needn't.
  whyRisky?: (args: unknown) => Promise<AskWhy | null>;
  // `run` answers with an image's data address when it worked, which the model gets as a picture.
  returnsImage?: boolean;
  // Says why this call can't happen at all, before anything asks or runs: a mascot's limits, or a tab the user took over.
  refuses?: (args: unknown) => Promise<{ label: string; message: string } | null>;
  // What the chat shows instead of `label` once the user allowed this call, naming what the card named. It has page text
  // in it, so it never goes back to the model: only `label` does.
  allowedLabel?: (args: unknown) => string | null;
  // What the chat always shows instead of `label`, when that's text the model wrote that the user should see, such as
  // what went out in a search. Like `allowedLabel`, it never goes back to the model.
  shownLabel?: (args: unknown) => string;
  // What kind of step it makes in the chat, for its pips. Only for the screen.
  kind?: StepKind;
}

export const pageTool = <S extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: S;
  label: (args: z.infer<S>) => string;
  run: (args: z.infer<S>) => Promise<string>;
  describe?: (args: z.infer<S>) => Promise<string>;
  whileAsking?: (args: z.infer<S>) => void;
  whyRisky?: (args: z.infer<S>) => Promise<AskWhy | null>;
  returnsImage?: boolean;
  allowedLabel?: (args: z.infer<S>) => string | null;
  shownLabel?: (args: z.infer<S>) => string;
  kind: StepKind;
}): PageTool => {
  const { describe, whileAsking, whyRisky, allowedLabel, shownLabel } = tool;
  return {
    ...tool,
    label: (args) => tool.label(tool.schema.parse(args)),
    run: (args) => tool.run(tool.schema.parse(args)),
    describe: describe && ((args) => describe(tool.schema.parse(args))),
    whileAsking: whileAsking && ((args) => whileAsking(tool.schema.parse(args))),
    whyRisky: whyRisky && ((args) => whyRisky(tool.schema.parse(args))),
    allowedLabel: allowedLabel && ((args) => allowedLabel(tool.schema.parse(args))),
    shownLabel: shownLabel && ((args) => shownLabel(tool.schema.parse(args))),
  };
};

export const tabId = z
  .string()
  .optional()
  .describe(
    "The tab, from list_tabs. Leave out for the one this job is working in: the last you opened, or else the page that came with the message. It never follows the user to another tab.",
  );
