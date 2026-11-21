import { entriesOf, fieldsOf } from "../../shared/fields";

// What Telegram's Bot API answers, read field by field, so nothing it sends is taken for more than it checks out as.
// Who a message or a choice came from decides whether it counts as the user's, so those ids are always numbers here.

export interface Message {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
}

interface Choice {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

// An update is kept whatever else is wrong with it, so the poll still moves past it. What can't be read just isn't there.
export interface Update {
  update_id: number;
  message?: Message;
  callback_query?: Choice;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const messageOf = (value: unknown): Message | undefined => {
  const { message_id: messageId, chat, text, reply_to_message: replyTo } = fieldsOf(value);
  const { id: chatId, type } = fieldsOf(chat);
  if (!isNumber(messageId) || !isNumber(chatId) || typeof type !== "string") return undefined;
  const { message_id: repliedId } = fieldsOf(replyTo);
  return {
    message_id: messageId,
    chat: { id: chatId, type },
    ...(typeof text === "string" ? { text } : {}),
    ...(isNumber(repliedId) ? { reply_to_message: { message_id: repliedId } } : {}),
  };
};

const choiceOf = (value: unknown): Choice | undefined => {
  const { id, from, message, data } = fieldsOf(value);
  const { id: fromId } = fieldsOf(from);
  if (typeof id !== "string" || !isNumber(fromId)) return undefined;
  const { message_id: messageId, chat } = fieldsOf(message);
  const { id: chatId } = fieldsOf(chat);
  return {
    id,
    from: { id: fromId },
    ...(isNumber(messageId) && isNumber(chatId) ? { message: { message_id: messageId, chat: { id: chatId } } } : {}),
    ...(typeof data === "string" ? { data } : {}),
  };
};

const updateOf = (value: unknown): Update | null => {
  const { update_id: updateId, message, callback_query: choice } = fieldsOf(value);
  if (!isNumber(updateId)) return null;
  const read = { message: messageOf(message), callback_query: choiceOf(choice) };
  return {
    update_id: updateId,
    ...(read.message ? { message: read.message } : {}),
    ...(read.callback_query ? { callback_query: read.callback_query } : {}),
  };
};

// Null if it isn't a list, which getUpdates always answers with.
export const updatesOf = (result: unknown): Update[] | null => (Array.isArray(result) ? entriesOf(result, updateOf).entries : null);

// The id of a message just sent, or null if the answer doesn't say.
export const sentId = (result: unknown): string | null => {
  const { message_id: messageId } = fieldsOf(result);
  return isNumber(messageId) ? String(messageId) : null;
};

export const botUsername = (result: unknown): string | undefined => {
  const { username } = fieldsOf(result);
  return typeof username === "string" ? username : undefined;
};

// Telegram's envelope: whether it worked, what it gave, and how long to wait when it asks.
export const envelopeOf = (body: unknown): { ok: boolean; result: unknown; retryAfter: number | null } => {
  const { ok, result, parameters } = fieldsOf(body);
  const { retry_after: retryAfter } = fieldsOf(parameters);
  return { ok: ok === true, result, retryAfter: isNumber(retryAfter) ? retryAfter : null };
};
