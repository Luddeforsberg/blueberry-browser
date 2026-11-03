import type { WebContentsView } from "electron";
import { actorCommand, ifThere, installActor, type ActorLook } from "./pageActorScript";
import type { MascotLook } from "../shared/library";

// The bird on the page. It only shows what a job is doing and when: it never decides where input goes or whether it
// happens. Every call here is a no-op unless the user can see this tab, in front of them or as the picture of it in the
// chat, so a job nobody's watching pays nothing, not even the waiting. `browserTools.ts` asks `showing` first, and takes
// the path it always took if the answer is no.

// Drawing size on screen. `.pose` is positioned from where the feet are, which is what everything here measures.
const BIRD_SIZE = 56;
// Its size in a picture of the page, which is much smaller than the page, so it's drawn larger there to still be a bird.
const BIRD_SIZE_IN_PICTURE = 42;
// How long the picture is worth updating quickly after the bird last did anything. The longest thing it does is a flight.
const LIVELY_MS = 760;
const FEET_X = 57 / 120;

// How long a page gets to answer. Being late only means the bird is out of step, so nothing ever waits on a stuck page.
const PAGE_ANSWER_MS = 400;

// Flight time grows with distance, within what a fraction of a second allows.
const FLIGHT_BASE_MS = 200;
const FLIGHT_MS_PER_PIXEL = 0.35;
const FLIGHT_MAX_MS = 520;
const ENTRY_MS = 520;
const MARKER_MS = 130;
const CARRY_MS = 240;
const LEAVE_MS = 340;
// Lets the head start down so the beak arrives with the press.
const PECK_LEAD_MS = 70;
const HOP_MS = 180;
// A first look before the read comes back, so reading is seen even when the answer is instant.
const READ_MS = 320;

// Letters arrive one tick at a time. Longer text gets bigger chunks rather than more time.
const TYPE_TICK_MS = 34;
const TYPE_MAX_MS = 1300;

// After the user's own click or key, the bird stays away this long, even in a page a job can go on reading.
const QUIET_AFTER_USER_MS = 5000;
// A job between steps is mostly waiting for the model, and that's the bird working something out.
const IDLE_AFTER_MS = 650;

export interface ActorOptions {
  // The setting: off means nothing is ever drawn in a page.
  on: boolean;
  // Show Berry off: a plain pointer, no bird.
  plain: boolean;
  // Keep Berry still, or Reduce Motion: a small marker that fades between spots.
  still: boolean;
  look: MascotLook;
  dark: boolean;
  // False if the window is minimised or hidden.
  windowShowing: boolean;
}

// Where an element is, in the top page's pixels, from `spotOf`.
export interface Spot {
  left: number;
  top: number;
  width: number;
  height: number;
  // Where a click would go.
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
  // Its label, unless it's a secret field or holds what's typed in it, so never anything the user typed.
  name?: string;
  secret?: boolean;
}

// "ask" stands where "land" would, and faces the user there until they answer.
export type Landing = "land" | "perch" | "look" | "ask";

// Where the element a waiting card is about is now, looked up again each time, since the page may have moved.
export type FindAsked = () => Promise<{ spot: Spot; ref?: string } | null>;

export const WAITING_WORDS = "Waiting for you";

interface Place {
  x: number;
  y: number;
  // 1 faces right, -1 faces left.
  turn: 1 | -1;
}

// Where the feet go. Over a short target it stands on the top edge, so it hides none of the label, and leans in to peck.
// Over a tall one, near the point. It faces into the page wherever the left side is too tight.
export const landingFor = ({ left, top, width, height, x, y, viewWidth }: Spot, kind: Landing, size = BIRD_SIZE): Place => {
  if (kind === "perch") {
    // Sat on the edge at the far end, clear of the letters coming in from the start.
    const seat = left + width - Math.min(width * 0.25, size);
    return { x: Math.max(size * 0.6, Math.min(seat, viewWidth - size * 0.6)), y: Math.max(size * 0.7, top), turn: 1 };
  }
  const reach = size * 0.42;
  const turn: 1 | -1 = x - reach - size * FEET_X < 0 ? -1 : x + reach + size * 0.6 > viewWidth && x > viewWidth / 2 ? -1 : 1;
  const edge = height <= size * 1.5 ? top + Math.min(height * 0.2, 6) : y - size * 0.3;
  return { x: x - turn * reach, y: Math.max(size * 0.9, edge), turn };
};

