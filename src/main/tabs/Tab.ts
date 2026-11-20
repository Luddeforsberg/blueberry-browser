import type { NativeImage, WebContents, WebContentsView, WebFrameMain } from "electron";
import type { Layout, TabLoadError, TabTrouble } from "../../shared/ipc";
import { PageActor, type ActorOptions } from "../tools/PageActor";
import type { SavedWebTab } from "./Session";
import type { PageTarget } from "../tools/pageTarget";
import { NavigationLimits } from "./NavigationLimits";
import { TabPage } from "./TabPage";
import { WebPage } from "./WebPage";
import { WorkingStyle } from "./WorkingStyle";

export { TAB_WEB_PREFERENCES } from "./WebPage";

const PICTURE_QUALITY = 72;
// A job has let go of a tab with a picture on screen, and that picture gets to show the mascot leaving.
const LEAVING_MS = 720;

export interface TabEvents {
  onChange: () => void;
  onNavigate: (url: string) => void;
  // The page has reported its title or favicon.
  onDetails: () => void;
  // The tab has a view for the window to place.
  onView: (tab: Tab) => void;
  // It's no longer drawn behind the user, so it needs placing again.
  onStoppedLeaving: () => void;
  // The user clicked or typed in the page, or went back or forward in it. Berry's own input doesn't count.
  onUserInput: () => void;
  // What the mascot on this page looks like and may do, read each time so a setting reaches it straight away.
  actorOptions: () => ActorOptions;
  // The page closed itself, as a sign-in popup does when it's done.
  onClosedByPage: () => void;
}

// One tab as callers see it. Its parts do the work: `WebPage` the page in its view, `TabPage` everything Berry does to
// the page and the hold that stops it, `NavigationLimits` where a limited mascot lets the page go, and `WorkingStyle`
// the glow while Berry works there. What stays here is whether and where the tab is drawn, and its picture.
export class Tab implements PageTarget {
  readonly kind = "web";
  private _id: string;
  private _isVisible: boolean = false;
  private _berryWorking = false;
  private events: TabEvents;
  // Who is working here, if a mascot other than Berry is.
  workingMascotId: string | null = null;
  // What's drawn on the page while a job works in it.
  readonly actor: PageActor;
  private _pictureScale: number | null = null;
  private leavingTimer: NodeJS.Timeout | null = null;
  private readonly limits: NavigationLimits;
  private readonly style: WorkingStyle;
  private readonly page: TabPage;
  private readonly web: WebPage;

  constructor(id: string, url: string, events: TabEvents, restored?: SavedWebTab, popup?: { page: WebContents; opener: Tab }) {
    this._id = id;
    this.events = events;
    this.actor = new PageActor(this, events.actorOptions, () => this.web.existingView?.webContents.getZoomFactor() ?? 1);
    this.limits = new NavigationLimits(this, popup?.opener ?? null);
    this.style = new WorkingStyle(this);
    this.page = new TabPage(this, () => this.web.loadIfUnloaded());
    const owner = { tab: this, events, limits: this.limits, style: this.style, page: this.page, shouldDraw: () => this.shouldDraw };
    this.web = new WebPage(owner, url, popup);
    this.web.start(url, restored, popup);
  }

