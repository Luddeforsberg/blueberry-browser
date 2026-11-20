import type { ReplyMessage } from "./agent";
import { showsFrameOffLimits } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import type { ChatThreadMessage, MascotProfile } from "../../shared/library";
import { siteAllowed } from "../../shared/mascots";
import { asHistoryMessage } from "../../shared/phone";
import { fileBlocks, pageBlocks, withAttached, type PageSnapshot } from "./attachmentPrompt";
import type { ChatParts } from "./chatTypes";
import type { Handoffs } from "./Handoffs";
import type { Jobs } from "./Jobs";

// The model sees what it did earlier by notes of its steps, not by the pages themselves, which aren't saved.
export const toReplyMessage = (message: ChatThreadMessage): ReplyMessage => asHistoryMessage(message);

// The chat as the model reads it, with the pages that go with its newest message.
export class ModelMessages {
  private readonly store: ChatParts["store"];
  private readonly browser: ChatParts["browser"];
  private readonly pageAccess: ChatParts["pageAccess"];
  private readonly withoutCodes: ChatParts["withoutCodes"];
  private readonly jobs: Jobs;
  private readonly handoffs: Handoffs;

  constructor(parts: Pick<ChatParts, "store" | "browser" | "pageAccess" | "withoutCodes"> & { jobs: Jobs; handoffs: Handoffs }) {
    this.store = parts.store;
    this.browser = parts.browser;
    this.pageAccess = parts.pageAccess;
    this.withoutCodes = parts.withoutCodes;
    this.jobs = parts.jobs;
    this.handoffs = parts.handoffs;
  }

  // The page a message can go with. Not one a job has handed to the user and is waiting on, whatever they send from there.
  get activeTab(): Tab | null {
    const tab = this.browser.activeTab();
    return tab && !this.handoffs.handedOver.get(tab.id)?.asking ? tab : null;
  }

  // The chat as the model reads it. Only the newest message carries the page and the tabs attached to it, so older
  // screenshots don't go again. Files stay with the message they went with, so later questions can be about them.
  async requestMessages(chatId: string, seePage: boolean, mascot: MascotProfile, attachedTabs: readonly Tab[]): Promise<ReplyMessage[]> {
    const files = this.store.filesOf(chatId);
    const messages = (this.store.chat(chatId)?.messages ?? []).map((message, index): ReplyMessage => {
      const history = toReplyMessage(message);
      return { role: history.role, content: withAttached(history.content, (files[index] ?? []).flatMap(fileBlocks)) };
    });
    const front = seePage ? await this.readPage(mascot) : null;
    // The user may take a tab back, or another job take it up, while it's being read. Nothing read goes out then.
    const job = this.jobs.get(chatId);
    const shared = (tab: Tab) => () => !!job?.attached.has(tab.id) && !this.jobs.inOtherHands(tab.id, chatId);
    const tabs = await Promise.all(attachedTabs.map((tab) => (shared(tab)() ? this.readTab(tab, mascot, shared(tab)) : null)));
    const pages = [front, ...tabs].filter((page): page is PageSnapshot => page !== null);
    const newest = messages.at(-1);
    if (pages.length === 0 || !newest) return messages;
    return [...messages.slice(0, -1), { role: "user", content: withAttached(newest.content, pages.flatMap(pageBlocks)) }];
  }

  private readPage(mascot: MascotProfile): Promise<PageSnapshot | null> {
    const tab = this.pageAccess() ? this.activeTab : null;
    return tab ? this.readTab(tab, mascot, () => this.pageAccess()) : Promise.resolve(null);
  }

  // A tab's text and a picture of it, under the mascot's limits: off its sites nothing, and with a frame from a site it
  // isn't allowed on, no picture. `stillShared` is checked again once it's read, as may the user's say.
  private async readTab(tab: Tab, mascot: MascotProfile, stillShared: () => boolean = () => true): Promise<PageSnapshot | null> {
    // A mascot's limit covers the page that goes with a message too.
    if (!siteAllowed(tab.url, mascot.sites)) return null;
    const framedBefore = showsFrameOffLimits(tab, mascot.sites);

    const [captured, text] = await Promise.all([
      tab.mayShowCode || framedBefore
        ? null
        : tab.screenshot().then(
            (image) => image.toDataURL(),
            (error) => {
              console.error("Failed to capture screenshot:", error);
              return null;
            },
          ),
      tab.getTabText().catch((error) => {
        console.error("Failed to get page text:", error);
        return null;
      }),
    ]);
    // Checked again after the capture, so a frame that came in meanwhile doesn't go out in it.
    const framed = framedBefore || showsFrameOffLimits(tab, mascot.sites);
    const screenshot = framed ? null : captured;
    // "Can see" may have been switched off while the page was being read, or the tab handed to the user, so nothing read goes out.
    return stillShared() && !this.handoffs.handedOver.has(tab.id) && siteAllowed(tab.url, mascot.sites)
      ? {
          url: this.withoutCodes(tab.url),
          text: text === null ? null : this.withoutCodes(text),
          screenshot,
          note: framed
            ? `No picture of the page came with this, because it shows a frame from a site ${mascot.name} isn't allowed on.`
            : undefined,
        }
      : null;
  }
}
