import { describe, expect, it, vi } from "vitest";
import { telegramApiBase } from "./TelegramChannel";

vi.mock("electron", () => ({ app: { isPackaged: true }, safeStorage: {} }));

const LIVE = "https://api.telegram.org";

describe("telegramApiBase", () => {
  it("only lets an unpackaged app point at this computer", () => {
    expect(telegramApiBase("http://127.0.0.1:1234/", false)).toBe("http://127.0.0.1:1234");
    expect(telegramApiBase("http://127.0.0.1:1234", true)).toBe(LIVE);
    expect(telegramApiBase("https://evil.example", false)).toBe(LIVE);
    expect(telegramApiBase("http://127.0.0.1.evil.example", false)).toBe(LIVE);
    expect(telegramApiBase("not an address", false)).toBe(LIVE);
    expect(telegramApiBase(undefined, false)).toBe(LIVE);
  });
});
