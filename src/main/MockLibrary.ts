import type {
  ChatThread,
  ChatThreadSummary,
  LibrarySnapshot,
} from "../shared/library";

// Sample content from the Paper mockups, so the screens can be built before the backend exists.
const now = Date.now();

const SAMPLE_CHATS: ChatThread[] = [
  {
    id: "chat-lisbon",
    title: "Long weekend in Lisbon",
    updatedAt: now,
    messages: [
      { role: "user", content: "Help me plan a long weekend in Lisbon in May. Not too touristy." },
      {
        role: "assistant",
        content:
          "Happy to. Three days is about right. I'd stay in Graça, where you get the views without quite so many tour groups.\n\n" +
          "**Friday:** Arrive, wander Graça, and have dinner at a tasca with no photos on the menu.\n\n" +
          "**Saturday:** LX Factory in the morning, then the ferry to Cacilhas for fish by the water.\n\n" +
          "**Sunday:** Campo de Ourique market, then a slow walk before your flight.",
      },
    ],
  },
];

export const MOCK_REPLY =
  "This is sample data, so I can't answer yet. Real replies arrive when Berry is connected.";

const MAX_TITLE_LENGTH = 40;

const titleFrom = (text: string): string =>
  text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;

export class MockLibrary {
  private chats: ChatThread[] = SAMPLE_CHATS.map((chat) => ({
    ...chat,
    messages: [...chat.messages],
  }));
  private chatCounter = 0;

  constructor(private readonly onChange: () => void = () => {}) {}

  snapshot(): LibrarySnapshot {
    return {
      pinned: [
        { id: "pin-mail", title: "Mail", url: "https://mail.google.com/" },
        { id: "pin-calendar", title: "Calendar", url: "https://calendar.google.com/" },
        { id: "pin-github", title: "GitHub", url: "https://github.com/" },
        { id: "pin-notion", title: "Notion", url: "https://www.notion.so/" },
      ],
      bookmarks: [
        { id: "bm-reading", title: "Reading list", url: "https://en.wikipedia.org/wiki/Jackdaw" },
        { id: "bm-supabase", title: "Supabase docs", url: "https://supabase.com/docs" },
      ],
      chats: this.chats
        .map(({ id, title, updatedAt }): ChatThreadSummary => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
      routines: [
        {
          id: "routine-flights",
          name: "Flight price watch",
          schedule: "Daily at 07:30",
          lastResult: "Yesterday: no change",
          status: "running",
        },
        {
          id: "routine-digest",
          name: "Monday digest",
          schedule: "Mondays at 08:00",
          lastResult: "Today: 2 things changed",
          status: "finished",
        },
        {
          id: "routine-invoice",
          name: "Pay the studio invoice",
          schedule: "1st of each month",
          lastResult: "Sunday: draft prepared",
          status: "needs-approval",
        },
      ],
      todaysRun: [
        { time: "07:30", text: "Searched flights from Stockholm to Lisbon", isCurrent: false },
        { time: "07:31", text: "Compared 14 fares for your May dates", isCurrent: false },
        { time: "07:32", text: "Checking the return flights", isCurrent: true },
      ],
    };
  }

  chat(id: string): ChatThread | null {
    return this.chats.find((chat) => chat.id === id) ?? null;
  }

  // Starts a chat when `chatId` is null. The reply is a fixed sample until Berry is connected.
  send(chatId: string | null, text: string): ChatThread | null {
    const message = text.trim();
    if (!message) return null;

    let chat = chatId ? this.chat(chatId) : null;
    if (!chat) {
      chat = {
        id: `chat-${++this.chatCounter}-${Date.now()}`,
        title: titleFrom(message),
        updatedAt: Date.now(),
        messages: [],
      };
      this.chats.push(chat);
    }

    chat.messages.push({ role: "user", content: message }, { role: "assistant", content: MOCK_REPLY });
    chat.updatedAt = Date.now();
    this.onChange();
    return chat;
  }
}