export const flightMs = (from: { x: number; y: number } | null, to: { x: number; y: number }): number => {
  if (!from) return ENTRY_MS;
  return Math.round(Math.min(FLIGHT_MAX_MS, FLIGHT_BASE_MS + Math.hypot(to.x - from.x, to.y - from.y) * FLIGHT_MS_PER_PIXEL));
};

// A short text one letter at a time, and a long one in as many chunks as fit, so 5000 characters take no longer than 40.
export const typingChunks = (text: string): string[] => {
  const letters = [...text];
  const size = Math.max(1, Math.ceil(letters.length / Math.floor(TYPE_MAX_MS / TYPE_TICK_MS)));
  const chunks: string[] = [];
  for (let at = 0; at < letters.length; at += size) chunks.push(letters.slice(at, at + size).join(""));
  return chunks;
};

// Not metronomic: a bit of variation between ticks, and a small pause after a word.
export const typingPauseMs = (chunk: string): number => {
  const jitter = TYPE_TICK_MS * (0.7 + Math.random() * 0.6);
  return /\s$/.test(chunk) ? jitter * 1.6 : jitter;
};

interface ActorTab {
  readonly isVisible: boolean;
  // How much smaller the picture of this tab is than the tab, while one is on screen.
  readonly pictureScale: number | null;
  readonly berryWorking: boolean;
  readonly heldForUser: boolean;
  readonly existingView: WebContentsView | null;
}

export class PageActor {
  // Where the feet are, so a flight's length is known and a new page carries on from there.
  private position: { x: number; y: number } | null = null;
  private quietUntil = 0;
  private lastTouched = 0;
  // A job has stopped to ask, so it's facing the user, not working anything out.
  private waiting = false;
  // What the waiting card is about, so the bird stands on it whenever the tab comes back into view.
  private asked: FindAsked | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private livelyUntil = 0;
  // What the line says now, for the chrome to say beside a picture, where the line itself would be too small to read.
  private _saying = "";
  // Waits to end early, because the bird has gone. What happens next is the tools' to decide.
  private readonly waits = new Set<() => void>();

  constructor(
    private readonly tab: ActorTab,
    private readonly options: () => ActorOptions,
    // Read each time, because it changes with the site.
    private readonly zoom: () => number
  ) {}

  get enabled(): boolean {
    return this.options().on;
  }

  // In a picture, and not in front of the user.
  private get pictured(): boolean {
    return !this.tab.isVisible && this.tab.pictureScale !== null;
  }

  get saying(): string {
    return this.showing ? this._saying : "";
  }

  // The bird is in the middle of something, so a picture of it needs to keep up.
  get lively(): boolean {
    return Date.now() < this.livelyUntil;
  }

  // Whether anything should be drawn right now.
  get showing(): boolean {
    const { on, windowShowing } = this.options();
    return on && windowShowing && (this.tab.isVisible || this.pictured) && this.tab.berryWorking && !this.tab.heldForUser && Date.now() >= this.quietUntil;
  }

  // Whether letters are paced and the page scrolled smoothly: not with a marker, and not where nobody's looking.
  get moving(): boolean {
    return this.showing && !this.options().still;
  }

  // Every size in the page is divided by this. It takes out the page's zoom, and in a picture, how much smaller that is.
  private get drawZoom(): number {
    const { pictureScale } = this.tab;
    const inPicture = this.pictured && pictureScale ? Math.min(1, (pictureScale * BIRD_SIZE) / BIRD_SIZE_IN_PICTURE) : 1;
    return this.zoom() * inPicture;
  }

  private get key(): string {
    const { plain, still, look, dark } = this.options();
    return [look.palette, look.accessory, plain, still, dark, this.drawZoom, this.pictured].join("/");
  }

  private get look(): ActorLook {
    const { plain, still, look, dark } = this.options();
    return { ...look, plain, still, dark, zoom: this.drawZoom, size: BIRD_SIZE, pictured: this.pictured };
  }

