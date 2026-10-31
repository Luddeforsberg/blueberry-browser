import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_BOT_TOKEN = "123456:fake-token-for-tests-only-abcdef";

interface Sent {
  message_id: number;
  text: string;
  buttons: Array<{ text: string; callback_data: string }>;
}

// A local stand-in for the Bot API, the parts we use, with a person at the other end. Long polling is real here too.
export const startFakeTelegram = async () => {
  const USER_CHAT = 555;
  let nextUpdate = 1;
  let nextMessage = 100;
  let updates: object[] = [];
  let wake: (() => void) | null = null;
  const sent: Sent[] = [];
  const deleted: number[] = [];
  const answeredCallbacks: string[] = [];
  const editsOf = new Map<number, string>();
  let polls = 0;

  const push = (update: object) => {
    updates.push({ update_id: nextUpdate++, ...update });
    wake?.();
  };
  const message = (text: string, chatId: number, replyTo?: number) => {
    const message_id = nextMessage++;
    push({
      message: {
        message_id,
        chat: { id: chatId, type: "private" },
        from: { id: chatId },
        text,
        ...(replyTo === undefined ? {} : { reply_to_message: { message_id: replyTo } }),
      },
    });
    return message_id;
  };

  const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const params = body ? JSON.parse(body) : {};
    const [, token, method] = /^\/bot([^/]+)\/(\w+)$/.exec(request.url ?? "") ?? [];
    const answer = (result: unknown) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, result }));
    };
    if (token !== FAKE_BOT_TOKEN) {
      response.statusCode = 401;
      response.end(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }));
      return;
    }
    if (method === "getMe") return answer({ id: 1, is_bot: true, username: "test_blueberry_bot" });
    if (method === "getUpdates") {
      polls++;
      if (params.offset !== undefined) updates = updates.filter((update) => (update as { update_id: number }).update_id >= params.offset);
      if (params.offset === -1) return answer([]);
      if (updates.length === 0 && params.timeout) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 500);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake = null;
      }
      return answer(updates);
    }
    if (method === "sendMessage") {
      const message_id = nextMessage++;
      sent.push({ message_id, text: params.text, buttons: params.reply_markup?.inline_keyboard?.flat() ?? [] });
      return answer({ message_id, chat: { id: params.chat_id, type: "private" }, text: params.text });
    }
    if (method === "editMessageText") {
      editsOf.set(params.message_id, params.text);
      return answer({ message_id: params.message_id });
    }
    if (method === "answerCallbackQuery") {
      answeredCallbacks.push(params.callback_query_id);
      return answer(true);
    }
    if (method === "deleteMessage") {
      deleted.push(params.message_id);
      return answer(true);
    }
    response.statusCode = 400;
    response.end(JSON.stringify({ ok: false, error_code: 400, description: "Unknown method" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    env: { BLUEBERRY_TELEGRAM_API: `http://127.0.0.1:${(server.address() as AddressInfo).port}` },
    sent,
    deleted,
    answeredCallbacks,
    editsOf,
    get polls() {
      return polls;
    },
    // What the person does.
    userSends: (text: string, replyTo?: number) => message(text, USER_CHAT, replyTo),
    strangerSends: (text: string) => message(text, 999),
    userPresses: (button: { callback_data: string }, messageId: number) =>
      push({ callback_query: { id: `press-${messageId}`, from: { id: USER_CHAT }, message: { message_id: messageId, chat: { id: USER_CHAT, type: "private" } }, data: button.callback_data } }),
    close: () => {
      wake?.();
      server.closeAllConnections();
      server.close();
    },
  };
};
