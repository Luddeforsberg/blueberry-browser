import { safeStorage } from "electron";
import { fieldsOf } from "../../shared/fields";
import { readJsonFile, saveFile, type Saved } from "../library/savedFile";

// Where the bot's token is kept, sealed with `safeStorage`, with the bot's name and the one chat it's paired with. Only
// TelegramChannel reads or writes it.

export interface SavedBot {
  token: string;
  botName: string | null;
  chatId: number | null;
}

export const readTelegramFile = (file: string): SavedBot | null => {
  try {
    const { token, botName, chatId } = fieldsOf(readJsonFile(file));
    if (typeof token !== "string" || !safeStorage.isEncryptionAvailable()) return null;
    return {
      token: safeStorage.decryptString(Buffer.from(token, "base64")),
      botName: typeof botName === "string" ? botName : null,
      chatId: typeof chatId === "number" ? chatId : null,
    };
  } catch {
    return null;
  }
};

export const writeTelegramFile = (file: string, { token, botName, chatId }: SavedBot): Saved =>
  saveFile(file, () => JSON.stringify({ token: safeStorage.encryptString(token).toString("base64"), botName, chatId }), { secret: true });
