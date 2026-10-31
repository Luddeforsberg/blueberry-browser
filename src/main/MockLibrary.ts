import type { LibrarySnapshot } from "../shared/library";

// Sample content from the Paper mockups, so the screens can be built before the backend exists.
export class MockLibrary {
  snapshot(): Omit<LibrarySnapshot, "chats" | "bookmarks" | "routines"> {
    return {
      account: { name: "Sam Rivera", email: "sam@example.com" },
      pinned: [
        { id: "pin-mail", title: "Mail", url: "https://mail.google.com/" },
        { id: "pin-calendar", title: "Calendar", url: "https://calendar.google.com/" },
        { id: "pin-github", title: "GitHub", url: "https://github.com/" },
        { id: "pin-notion", title: "Notion", url: "https://www.notion.so/" },
      ],
    };
  }
}