  private ask(code: string): Promise<unknown> {
    const contents = this.tab.existingView?.webContents;
    if (!contents || contents.isDestroyed()) return Promise.resolve(null);
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PAGE_ANSWER_MS);
    });
    // The page's own world is never involved, so a page can't answer for this.
    return Promise.race([contents.executeJavaScriptInIsolatedWorld(1000, [{ code }], true).catch(() => null), late]).finally(() => clearTimeout(timer));
  }

  // Whether the user clicked or typed in this tab since then. The tools ask this whether or not any bird is showing.
  touchedSince(time: number): boolean {
    return this.lastTouched >= time;
  }

  get touchedLately(): boolean {
    return Date.now() < this.lastTouched + QUIET_AFTER_USER_MS;
  }

  private async draw(name: string, args: { words?: string; [other: string]: unknown } = {}): Promise<boolean> {
    if (!this.showing) return false;
    if (args.words !== undefined) this._saying = args.words;
    this.livelyUntil = Date.now() + LIVELY_MS;
    this.clearIdle();
    const command = actorCommand(this.key, name, args);
    let answer = await this.ask(command);
    if (answer === "absent") {
      // The tab may have been held or touched while that was on its way, and nothing comes back after that. Whatever
      // takes the bird away is sent after anything sent here, so it's only this one that can come too late.
      if (!this.showing) return false;
      await this.ask(installActor(this.key, this.look, this.position));
      if (!this.showing) return false;
      answer = await this.ask(command);
    }
    return answer === true && this.showing;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waits.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waits.add(done);
    });
  }

  private endWaits(): void {
    [...this.waits].forEach((done) => done());
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  // Between steps. Called once a step's drawing is done.
  private idleSoon(): void {
    this.clearIdle();
    if (!this.showing || this.waiting) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.draw("pose", { name: "thinking", words: "" });
    }, IDLE_AFTER_MS);
  }

  // Flies to where it can do this. Resolves once it has landed, or at once if nobody can see it, with whether it went.
  async goTo(spot: Spot, words: string, kind: Landing, ref?: string): Promise<boolean> {
    if (!this.showing) return false;
    const asking = kind === "ask";
    // Asking never scrolls anything, so what isn't in view leaves it where it is.
    if (asking && (spot.top + spot.height < 0 || spot.top > spot.viewHeight || spot.left + spot.width < 0 || spot.left > spot.viewWidth)) return false;
    const { still, plain } = this.options();
    const unit = 1 / this.drawZoom;
    const size = (still ? 28 : BIRD_SIZE) * unit;
    // A pointer's tip is the thing that's meant to be on the point.
    const place: Place = plain && kind !== "perch" ? { x: spot.x, y: spot.y, turn: 1 } : landingFor(spot, kind, size);
    const then = kind === "perch" ? "sitting" : kind === "look" ? "looking" : asking ? "asking" : "rest";
    const far = this.position ? Math.hypot(place.x - this.position.x, place.y - this.position.y) : Infinity;
    // Already there, as after an approval, so there's nothing to fly.
    if (far < 2) {
      const posed = await this.draw("pose", { name: then, words });
      if (!asking) this.idleSoon();
      return posed;
    }
    const ms = still ? MARKER_MS : flightMs(this.position, place);
    const arc = Math.min(size, Math.hypot(place.x - (this.position?.x ?? place.x), place.y - (this.position?.y ?? place.y)) * 0.18);
    const drawn = await this.draw("go", { x: place.x, y: place.y, ms, arc, turn: place.turn, ref, words, then });
    if (!drawn) return false;
    this.position = place;
    await this.wait(ms);
    if (!asking) this.idleSoon();
    return true;
  }

  // Starts the jab, and resolves as the beak is coming down, so the press and the beak arrive together.
  async peck(x: number, y: number, clicks: 1 | 2): Promise<void> {
    if (!(await this.draw("peck", { x, y, clicks }))) return;
    await this.wait(PECK_LEAD_MS);
    this.idleSoon();
  }

  // Along with a real drag, which takes `ms`.
  carry(to: { x: number; y: number }, words: string, ms = CARRY_MS): void {
    void this.draw("carry", { ...to, ms, words }).then((drawn) => {
      if (drawn) this.position = to;
      this.idleSoon();
    });
  }

  async hop(words: string, name?: string): Promise<void> {
    if (!(await this.draw("hop", { words, name }))) return;
    await this.wait(HOP_MS);
    this.idleSoon();
  }

  // A mood and the words, with no waiting. For a load or a look at the page.
  async say(words: string, name: string): Promise<void> {
    await this.draw("pose", { name, words });
    this.idleSoon();
  }

  // A job has stopped to ask the user something. It faces them, as it does anywhere it needs a decision.
  waitingForUser(): void {
    this.waiting = true;
    void this.draw("pose", { name: "asking", words: WAITING_WORDS });
  }

  answered(): void {
    this.waiting = false;
    this.asked = null;
    this.idleSoon();
  }

  // A card is about to ask about an element. It stands there now if anyone can see it, and again whenever someone looks.
  askAbout(find: FindAsked): void {
    this.asked = find;
    void this.standOnAsked(find);
  }

  // Whether it stood on the element. Not finding it, or finding it out of view, leaves it where it is.
  private async standOnAsked(find: FindAsked): Promise<boolean> {
    if (!this.showing) return false;
    const found = await find().catch(() => null);
    if (!found || this.asked !== find) return false;
    return this.goTo(found.spot, WAITING_WORDS, "ask", found.ref);
  }

  typing(): void {
    this.clearIdle();
    void this.draw("typing");
    // Until `doneTyping`, which comes within the longest typing takes.
    this.livelyUntil = Date.now() + TYPE_MAX_MS + LIVELY_MS;
  }

  doneTyping(): void {
    this.livelyUntil = Date.now() + LIVELY_MS;
    this.idleSoon();
  }

  async read(words: string): Promise<void> {
    if (!(await this.draw("read", { words }))) return;
    await this.wait(READ_MS);
  }

  // Where a frame from another origin is on the top page. Only that: what the frame says about itself isn't asked.
  async frameSpot(origin: string): Promise<Spot | null> {
    if (!this.showing) return null;
    const found = await this.ask(actorCommand(this.key, "frameSpot", { origin }));
    if (found === "absent") {
      if (!this.showing) return null;
      await this.ask(installActor(this.key, this.look, this.position));
      return (await this.ask(actorCommand(this.key, "frameSpot", { origin }))) as Spot | null;
    }
    return found as Spot | null;
  }

  // What a capture sees has no bird in it. Anything going wrong here mustn't get in the way of the capture.
  async whileHidden<T>(capture: () => Promise<T>): Promise<T> {
    const there = (this.tab.isVisible || this.pictured) && (await this.ask(ifThere("hide")));
    try {
      return await capture();
    } finally {
      if (there) void this.ask(ifThere("show"));
    }
  }

  // The tab has come to the front in the middle of a job.
  shown(): void {
    if (!this.showing) return;
    if (!this.waiting) return void this.say("", "thinking");
    const ask = () => void this.draw("pose", { name: "asking", words: WAITING_WORDS });
    if (!this.asked) return ask();
    void this.standOnAsked(this.asked).then((stood) => {
      if (!stood && this.waiting) ask();
    });
  }

  // Gone at once, and the next look starts fresh.
  private vanish(): void {
    this.waiting = false;
    this._saying = "";
    this.clearIdle();
    this.endWaits();
    this.position = null;
    void this.ask(ifThere("remove"));
  }

  // The tab went behind something, so nothing is drawn or waited for from here.
  hidden(): void {
    // Whoever it's waiting for hasn't answered just because they looked away.
    const { waiting } = this;
    this.vanish();
    this.waiting = waiting;
  }

  // A job has let go of the tab: it finished, was stopped, or moved on.
  leave(): void {
    this.waiting = false;
    this.asked = null;
    this.clearIdle();
    this.endWaits();
    this.position = null;
    this._saying = "";
    this.livelyUntil = Date.now() + LIVELY_MS;
    if (!this.tab.isVisible && !this.pictured) return;
    void this.ask(ifThere("leave", { ms: LEAVE_MS }));
  }

  // The user clicked or typed here. Whatever happens to the job, it goes and stays away a while.
  userTouched(): void {
    this.lastTouched = Date.now();
    if (!this.options().on) return;
    this.quietUntil = this.lastTouched + QUIET_AFTER_USER_MS;
    this.vanish();
  }

  // The user has been handed this tab.
  held(): void {
    this.vanish();
  }

  // A new document has nothing in it, and it comes back where it was.
  pageReady(): void {
    if (this.showing && this.position) void this.say("", "rest");
  }

  destroyed(): void {
    this.clearIdle();
    this.endWaits();
  }
}
