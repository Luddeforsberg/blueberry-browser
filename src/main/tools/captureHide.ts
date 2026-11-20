// What a capture of the page sees has no mascot in it. The page is asked to hide it and answers once the frame without
// it has been handed over, which is the frame a capture copies. It's asked every time, even where no mascot is drawn
// now, because one taken away a moment ago may still be in that frame. Captures on their way at once share one hide, a
// mascot put in the page meanwhile starts hidden, and it shows again only when the last capture is done.
export interface HidingPage {
  // Null if the page didn't answer in time.
  hide: () => Promise<unknown>;
  show: () => void;
}

export class CaptureHide {
  private capturing = 0;
  private hiding: Promise<unknown> | null = null;

  constructor(private readonly page: HidingPage) {}

  get busy(): boolean {
    return this.capturing > 0;
  }

  // Without an answer, the mascot may still be in the frame, so the capture doesn't happen.
  async around<T>(capture: () => Promise<T>): Promise<T> {
    this.capturing++;
    try {
      this.hiding ??= this.page.hide();
      if ((await this.hiding) === null) throw new Error("The page didn't take the mascot out of the picture in time");
      return await capture();
    } finally {
      if (--this.capturing === 0) {
        this.hiding = null;
        this.page.show();
      }
    }
  }
}
