import { join } from "node:path";
import { habitProposals, habitVisits, writeBrowserHistory } from "../history";
import type { Drive } from "../driver";
import type { Feature } from "../map";
import { seen, heading, createTab, startChat, approvalCard, someChats } from "./ways";

// The new tab page and the chats.

// Asks in the chat panel beside a page on shop.example.
const askInPanel = async (drive: Drive, text: string) => {
  await createTab(drive, drive.site.url("shop.example"));
  await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
  const box = drive.chrome.getByRole("textbox", { name: /ask|Message/i }).first();
  await box.fill(text);
  await box.press("Enter");
};
export const chatFeatures: Feature[] = [
  {
    name: "new-tab",
    design: "New tab",
    layouts: "both",
    states: {
      empty: { open: (drive) => heading(drive.chrome, /Where to/) },
      "first-jobs": {
        needs: { settings: { firstJobs: ["try", "meet"] } },
        open: (drive) => drive.chrome.getByRole("region", { name: "First jobs" }).waitFor(),
      },
      // History brought in from another browser, and what the cheap model proposes from it once checked.
      suggestions: {
        needs: {
          profile: (dir, now) => writeBrowserHistory(join(dir, "browsers"), habitVisits(now)),
          env: (dir) => ({ BLUEBERRY_BROWSER_DATA: join(dir, "browsers") }),
          model: (model) => model.suggestFrom(habitProposals),
        },
        open: async (drive) => {
          await drive.chrome.evaluate(async () => {
            const [chrome] = await window.chromeAPI.browser.importSources();
            if (!chrome) throw new Error("No browser to import from");
            await window.chromeAPI.browser.importHistory(chrome.id);
            await window.chromeAPI.browser.createTab();
          });
          await drive.chrome.getByText("Want the morning news picked out by 8:15?").waitFor();
          await drive.chrome.getByText("Shall I check the cable prices again?").waitFor();
        },
      },
      "from-starters": {
        needs: { starters: true },
        open: (drive) => seen(drive.chrome, "Suggestions"),
      },
      "with-chats": {
        open: async (drive) => {
          await someChats(drive);
          await drive.chrome.evaluate(() => window.chromeAPI.browser.createTab());
          await heading(drive.chrome, /Where to/);
        },
      },
    },
  },
  {
    name: "chat",
    design: "Main chat",
    layouts: "both",
    states: {
      thinking: {
        open: async (drive) => {
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable");
          await seen(drive.chrome, "Find the cheapest USB-C cable");
        },
      },
      reply: {
        open: async (drive) => {
          drive.model.replyWith("The cheapest is the **1 m cable** for 49 kr.\n\n- 1 m, 49 kr\n- 2 m, 79 kr\n- 3 m braided, 129 kr");
          await startChat(drive, "Find the cheapest USB-C cable", { title: "Cheapest cable" });
          await seen(drive.chrome, "3 m braided, 129 kr");
        },
      },
      streaming: {
        open: async (drive) => {
          drive.model.replyWith("The cheapest is the **1 m cable** ", "for 49 kr.");
          drive.model.holdAfterFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable");
          await seen(drive.chrome, "1 m cable");
        },
      },
      // The service turned the key down, so there's no reply to say so on.
      error: {
        open: async (drive) => {
          drive.model.refuseKey("test-key");
          await startChat(drive, "Find the cheapest USB-C cable");
          await seen(drive.chrome, "The AI service turned down the key");
        },
      },
      working: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable on shop.example");
          await drive.chrome
            .getByRole("complementary", { name: /working on/ })
            .locator("img")
            .first()
            .waitFor();
        },
      },
      // Sent while it works: each waits for the reply before it.
      queued: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.holdBeforeFirstToken();
          await startChat(drive, "Find the cheapest USB-C cable on shop.example");
          const box = drive.chrome.getByRole("textbox", { name: "Message" });
          for (const words of ["Only braided ones, and under 100 kr", "Then put it in my cart"]) {
            await box.fill(words);
            await box.press("Enter");
          }
          await drive.chrome.getByRole("list", { name: "Waiting to send" }).getByText("Then put it in my cart").waitFor();
          // A third, still being written, so Stop shows beside Send.
          await box.fill("And check the reviews");
        },
      },
      approval: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/cart?item=usb-c-1m") } });
          await startChat(drive, "Put the cheapest cable in my cart");
          await approvalCard(drive.chrome);
        },
      },
      question: {
        open: async (drive) => {
          drive.model.callTools({ name: "ask_user", args: { question: "Which length do you want?", answers: ["1 m", "2 m", "3 m"] } });
          await startChat(drive, "Find me a USB-C cable");
          await seen(drive.chrome, "Which length do you want?");
        },
      },
      handoff: {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example", "/account") } });
          drive.model.callTools({ name: "hand_to_user", args: { need: "sign-in" } });
          await startChat(drive, "Check my orders on shop.example");
          await seen(drive.chrome, "Sign in on shop.example");
        },
      },
      "with-steps": {
        open: async (drive) => {
          drive.model.callTools({ name: "open_tab", args: { url: drive.site.url("shop.example") } });
          drive.model.callTools({ name: "read_page", args: {} });
          drive.model.replyWith("The cheapest on shop.example is the 1 m cable, for 49 kr.");
          await startChat(drive, "Find the cheapest USB-C cable on shop.example", { title: "Cheapest cable" });
          await seen(drive.chrome, "for 49 kr.");
          await drive.chrome.getByRole("button", { name: "Save as routine" }).waitFor();
        },
      },
    },
  },
  {
    name: "chat-panel",
    design: "Chat panel",
    layouts: "both",
    states: {
      empty: {
        open: async (drive) => {
          await createTab(drive, drive.site.url("shop.example"));
          await drive.chrome.evaluate(() => window.chromeAPI.layout.toggleChat());
          await drive.chrome
            .getByRole("textbox", { name: /ask|Message/i })
            .first()
            .waitFor();
        },
      },
      reply: {
        open: async (drive) => {
          drive.model.replyWith("This page sells USB-C cables. The cheapest is 1 m for 49 kr.");
          await askInPanel(drive, "What's the cheapest here?");
          await seen(drive.chrome, "The cheapest is 1 m for 49 kr.");
        },
      },
      thinking: {
        open: async (drive) => {
          drive.model.holdBeforeFirstToken();
          await askInPanel(drive, "What's the cheapest here?");
          await drive.chrome.getByRole("status").first().waitFor();
        },
      },
      streaming: {
        open: async (drive) => {
          drive.model.replyWith("This page sells USB-C cables. ", "The cheapest is 1 m for 49 kr.");
          drive.model.holdAfterFirstToken();
          await askInPanel(drive, "What's the cheapest here?");
          await seen(drive.chrome, "This page sells USB-C cables.");
        },
      },
      error: {
        open: async (drive) => {
          drive.model.refuseKey("test-key");
          await askInPanel(drive, "What's the cheapest here?");
          await seen(drive.chrome, "The AI service turned down the key");
        },
      },
    },
  },
];
