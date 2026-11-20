import { describe, expect, it, vi } from "vitest";
import type { NativeImage } from "electron";
import type { Tab } from "./Tab";
import { TabPage } from "./TabPage";

// The picture for the model, taken while something happens to the tab before the capture comes back.
describe("a screenshot for the model", () => {
  const setUp = () => {
    const image = { isEmpty: () => false } as unknown as NativeImage;
    let finish = () => {};
    const tab = {
      trouble: null,
      actor: { held: () => {}, whileHidden: <T>(capture: () => Promise<T>) => capture() },
      view: {
        webContents: {
          capturePage: () =>
            new Promise<NativeImage>((resolve) => {
              finish = () => resolve(image);
            }),
        },
      },
    } as unknown as Tab;
    const page = new TabPage(tab, () => {});
    // Starts a capture, lets `meanwhile` happen while it's on its way, then lets it come back.
    const capture = async (meanwhile: () => void) => {
      const taken = page.screenshot();
      await Promise.resolve();
      meanwhile();
      finish();
      return taken;
    };
    return { page, image, capture };
  };

  it("comes back when nothing happened meanwhile", async () => {
    const { capture, image } = setUp();
    await expect(capture(() => {})).resolves.toBe(image);
  });

  it("isn't given out if the user was handed the tab and gave it back while it was taken", async () => {
    const { page, capture } = setUp();
    await expect(
      capture(() => {
        page.heldForUser = true;
        page.heldForUser = false;
      }),
    ).rejects.toThrow();
  });

  it("isn't given out if a code went in while it was taken", async () => {
    const { page, capture } = setUp();
    await expect(
      capture(() => {
        page.noScreenshotsUntil = Date.now() + 60_000;
      }),
    ).rejects.toThrow();
  });
});

describe("a screenshot whose capture never comes back", () => {
  it("gives up inside the hide, so the mascot shows again", async () => {
    vi.useFakeTimers();
    try {
      let hidden = false;
      const tab = {
        trouble: null,
        actor: {
          held: () => {},
          whileHidden: async <T>(capture: () => Promise<T>) => {
            hidden = true;
            try {
              return await capture();
            } finally {
              hidden = false;
            }
          },
        },
        view: { webContents: { capturePage: () => new Promise<NativeImage>(() => {}) } },
      } as unknown as Tab;
      const taken = new TabPage(tab, () => {}).screenshot();
      const failed = expect(taken).rejects.toThrow("stopped answering");
      await vi.advanceTimersByTimeAsync(10_000);
      await failed;
      expect(hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
