import { expect } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { GenerateTitle, StreamReply } from "./agent";
import type { Tab } from "../tabs/Tab";
import type { ChatThread } from "../../shared/library";

// What the tests of `Chats` share: a page, a `Chats` with it in front, and replies made up for them. Each test file mocks
// "./agent" itself, before this loads it.

export const SCREENSHOT = "data:image/png;base64,AAAA";

export const tab = (overrides: Partial<Record<"screenshot" | "getTabText", () => Promise<unknown>>> = {}) =>
  ({
    url: "https://example.com/",
    screenshot: async () => ({ toDataURL: () => SCREENSHOT }),
    getTabText: async () => "page text",
    ...overrides,
  }) as unknown as Tab;

// Waits for the reply to end, which is the last thing a run reports.
export const setup = (
  streamReply: StreamReply,
  activeTab: Tab | null = tab(),
  generateTitle: GenerateTitle = async () => null,
  openBackgroundTab: (url: string) => Tab = () => tab(),
) => {
  const store = new ChatStore(":memory:");
  const threads: ChatThread[] = [];
  const chunks: string[] = [];
  const working: Tab[][] = [];
  let listChanges = 0;
  let onEnd = () => {};
  const chats = new Chats(
    store,
    streamReply,
    generateTitle,
    {
      activeTab: () => activeTab,
      allTabs: () => (activeTab ? [activeTab] : []),
      openBackgroundTab,
      closeTab: () => true,
      actionApproval: () => "always",
    },
    {
      onChunk: (_, content) => chunks.push(content),
      onThread: (thread) => {
        threads.push(thread);
        if (thread.partial === null) onEnd();
      },
      onListChanged: () => listChanges++,
      onWorkingTabs: (tabs) => working.push([...tabs]),
    },
  );
  const replyEnded = () => new Promise<void>((resolve) => (onEnd = resolve));
  return { chats, store, threads, chunks, working, replyEnded, listChanges: () => listChanges };
};

export const replying = (...tokens: string[]): StreamReply =>
  async function* () {
    yield* tokens;
  };

export const send = (chats: Chats, chatId: string | null, text: string, seePage = true) => chats.send(chatId, text, { seePage });

// When a reply began and how long it took are saved with it, with what it said between its steps.
export const timed = (said: { after: number; text: string }[] = []) => ({ said, startedAt: expect.any(Number), took: expect.any(Number) });
