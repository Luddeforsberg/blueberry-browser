import type { ReplyPart } from "./agent";

// What the tests of `streamReply` share: options with no tools that never allow anything, and the answer a reply ends with.

export const NO_TOOLS = {
  tools: [],
  actionApproval: () => "always" as const,
  approve: async () => false,
  onStep: () => () => {},
};

// The answer as it ends up: a status line takes back what came before it.
export const collect = async (stream: AsyncIterable<ReplyPart>) => {
  let text = "";
  for await (const part of stream) text = typeof part === "string" ? text + part : "";
  return text;
};
