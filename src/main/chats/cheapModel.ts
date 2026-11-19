import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ChatThreadMessage } from "../../shared/library";
import { createModel } from "./modelConfig";

// The cheap model from the chat's own provider, for what's too small to need the main one, such as a chat's title.

const TITLE_PROMPT =
  "You name chats for a sidebar. Reply with a title of 2 to 5 words, in the language of the conversation, " +
  "saying what it is about. Use no quotes and no ending punctuation. " +
  "If it has no topic yet, such as only a greeting or small talk, reply with exactly NONE.";

const MAX_TITLE_LENGTH = 60;
const MAX_TITLE_MESSAGES = 10;
const MAX_TITLE_MESSAGE_LENGTH = 1000;

// One call to the cheap model, for what's too small to need the main one.
export const writeWithCheapModel = async (system: string, data: string, model?: BaseChatModel): Promise<string> => {
  const cheapModel = model ?? (await createModel("titleModel"));
  const reply = await cheapModel.invoke([
    ["system", system],
    ["human", data],
  ]);
  return reply.text;
};

// Null until the conversation has a topic worth naming.
export const generateTitle = async (messages: ChatThreadMessage[], model?: BaseChatModel): Promise<string | null> => {
  const transcript = messages
    .slice(0, MAX_TITLE_MESSAGES)
    .map(({ role, content }) => `${role}: ${content.slice(0, MAX_TITLE_MESSAGE_LENGTH)}`)
    .join("\n\n");
  const titleModel = model ?? (await createModel("titleModel"));
  const reply = await titleModel.invoke([
    ["system", TITLE_PROMPT],
    ["human", transcript],
  ]);
  const title = reply.text
    .trim()
    .replace(/^["'“”]+|["'“”.!?]+$/g, "")
    .trim();
  if (!title || title.toUpperCase() === "NONE") return null;
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
};
