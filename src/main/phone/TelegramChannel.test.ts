import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { sleep, telegramApiBase } from "./TelegramChannel";

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

describe("sleep", () => {
  it("leaves no listener on the signal, whether it wakes on time or on abort", async () => {
    const polling = new AbortController();
    for (let round = 0; round < 3; round++) await sleep(1, polling.signal);
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(0);

    const waiting = sleep(60_000, polling.signal);
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(1);
    polling.abort();
    await waiting;
    expect(getEventListeners(polling.signal, "abort")).toHaveLength(0);
  });
});
