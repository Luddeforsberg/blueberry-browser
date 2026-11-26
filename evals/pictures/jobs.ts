import type { InternalPage } from "../../src/shared/ipc";
import type { ChatThread } from "../../src/shared/library";
import type { Founder } from "./founderApp";

// The founder's real jobs, sent the way the chrome sends them, and the ways to wait for a moment in one.

// What she asks, in her own words. Each names its sites, so Berry goes there rather than to a search engine.
export const PROMPTS = {
  pricing:
    "Compare Jane App and Cliniko for a clinic chain with 40 physios. Use jane.app/pricing and cliniko.com/pricing, and give me the monthly cost of each.",
  hiring: "Find senior backend engineer openings in Stockholm on thehub.io, so I can benchmark our offer for the two roles we're hiring.",
  changelog:
    "Check calendly.com/release-notes and jane.app/blog for anything new on booking or payments in the last month, in a short list.",
  seedGuide:
    "Read YC's guide to seed fundraising at ycombinator.com/library/4A-a-guide-to-seed-fundraising and turn it into five rules for our seed extension.",
};

const POLL_MS = 500;

export const until = async <T>(what: string, check: () => Promise<T | null | undefined | false>, timeoutMs = 5 * 60_000): Promise<T> => {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Still waiting for ${what} after ${timeoutMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
};

export const threadOf = (founder: Founder, id: string): Promise<ChatThread | null> =>
  founder.chrome.evaluate((chat) => window.chromeAPI.library.getChat(chat), id);

const ended = (thread: ChatThread | null): boolean => !!thread && thread.partial === null && thread.messages.at(-1)?.role === "assistant";

export const tabs = (founder: Founder) => founder.chrome.evaluate(() => window.chromeAPI.browser.getTabs());

// Opens one of the app's pages in front, and closes any new tab left behind, so the sidebar shows only her tabs.
export async function openPage(founder: Founder, page: InternalPage, param?: string): Promise<void> {
  await founder.chrome.evaluate(([page, param]) => window.chromeAPI.browser.openPage(page, param ? { param } : undefined), [
    page,
    param,
  ] as const);
  for (const tab of await tabs(founder)) {
    if (tab.page === "new-tab" && !tab.isActive) await founder.chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), tab.id);
  }
}

// Sent as the new tab's box sends it, and opened in front.
export async function startChat(founder: Founder, text: string, { cloud = false } = {}): Promise<string> {
  const sent = await founder.chrome.evaluate(([text, cloud]) => window.chromeAPI.chat.send(null, text, { seePage: false, cloud }), [
    text,
    cloud,
  ] as const);
  if (!sent) throw new Error("The chat wasn't sent");
  await openPage(founder, "chat", sent.id);
  return sent.id;
}

// Nobody's there to answer, so going to a page is allowed, as she would, and anything else is refused unless the job says
// so, which Berry works around or reports. A question is skipped.
const PAGE_ONLY = /^(Open|Go to|Read) https?:\/\/\S+( in a new tab)?$/;
export const pageOnly = (text: string): boolean => PAGE_ONLY.test(text);

export const finished = (
  founder: Founder,
  id: string,
  { allow = pageOnly, timeoutMs }: { allow?: (text: string) => boolean; timeoutMs?: number } = {},
) =>
  until(
    `the reply in ${id}`,
    async () => {
      const thread = await threadOf(founder, id);
      if (thread?.error) throw new Error(thread.error);
      if (thread?.approval) {
        const yes = !thread.approval.question && allow(thread.approval.text);
        await founder.chrome.evaluate(([chat, approval, yes]) => window.chromeAPI.chat.decide(chat, approval, yes), [
          id,
          thread.approval.id,
          yes,
        ] as const);
      }
      return ended(thread);
    },
    timeoutMs,
  );

// What a job left open, as she'd close it, so the next picture's sidebar holds only her own tabs and chats.
export async function closeLeftovers(founder: Founder, before: string[]): Promise<void> {
  for (const tab of await tabs(founder)) {
    if (!before.includes(tab.id) && tab.page !== "chat")
      await founder.chrome.evaluate((id) => window.chromeAPI.browser.closeTab(id), tab.id);
  }
}

// Every restored tab loaded once, so each has its real title and icon, then the new tab in front again.
export async function loadEveryTab(founder: Founder): Promise<void> {
  const front = (await tabs(founder)).find((tab) => tab.isActive);
  for (const tab of (await tabs(founder)).filter((each) => each.url.startsWith("http"))) {
    await founder.chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), tab.id);
    await until(
      `${tab.url} to load`,
      async () => (await tabs(founder)).some((each) => each.id === tab.id && !each.isLoading && each.favicon),
      45_000,
    ).catch((error: unknown) => console.log(String(error)));
  }
  if (front) await founder.chrome.evaluate((id) => window.chromeAPI.browser.switchTab(id), front.id);
}
