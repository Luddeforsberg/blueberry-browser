import type { CDPSession } from "playwright-core";

// Pictures of a page reached over CDP as it changes, for the user's screen and nothing else. Who wants them and whether
// Chromium is sending them are kept apart, so a start the browser turned down is tried again the next time.

const QUALITY = 60;
const WIDTH = 1280;

export class CdpScreencast {
  private onFrame: ((jpeg: string) => void) | null = null;
  // Only once Chromium has said yes to a start, and until a stop is sent.
  private capturing = false;

  constructor(private readonly session: CDPSession) {
    session.on("Page.screencastFrame", ({ data, sessionId }) => {
      void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      this.onFrame?.(data);
    });
  }

  // Null stops them. Rejects if the browser wouldn't start, and the same call can then try again.
  async watch(onFrame: ((jpeg: string) => void) | null): Promise<void> {
    this.onFrame = onFrame;
    if (!onFrame) return this.stop();
    if (this.capturing) return;
    await this.session.send("Page.startScreencast", { format: "jpeg", quality: QUALITY, maxWidth: WIDTH, everyNthFrame: 1 });
    this.capturing = true;
    // Stopped while it was starting.
    if (!this.onFrame) await this.stop();
  }

  private async stop(): Promise<void> {
    if (!this.capturing) return;
    this.capturing = false;
    // Frames that still come go nowhere, so a stop that fails only costs pictures nobody sees.
    await this.session.send("Page.stopScreencast").catch(() => {});
  }

  // The page has closed, and nothing more is sent.
  end(): void {
    this.onFrame = null;
    this.capturing = false;
  }
}