  // Where a limited mascot lets the page go.
  refusesNavigation(url: string): boolean {
    return this.limits.refusesNavigation(url);
  }
  withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    return this.limits.withNavigationLimit(allows, act);
  }
  limitFirstLoadLike(opener: Tab): void {
    this.limits.limitFirstLoadLike(opener.limits);
  }

  // The page in its view.
  get saved(): SavedWebTab {
    return this.web.saved;
  }
  forget(url?: string): void {
    this.web.forget(url);
  }
  get trouble(): TabTrouble | null {
    return this.web.trouble;
  }
  get loadError(): TabLoadError | null {
    return this.web.loadError;
  }
  get title(): string {
    return this.web.title;
  }
  get url(): string {
    return this.web.url;
  }
  get favicon(): string | null {
    return this.web.favicon;
  }
  get isLoading(): boolean {
    return this.web.isLoading;
  }
  get hasLoaded(): boolean {
    return this.web.hasLoaded;
  }
  get canGoBack(): boolean {
    return this.web.canGoBack;
  }
  get canGoForward(): boolean {
    return this.web.canGoForward;
  }
  get webContents() {
    return this.web.webContents;
  }
  get view(): WebContentsView {
    return this.web.view;
  }
  get existingView(): WebContentsView | null {
    return this.web.existingView;
  }
  loadURL(url: string): Promise<void> {
    return this.web.loadURL(url);
  }
  get backUrl(): string | null {
    return this.web.backUrl;
  }
  goBack(byAgent = false): void {
    this.web.goBack(byAgent);
  }
  goForward(): void {
    this.web.goForward();
  }
  reload(): void {
    this.web.reload();
  }
  stop(): void {
    this.web.stop();
  }

  // Everything Berry does to the page, and the hold that stops it.
  get heldForUser(): boolean {
    return this.page.heldForUser;
  }
  set heldForUser(held: boolean) {
    this.page.heldForUser = held;
  }
  get noScreenshotsUntil(): number {
    return this.page.noScreenshotsUntil;
  }
  set noScreenshotsUntil(until: number) {
    this.page.noScreenshotsUntil = until;
  }
  get mayShowCode(): boolean {
    return this.page.mayShowCode;
  }
  sendAgentInput(event: Parameters<WebContents["sendInputEvent"]>[0]): void {
    this.page.sendAgentInput(event);
  }
  sendInputWhileHeld(event: Parameters<WebContents["sendInputEvent"]>[0]): void {
    this.page.sendInputWhileHeld(event);
  }
  runInPageWhileHeld<T = unknown>(code: string): Promise<T> {
    return this.page.runInPageWhileHeld<T>(code);
  }
  screenshot(): Promise<NativeImage> {
    return this.page.screenshot();
  }
  screenshotJpeg(maxWidth: number, quality: number): Promise<Buffer | null> {
    return this.page.screenshotJpeg(maxWidth, quality);
  }
  runJs<T = unknown>(code: string): Promise<T> {
    return this.page.runJs<T>(code);
  }
  runInPage<T = unknown>(code: string): Promise<T> {
    return this.page.runInPage<T>(code);
  }
  listenInPage<T = unknown>(code: string): Promise<T> {
    return this.page.listenInPage<T>(code);
  }
  get foreignFrames(): WebFrameMain[] {
    return this.page.foreignFrames;
  }
  runInFrame<T = unknown>(frame: WebFrameMain, code: string): Promise<T> {
    return this.page.runInFrame<T>(frame, code);
  }
  settled(): Promise<void> {
    return this.page.settled();
  }
  getTabHtml(): Promise<string> {
    return this.page.getTabHtml();
  }
  getTabText(): Promise<string> {
    return this.page.getTabText();
  }
  getTextWithFrames(allowsFrame?: (origin: string) => boolean): Promise<string> {
    return this.page.getTextWithFrames(allowsFrame);
  }

  get id(): string {
    return this._id;
  }

  get berryWorking(): boolean {
    return this._berryWorking;
  }

  setBerryWorking(working: boolean): void {
    if (working === this._berryWorking) return;
    this._berryWorking = working;
    // One from an earlier stop mustn't cut this one short.
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    if (working) {
      this.style.add();
    } else {
      this.style.remove();
      this.actor.leave();
      if (this._pictureScale !== null && !this._isVisible) {
        this.leavingTimer = setTimeout(() => {
          this.leavingTimer = null;
          this.events.onStoppedLeaving();
        }, LEAVING_MS);
      }
    }
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.web.loadIfUnloaded();
    this.web.existingView?.setVisible(this.shouldDraw);
    this.actor.shown();
  }

  hide(): void {
    this._isVisible = false;
    this.web.existingView?.setVisible(false);
    if (this._pictureScale === null) this.actor.hidden();
  }

  // How much smaller the picture of this tab on the main chat is, while there is one on screen. To the mascot that's as
  // good as someone looking at the tab, with the same pacing.
  get pictureScale(): number | null {
    return this._pictureScale;
  }

  setPictureScale(scale: number | null): void {
    const was = this._pictureScale;
    this._pictureScale = scale;
    if (this._isVisible || (was === null) === (scale === null)) return;
    if (scale === null) this.actor.hidden();
    else this.actor.shown();
  }

  // A small picture of the page, with the mascot in it, for the working view in the chrome and the tab's preview card, and
  // for nothing else. Tools use `screenshot`, which is separate and keeps the mascot out. It's asked again after the
  // capture, because the user may have been handed the tab while that was on its way, and may even have finished and
  // given it back, so that counts too. `cut` keeps only the top left of the page, in that shape, as a height to width.
  async picture(width: number, cut?: number): Promise<Buffer | null> {
    const view = this.web.existingView;
    if (!view || !this.canBePictured) return null;
    const { sinceHeld } = this.page;
    const image = await this.page.fromPage(() => view.webContents.capturePage()).catch(() => null);
    if (!image || image.isEmpty() || !this.canBePictured || !sinceHeld.current) return null;
    const size = image.getSize();
    const top = cut
      ? image.crop({
          x: 0,
          y: 0,
          width: Math.min(size.width, Math.round(size.height / cut)),
          height: Math.min(size.height, Math.round(size.width * cut)),
        })
      : image;
    return top.resize({ width, quality: "good" }).toJPEG(PICTURE_QUALITY);
  }

  private get canBePictured(): boolean {
    return !this.page.heldForUser && !this.mayShowCode && !this.web.trouble && !this.web.loadError && !this.web.unloaded;
  }

  // A view that's never been shown has no width, and a hidden one doesn't draw, so pages hide their content from
  // Berry and a screenshot comes back empty. A tab Berry is working in behind the user's stays drawn, nearly all
  // outside the window, where it can't cover anything.
  get isParked(): boolean {
    return (this._berryWorking || this.isLeaving) && !this._isVisible;
  }

  // The job has ended here, and a picture of the tab is still showing the mascot on its way out.
  get isLeaving(): boolean {
    return this.leavingTimer !== null;
  }

  private get shouldDraw(): boolean {
    return (this._isVisible || this.isParked) && !this.web.trouble && !this.web.loadError;
  }

  // Hides before moving and moves before showing, so the view never crosses the page the user is looking at.
  place({ page, parkedPage }: Pick<Layout, "page" | "parkedPage">): void {
    const view = this.web.existingView;
    if (!view) return;
    const draw = this.shouldDraw;
    if (!draw) view.setVisible(false);
    view.setBounds(this.isParked ? parkedPage : page);
    if (draw) view.setVisible(true);
  }

  get zoomFactor(): number {
    return this.webContents.getZoomFactor();
  }

  destroy(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    this.web.close();
  }
}
