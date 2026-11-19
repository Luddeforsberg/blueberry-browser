import {
  firstLine,
  readingTime,
  sameAsk,
  sameDay,
  type DesktopEnded,
  type DesktopFacts,
  type DesktopResult,
  type DesktopRunning,
} from "./desktopBerryState";
import type { LibrarySnapshot } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import type { DesktopParts } from "./DesktopParts";

const MAX_RESULTS = 5;
// A result can still be seen in the stack of faces this long, and then there's nothing left to say about it.
const RESULT_LASTS_MS = 10 * 60 * 1000;
const MAX_FINISHED = 30;
// The first sentence of a reply, in two lines.
const RESULT_LENGTH = 64;

// What the jobs have done, for the drop and the tray to talk about: what came out by itself and is being announced,
// what finished today, and the facts everything it says is made from.
export class JobNews {
  results: Array<DesktopResult & { endedAt: number }> = [];
  finished: DesktopEnded[] = [];
  wasRunning = new Set<string>();
  // The result that has come out by itself, by its chat, and whether it waits for the pointer to leave to go back in.
  announcing: string | null = null;
  endsOnLeaving = false;

  announceTimer: NodeJS.Timeout | null = null;
  expiryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly d: DesktopParts) {}

  // --- What it says ---

  runningChats(library: LibrarySnapshot): Set<string> {
    return new Set(library.chats.filter(({ running }) => running).map(({ id }) => id));
  }

  forgetResult(chatId: string): void {
    this.results = this.results.filter((result) => result.chatId !== chatId);
    if (this.announcing === chatId) this.stopAnnouncing();
  }

  stopAnnouncing(): void {
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.announceTimer = null;
    this.announcing = null;
    this.endsOnLeaving = false;
  }

  // A result comes out for as long as it takes to read, and stays while the pointer is on it.
  private announce(chatId: string, text: string): void {
    this.stopAnnouncing();
    this.announcing = chatId;
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      if (this.d.drop.hovering) this.endsOnLeaving = true;
      else this.stopAnnouncing();
      this.d.publish();
    }, readingTime(text));
  }

  // Anything ending while the user is in Blueberry, they can see for themselves. It's still in the tray.
  libraryChanged(library: LibrarySnapshot): void {
    if (!this.d.window) return;
    const running = this.runningChats(library);
    const ended = [...this.wasRunning].filter((id) => !running.has(id));
    this.wasRunning = running;
    const away = !this.d.host.inFront();
    ended.forEach((chatId) => {
      const chat = this.d.host.ended(chatId);
      if (!chat) return;
      const endedAt = Date.now();
      this.finished = [
        ...this.finished.filter((each) => each.chatId !== chatId),
        { chatId, mascotId: chat.mascotId, title: chat.title, problem: chat.error, endedAt },
      ].slice(-MAX_FINISHED);
      if (!away) return;
      const text = chat.error ?? (firstLine(chat.text, RESULT_LENGTH) || "Done.");
      this.results = [
        ...this.results.filter((result) => result.chatId !== chatId),
        { chatId, mascotId: chat.mascotId, failed: chat.error !== null, text, endedAt },
      ].slice(-MAX_RESULTS);
      this.announce(chatId, text);
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(() => {
        this.expiryTimer = null;
        this.results = this.results.filter(({ endedAt: at }) => Date.now() - at < RESULT_LASTS_MS);
        this.d.publish();
      }, RESULT_LASTS_MS);
    });
    // Answered somewhere else, or changed, while it was showing here.
    const shown = this.d.composer.asking;
    if (shown && !shown.decided) {
      const live = library.needsYou.find(({ id }) => id === shown.item.id);
      if (!live || !sameAsk(shown.item.approval, live.approval)) this.d.composer.askGone();
    }
    this.d.publish();
  }

  get facts(): DesktopFacts {
    const library = this.d.host.library();
    const now = Date.now();
    const running: DesktopRunning[] = [
      ...library.chats
        .filter(({ running }) => running)
        .map(({ id, mascotId, title }) => ({ chatId: id, routineId: null, mascotId: mascotId ?? BERRY.id, title })),
      ...library.routines
        .filter(({ latestRun }) => latestRun?.status === "running")
        .map(({ id, mascotId, name, latestRun }) => ({
          chatId: null,
          routineId: id,
          mascotId: mascotId ?? BERRY.id,
          title: name,
          step: latestRun?.steps.at(-1)?.text ?? null,
          since: latestRun?.startedAt ?? null,
        })),
    ];
    return {
      needsYou: library.needsYou,
      results: this.results,
      running,
      finishedToday: this.finished.filter(({ endedAt }) => sameDay(endedAt, now)),
      chosen: this.d.composer.chosen,
      mascot: (id) => this.d.host.mascot(id),
      nameOf: ({ id }) => this.d.host.nameOf(id),
    };
  }

  // A chat's step and when it began, filled in only where they're shown.
  withProgress(job: DesktopRunning): DesktopRunning {
    return job.chatId ? { ...job, ...this.d.host.progress(job.chatId) } : job;
  }
}
