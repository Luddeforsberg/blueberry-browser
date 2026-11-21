import { describeElement, spotOf } from "./pageScripts";
import type { Landing, PageActor, Spot } from "./PageActor";
import type { PageFrame, PageTarget } from "./pageTarget";
import type { HandoffNeed, MascotProfile } from "../../shared/library";
import { siteAllowed } from "../../shared/mascots";
import { cleanLine } from "../../shared/publishing";
import type { AskWhy } from "../../shared/asking";
import type { WebSearch } from "./webSearch";
import type { WebFetch } from "./webFetch";
import { because, namedSites, whyCardFor } from "./askFirst";
import { siteName, siteOf } from "../../shared/sites";
import { clipWords, heldMessage, inTrouble, NO_ACCESS, NO_CURRENT_TAB, STOPPED, takenOverMessage } from "./toolMessages";

// What every tool works through, made once per reply in `createPageTools` and handed to each group of tools: the job's
// access to its tabs, and the helpers that find a tab, reach an element and keep to what the job may do.

// A page that never finishes loading would otherwise hold its script, and the reply, forever.
const READ_TIMEOUT_MS = 10_000;

const readText = async (tab: PageTarget, allowsFrame: (origin: string) => boolean): Promise<string | null> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([tab.getTextWithFrames(allowsFrame), timeout]);
  } catch (error) {
    console.error("Failed to read a page for a tool:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export interface ElementInfo {
  role: string;
  name: string;
  // Where a link or form goes, which a page can change while the user decides.
  target: string | null;
  // Why clicking it or typing in it asks, or null if it needn't.
  clickRisk: AskWhy | null;
  typeRisk: AskWhy | null;
  // Set for a same-origin frame: where in the site this is.
  frameUrl: string | null;
  // Set for a frame from another origin, by the main process rather than the frame: the site it's really from.
  frameOrigin?: string;
}

// `T` is whatever kind of tab this job works in: the window's own, or pages in a browser in the cloud.
export interface PageToolAccess<T extends PageTarget = PageTarget> {
  activeTab: () => T | null;
  allTabs: () => T[];
  openTab: (url: string) => T | Promise<T>;
  // False if it couldn't be closed, which it can't if it's the window's last.
  closeTab: (tab: T) => boolean;
  // Whether anything `allTabs` gives is Berry's own to close. Otherwise only what these tools opened.
  ownsEveryTab?: boolean;
  // Whether this job opened the tab, in this reply or an earlier one, and the user hasn't taken it from it.
  ownsTab?: (id: string) => boolean;
  // Tabs this job opened that the user has since taken, with the address each was at. Nothing here reaches them.
  takenOver?: ReadonlyMap<string, string>;
  // Whether the user has been handed this tab and hasn't said they're done. No job can reach it, not even the one asking.
  heldByUser?: (id: string) => boolean;
  // Waits until the user says they're done with this tab, which gives it back: true. "code" if that's because a code
  // they sent from their phone went in, which never comes here itself. False if they won't, or closed it.
  handOver?: (tab: T, need: HandoffNeed) => Promise<boolean | "code">;
  // Waits for the user's answer, or null if they'd rather not. Rejects if the reply is stopped. `answers` are ones the
  // user can press instead of typing, and may be empty.
  ask: (question: string, answers: string[]) => Promise<string | null>;
  // Checked on every call, because "Can see" can be switched off while a reply runs.
  canSee: () => boolean;
  // Told about each tab a tool is about to use, so the user can see where Berry is working.
  onUse: (tab: T) => void;
  // A mascot other than Berry. It only ever takes tools and sites away. Approvals work the same either way.
  limits?: Pick<MascotProfile, "name" | "sites" | "tools"> | undefined;
  // What the user asked, in their own words, and the sites earlier replies in this chat were on. With the sites this job
  // goes to, they're where it may go without asking. Anywhere else asks in the default mode.
  asked?: string | undefined;
  beenTo?: Iterable<string> | undefined;
  // Tabs the user attached to this chat. They're the user's, so they're reached and never closed.
  attached?: (id: string) => boolean;
  // Whether this job has been stopped. A tool already running only hears of it here, and the mascot gives it time to.
  stopped?: () => boolean;
  // A web search service. Without one there's no web_search tool.
  search?: WebSearch | null;
  // A service that reads a page without a tab. Without one there's no fetch_page tool.
  fetchPage?: WebFetch | null;
}

export const toolContext = <T extends PageTarget>({
  activeTab,
  allTabs,
  openTab,
  closeTab,
  ownsEveryTab = false,
  ownsTab = () => false,
  takenOver,
  heldByUser = () => false,
  handOver = async () => false,
  ask,
  canSee,
  onUse,
  limits,
  asked = "",
  beenTo = [],
  attached = () => false,
  stopped = () => false,
  search = null,
  fetchPage = null,
}: PageToolAccess<T>) => {
  const allowed = (url: string) => !limits || siteAllowed(url, limits.sites);
  const offLimits = (url: string) => {
    const name = siteName(url);
    return {
      label: `Stayed off ${name}`,
      message: `${limits?.name} isn't allowed on ${name}, so nothing happened and nothing was read from it. It may only use ${limits?.sites.join(", ")}. Tell the user if the job needs that site.`,
    };
  };
  // A ref into a frame from another origin is `f<number>.<its ref>`. Which frame and site that means is only kept
  // here, so the frame's page can't point it anywhere else, and it dies with the frame or a change of site.
  const frameRefs = new Map<string, { frame: PageFrame; origin: string; tabId: string }>();
  const frameNames = new Map<PageFrame, string>();
  const frameName = (frame: PageFrame, tab: T) => {
    const known = frameNames.get(frame);
    if (known && frameRefs.get(known)?.origin === frame.origin) return known;
    const name = `f${frameRefs.size + 1}`;
    frameNames.set(frame, name);
    frameRefs.set(name, { frame, origin: frame.origin, tabId: tab.id });
    return name;
  };
  const frameOf = (tab: T, ref: string) => {
    const [, name] = /^(f\d+)\./.exec(ref) ?? [];
    if (!name) return null;
    const entry = frameRefs.get(name);
    const live = entry && entry.tabId === tab.id && !entry.frame.isDestroyed() && entry.frame.origin === entry.origin;
    return live ? entry : "gone";
  };
  // Runs a script for this ref wherever its element lives. Null means the element has gone.
  const onRef = async <R>(tab: T, ref: string, script: (ref: string) => string): Promise<R | null> => {
    const entry = frameOf(tab, ref);
    if (entry === "gone") return null;
    if (!entry) return tab.runInPage<R | null>(script(ref));
    return tab.runInFrame<R | null>(entry.frame, script(ref.slice(ref.indexOf(".") + 1)));
  };

  const tookOver = (id: string | undefined) => {
    if (id !== undefined && heldByUser(id)) return heldMessage(id);
    const url = id === undefined ? undefined : takenOver?.get(id);
    return id !== undefined && url !== undefined ? takenOverMessage(id, url) : null;
  };
  const find = (id?: string) => {
    const tab = id ? allTabs().find((candidate) => candidate.id === id) : activeTab();
    return tab && !takenOver?.has(tab.id) && !heldByUser(tab.id) ? tab : null;
  };
  const noTab = (id?: string) => tookOver(id ?? activeTab()?.id) ?? (id ? `There is no web page in tab ${id}.` : NO_CURRENT_TAB);
  // Where the user sent this job, and where it has been. An address only counts by its site.
  const chosen = [...namedSites(asked), ...(limits?.sites ?? [])];
  const been = new Set(beenTo);
  const usedTab = (tab: T) => {
    const site = siteOf(tab.url);
    if (site) been.add(site);
    onUse(tab);
  };
  const whyCard = whyCardFor({ asked, chosen, been });
  const site = (id?: string) => {
    const tab = canSee() ? find(id) : null;
    return tab ? siteName(tab.url) : "a tab";
  };

  // Everything these tools return is the page's words, so the system prompt tells the model not to obey them.
  const withText = async (id: string | undefined, doing: string, format: (tab: T, text: string) => string) => {
    if (!canSee()) return NO_ACCESS;
    const tab = find(id);
    if (!tab) return noTab(id);
    usedTab(tab);
    const [text] = await Promise.all([readText(tab, allowed), actorOn(tab)?.read(`${doing} ${siteName(tab.url)}`)]);
    if (!canSee()) return NO_ACCESS;
    const taken = tookOver(tab.id);
    if (taken) return taken;
    return text === null ? (inTrouble(tab) ?? `The page at ${tab.url} could not be read.`) : format(tab, text);
  };

  const withTab = async (id: string | undefined, act: (tab: T) => Promise<string>) => {
    if (!canSee()) return NO_ACCESS;
    const tab = find(id);
    if (!tab) return noTab(id);
    usedTab(tab);
    try {
      const result = await act(tab);
      return tookOver(tab.id) ?? result;
    } catch (error) {
      console.error("A page tool failed:", error);
      return canSee() ? (tookOver(tab.id) ?? inTrouble(tab) ?? `That didn't work on ${tab.url}.`) : NO_ACCESS;
    }
  };

  // The mascot, if anyone's there to see it. With none, every tool does just what it would do anyway, at the same speed.
  const actorOn = (tab: T): PageActor | null => (tab.actor?.showing ? tab.actor : null);
  const unnamed = (name: string | undefined, fallback: string) => clipWords(name) || fallback;

  // What a frame from another origin says about itself isn't believed, so its name isn't asked for, and it's only the frame's own edge.
  const spotOfRef = async (
    tab: T,
    actor: PageActor,
    ref: string,
  ): Promise<{ spot: Spot; name: string | undefined; ref?: string } | null> => {
    const entry = frameOf(tab, ref);
    if (entry === "gone") return null;
    if (entry) {
      const spot = await actor.frameSpot(entry.origin);
      return spot && { spot, name: `a frame from ${siteName(entry.origin)}` };
    }
    const spot = await tab.runInPage<Spot | null>(spotOf(ref)).catch(() => null);
    return spot && { spot, name: spot.name, ref };
  };
  // The mascot goes there first, so what's seen is what happens. Says whether to go on, since the job may have been stopped
  // or the tab taken over while it flew, and an action must not follow that.
  const flyToRef = async (tab: T, ref: string, words: (name: string | undefined) => string, kind: Landing): Promise<boolean> => {
    const actor = actorOn(tab);
    if (!actor) return true;
    const found = await spotOfRef(tab, actor, ref);
    if (found) await actor.goTo(found.spot, words(found.name), kind, found.ref);
    return carryOn(tab);
  };
  // While the card waits, it stands on what the card is about, then and whenever the user comes to look. Nothing waits
  // for this, so the card goes out as it always did.
  const standOnRef = ({ tabId: id, ref }: { tabId?: string | undefined; ref: string }) => {
    const tab = canSee() ? find(id) : null;
    const actor = tab?.actor;
    if (tab && actor) actor.askAbout(() => (canSee() && find(tab.id) === tab ? spotOfRef(tab, actor, ref) : Promise.resolve(null)));
  };
  const carryOn = (tab: T) => !stopped() && canSee() && !tookOver(tab.id);
  const leftOff = (tab: T) => tookOver(tab.id) ?? (canSee() ? STOPPED : NO_ACCESS);

  const whereNow = async (tab: T) => {
    await tab.settled();
    if (!canSee()) return NO_ACCESS;
    const trouble = inTrouble(tab);
    if (trouble) return trouble;
    if (tab.loadError) {
      return `Tab ${tab.id} couldn't load ${tab.loadError.url}: ${tab.loadError.description}. No page opened there, so don't describe one.`;
    }
    if (tab.isLoading) return `Tab ${tab.id} is still loading ${tab.url}, so it may not be ready yet.`;
    return `Done. Tab ${tab.id} is now at ${tab.url}, titled ${tab.title}.`;
  };

  const element = (id: string | undefined, ref: string) => {
    const tab = canSee() ? find(id) : null;
    if (!tab) return Promise.resolve(null);
    return describeRef(tab, ref).catch(() => null);
  };

  // A frame from another origin can answer anything here, so it's never trusted to say something is safe.
  const describeRef = async (tab: T, ref: string): Promise<ElementInfo | null> => {
    const entry = frameOf(tab, ref);
    if (!entry || entry === "gone") return onRef<ElementInfo>(tab, ref, describeElement);
    // Saying nothing or failing can't make it safe either, because the action would still reach that frame.
    const info = await onRef<ElementInfo>(tab, ref, describeElement).catch(() => null);
    const risk = because("other-origin-frame", entry.origin);
    return {
      role: "element",
      name: "unnamed",
      ...info,
      target: null,
      frameUrl: null,
      clickRisk: risk,
      typeRisk: risk,
      frameOrigin: entry.origin,
    };
  };

  const placeOf = (info: ElementInfo) => {
    if (info.frameOrigin) return ` in a frame from ${info.frameOrigin}, inside`;
    if (info.frameUrl) return ` in a frame showing ${info.frameUrl}, inside`;
    return " on";
  };

  // A page can't take the tab off-limits while this runs. If it got there anyway, what came back is the other site's.
  // A limit the browser didn't take means nothing runs at all.
  const limitedRun = async (tab: T, act: () => Promise<string>): Promise<string> => {
    let acted = false;
    const limited = await tab
      .withNavigationLimit(allowed, () => {
        acted = true;
        return act();
      })
      .catch((error: unknown) => {
        if (acted) throw error;
        console.error("A page's navigation limit couldn't be put on:", error);
        return null;
      });
    if (!limited) return `Nothing was done, because the limit on where ${limits?.name} may go couldn't be put on tab ${tab.id}.`;
    const { result, refused } = limited;
    if (!allowed(tab.url)) return `${offLimits(tab.url).message} The tab went there by itself. Don't use it again.`;
    // A picture can't carry words, and it shows where the tab stayed anyway.
    const [firstRefused] = refused;
    return firstRefused === undefined || result.startsWith("data:image/")
      ? result
      : `${result} The page tried to go to ${siteName(firstRefused)}, which ${limits?.name} isn't allowed on, so it stayed here.`;
  };

  // The name each element had when it was last described, which for an allowed call is the check just before it runs,
  // so a step can say what the user allowed. Page text, so it's only for the screen.
  const describedNames = new Map<string, string>();
  const describeOn = async (id: string | undefined, ref: string, say: (info: ElementInfo) => string) => {
    const info = await element(id, ref);
    const tab = find(id);
    if (!info || !tab) return `Act on element ${ref}, which is no longer on the page`;
    describedNames.set(`${tab.id} ${ref}`, info.name);
    return `${say(info)}${placeOf(info)} ${tab.url}${info.target ? `, which goes to ${info.target}` : ""}`;
  };
  const clickedLabel = (verb: string, id: string | undefined, ref: string) => {
    const tab = find(id);
    const name = clipWords(tab ? cleanLine(describedNames.get(`${tab.id} ${ref}`) ?? "") : undefined);
    return name && name !== "unnamed" ? `${verb} “${name}” on ${site(id)}` : null;
  };

  return {
    activeTab,
    allTabs,
    openTab,
    closeTab,
    ownsEveryTab,
    ownsTab,
    takenOver,
    heldByUser,
    handOver,
    ask,
    canSee,
    limits,
    attached,
    stopped,
    search,
    fetchPage,
    allowed,
    offLimits,
    frameName,
    frameOf,
    onRef,
    tookOver,
    find,
    noTab,
    been,
    usedTab,
    whyCard,
    site,
    withText,
    withTab,
    actorOn,
    unnamed,
    flyToRef,
    standOnRef,
    carryOn,
    leftOff,
    whereNow,
    element,
    placeOf,
    limitedRun,
    describeOn,
    clickedLabel,
  };
};

export type ToolContext<T extends PageTarget> = ReturnType<typeof toolContext<T>>;
