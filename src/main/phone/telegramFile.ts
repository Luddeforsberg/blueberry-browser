import { safeStorage } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";

// Where the bot's token is kept, sealed with `safeStorage`, with the bot's name and the one chat it's paired with. Only
// TelegramChannel reads or writes it.

export interface Saved {
  token: string;
  botName: string | null;
  chatId: number | null;
}

export const readTelegramFile = (file: string): Saved | null => {
  try {
    const { token, botName, chatId } = JSON.parse(readFileSync(file, "utf8"));
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

// False if it couldn't be saved.
export const writeTelegramFile = (file: string, { token, botName, chatId }: Saved): boolean => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify({ token: safeStorage.encryptString(token).toString("base64"), botName, chatId }), {
      mode: 0o600,
    });
    renameSync(temp, file);
    return true;
  } catch {
    console.error("Couldn't save the phone connection.");
    return false;
  }
};
