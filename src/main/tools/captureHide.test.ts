import { describe, expect, it, vi } from "vitest";
import { CaptureHide } from "./captureHide";

// A page whose answer to the hide comes when the test says.
const setUp = () => {
  let answer: (value: unknown) => void = () => {};
  const page = {
    hide: vi.fn(() => new Promise<unknown>((resolve) => (answer = resolve))),
    show: vi.fn(),
  };
  return { page, hides: new CaptureHide(page), answer: (value: unknown) => answer(value) };
};

// A capture that ends when the test says.
const capture = () => {
  let finish: () => void = () => {};
  const taken = vi.fn(() => new Promise<string>((resolve) => (finish = () => resolve("picture"))));
  return { taken, finish: () => finish() };
};

describe("a capture with the mascot out of it", () => {
  it("waits for the page's answer, which it asks for even with no mascot drawn now", async () => {
    const { page, hides, answer } = setUp();
    const { taken, finish } = capture();
    const done = hides.around(taken);
    await Promise.resolve();
    expect(taken).not.toHaveBeenCalled();
    answer(true);
    await vi.waitFor(() => expect(taken).toHaveBeenCalled());
    finish();
    await expect(done).resolves.toBe("picture");
    expect(page.hide).toHaveBeenCalledOnce();
  });

  it("doesn't capture when the page didn't answer, and still shows it again", async () => {
    const { page, hides, answer } = setUp();
    const taken = vi.fn(async () => "picture");
    const done = hides.around(taken);
    answer(null);
    await expect(done).rejects.toThrow("in time");
    expect(taken).not.toHaveBeenCalled();
    expect(page.show).toHaveBeenCalledOnce();
  });

  it("shows it again only when the last of two captures at once is done", async () => {
    const { page, hides, answer } = setUp();
    const first = capture();
    const second = capture();
    const one = hides.around(first.taken);
    const two = hides.around(second.taken);
    answer(true);
    await vi.waitFor(() => expect(second.taken).toHaveBeenCalled());
    expect(page.hide).toHaveBeenCalledOnce();
    first.finish();
    await one;
    expect(page.show).not.toHaveBeenCalled();
    second.finish();
    await two;
    expect(page.show).toHaveBeenCalledOnce();
  });

  it("is busy while a capture is on its way, so a mascot put in the page then starts hidden", async () => {
    const { hides, answer } = setUp();
    const { taken, finish } = capture();
    expect(hides.busy).toBe(false);
    const done = hides.around(taken);
    expect(hides.busy).toBe(true);
    answer(true);
    await vi.waitFor(() => expect(taken).toHaveBeenCalled());
    expect(hides.busy).toBe(true);
    finish();
    await done;
    expect(hides.busy).toBe(false);
  });

  it("hides it again for a capture after the last one ended", async () => {
    const { page, hides, answer } = setUp();
    const done = hides.around(async () => "picture");
    answer(true);
    await done;
    void hides.around(async () => "picture");
    expect(page.hide).toHaveBeenCalledTimes(2);
  });
});
