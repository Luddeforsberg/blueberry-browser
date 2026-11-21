import { HANDOFF_WORDS } from "../tools/browserTools";
import { siteName } from "../../shared/sites";
import { enterCodeInTab } from "../phone/codeEntry";
import type { CodeResult } from "../phone/Phone";
import { codeEcho } from "../phone/phoneReplies";
import type { Tab } from "../tabs/Tab";
import type { CdpTab } from "../tools/CdpTab";
import type { HandoffNeed } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import type { Approvals } from "./Approvals";
import type { ChatParts, Run } from "./chatTypes";
import type { Job } from "./Jobs";

// A page may repeat a code back, in its words or its address, for as long as a job could plausibly still be there.
const REMEMBER_CODE_MS = 60 * 60 * 1000;
const CODE_REMOVED = "[code removed]";
const ADDRESS_DETAILS_REMOVED = "[address details removed]";

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

// Handing a tab to the user, a code from their phone going into it, and keeping what they leave there out of anything
// going to the model.
export class Handoffs {
  // Tabs handed to the user. Nothing reaches these, from any job. `asking` is whether a job is still waiting: one that
  // stopped waiting after the user typed there leaves the tab here, until they send it with a message or close it.
  readonly handedOver = new Map<
    string,
    { touched: boolean; asking: boolean; host: string | null; entering: boolean; codeEntered: boolean }
  >();
  // Codes sent from the phone, and until when to keep them out of anything going to the model. Memory only.
  private readonly enteredCodes = new Map<RegExp, number>();
  // Tabs that have been back from the user. A sign-in lands on an address that can carry a code or a token, and any
  // later address in that tab can too, so only the site and path of it go to the model while the tab is open.
  readonly handedBack = new Set<{ readonly id: string; readonly url: string }>();
  // Every tab ever handed to the user, by id, which outlasts the tab, so an address it reached is never kept whole.
  readonly everHandedOver = new Set<string>();
  // Query strings and fragments seen on those tabs, kept out of anything going to the model. Memory only.
  private readonly addressDetails = new Set<string>();

  private readonly runs: ChatParts["runs"];
  private readonly browser: ChatParts["browser"];
  private readonly cloud: ChatParts["cloud"];
  private readonly publishWorkingTabs: ChatParts["publishWorkingTabs"];
  private readonly wait: Approvals["wait"];
  private readonly decide: Approvals["decide"];

  constructor(parts: Pick<ChatParts, "runs" | "browser" | "cloud" | "publishWorkingTabs"> & Pick<Approvals, "wait" | "decide">) {
    this.runs = parts.runs;
    this.browser = parts.browser;
    this.cloud = parts.cloud;
    this.publishWorkingTabs = parts.publishWorkingTabs;
    this.wait = parts.wait;
    this.decide = parts.decide;
  }

  // The same as `handOver`, for a page in the cloud. The user takes the cloud tab over to sign in through the provider's
  // live view, so nothing they type comes through Blueberry, and no job reaches the page while it's held. "I'm done"
  // gives it back. Anything else gives it back only if they never took it over: if they did, it stays theirs.
  async handOverInCloud(chatId: string, run: Run, job: Job, tab: CdpTab, need: HandoffNeed): Promise<boolean> {
    if (this.handedOver.has(tab.id)) return false;
    run.handedOver = true;
    this.everHandedOver.add(tab.id);
    const wasOwn = job.own.delete(tab.id);
    job.takenOver.set(tab.id, tab.url);
    const held = { touched: false, asking: true, host: hostOf(tab.url), entering: false, codeEntered: false };
    this.handedOver.set(tab.id, held);
    const who = run.mascot.id === BERRY.id ? (this.browser.assistantName?.() ?? BERRY.name) : run.mascot.name;
    const site = siteName(tab.url);
    // A code from the phone can't be typed into a cloud page yet, so the user always does it in the page there.
    const text = need === "code" ? `${who} needs you to enter a code on ${site}` : `${who} needs you to ${HANDOFF_WORDS[need]} on ${site}`;
    let done = false;
    try {
      done = await this.wait(
        chatId,
        run,
        text,
        { handoff: { need: need === "code" ? "sign-in" : need, tabId: tab.id, site } },
        (allow) => allow,
      );
      return done;
    } finally {
      held.asking = false;
      if (done || !held.touched) {
        if (this.handedOver.delete(tab.id)) this.handedBack.add(tab);
        this.cloud?.giveBack(tab.id);
        job.takenOver.delete(tab.id);
        if (wasOwn) job.own.add(tab.id);
      }
      if (done) job.current = tab.id;
    }
  }

  // What a page might say back after a code went in.
  withoutCodes(text: string): string {
    const now = Date.now();
    let clean = text;
    this.enteredCodes.forEach((until, echo) => {
      if (until < now) this.enteredCodes.delete(echo);
      else clean = clean.replace(echo, CODE_REMOVED);
    });
    this.handedBack.forEach(({ url }) => {
      const details = url.search(/[?#]/);
      // A bare "#" or "?" holds no secret, and taking it out would mangle everything else the model reads.
      if (details !== -1 && url.length - details >= 4) this.addressDetails.add(url.slice(details));
    });
    // Longest first, as one address's query can begin with another's and the rest would be left showing.
    [...this.addressDetails]
      .sort((a, b) => b.length - a.length)
      .forEach((details) => {
        clean = clean.replaceAll(details, ADDRESS_DETAILS_REMOVED);
      });
    return clean;
  }

  // The user does what only they can in this tab, with nothing reaching it until they say they're done. "I'm done"
  // gives it back to the job. So does anything else, if they never touched it. If they did, it's theirs, and it stays
  // out of every job's reach, because Berry must not read what they left half typed.
  async handOver(chatId: string, run: Run, job: Job, tab: Tab, need: HandoffNeed): Promise<boolean | "code"> {
    // Another job got there first and only its answer may let the tab go, or the user left it half typed and it stays theirs.
    if (this.handedOver.has(tab.id)) return false;
    run.handedOver = true;
    this.everHandedOver.add(tab.id);
    const wasOwn = job.own.delete(tab.id);
    job.takenOver.set(tab.id, tab.url);
    const held = { touched: false, asking: true, host: hostOf(tab.url), entering: false, codeEntered: false };
    this.handedOver.set(tab.id, held);
    tab.heldForUser = true;
    run.tabs.delete(tab);
    this.publishWorkingTabs();
    const who = run.mascot.id === BERRY.id ? (this.browser.assistantName?.() ?? BERRY.name) : run.mascot.name;
    const site = siteName(tab.url);
    let done = false;
    try {
      const text = need === "code" ? `${who} needs a code for ${site}` : `${who} needs you to ${HANDOFF_WORDS[need]} on ${site}`;
      done = await this.wait(chatId, run, text, { handoff: { need, tabId: tab.id, site } }, (allow) => allow);
      return done && held.codeEntered ? "code" : done;
    } finally {
      held.asking = false;
      if (done || !held.touched) {
        this.letGo(tab);
        job.takenOver.delete(tab.id);
        if (wasOwn) job.own.add(tab.id);
      }
      if (done) job.current = tab.id;
    }
  }

  // A code from the user's phone goes straight into the page, and the job only hears that one went in. Everything is
  // checked here first, and the tab stays held until it's done, so no job can see any of it happen. Not reachable from
  // any tool, and the code goes no further than the page.
  async enterCode(chatId: string, approvalId: string, code: string): Promise<CodeResult> {
    const run = this.runs.get(chatId);
    const handoff = run?.approval?.id === approvalId ? run.approval.handoff : undefined;
    if (!run || handoff?.need !== "code") return "closed";
    const tab = this.browser.allTabs().find((candidate) => candidate.id === handoff.tabId);
    if (!tab) return "tab-gone";
    const held = this.handedOver.get(tab.id);
    if (!held?.asking || !tab.heldForUser) return "not-held";
    if (held.touched) return "touched";
    if (hostOf(tab.url) !== held.host) return "moved";
    if (held.entering) return "busy";
    held.entering = true;
    const until = Date.now() + REMEMBER_CODE_MS;
    const echo = codeEcho(code);
    if (echo) this.enteredCodes.set(echo, until);
    tab.noScreenshotsUntil = until;
    // Given a size and drawn while it types, like any tab a job is using behind the user's. The hold is what keeps jobs out.
    run.tabs.add(tab);
    this.publishWorkingTabs();
    const open = () => run.approval?.id === approvalId;
    try {
      const stillOurs = () => open() && !held.touched && hostOf(tab.url) === held.host;
      const result = await enterCodeInTab(tab, code, stillOurs, () => held.touched).catch(() => "no-field" as const);
      if (result === "no-field") return "no-field";
      if (result === "interrupted") return held.touched ? "touched" : open() ? "moved" : "closed";
      held.codeEntered = true;
      return this.decide(chatId, approvalId, true) ? "entered" : "closed";
    } finally {
      held.entering = false;
      run.tabs.delete(tab);
      this.publishWorkingTabs();
    }
  }

  letGo(tab: Tab): void {
    // This also runs for any page sent with a message, which was never away.
    if (this.handedOver.delete(tab.id)) this.handedBack.add(tab);
    tab.heldForUser = false;
  }
}
