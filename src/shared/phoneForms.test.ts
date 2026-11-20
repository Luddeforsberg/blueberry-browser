import { describe, expect, it } from "vitest";

// The phone page's own site/app/dom.js, as the browser runs it. A form here is anything that takes submit events, as
// Enter's requestSubmit sends them.

const dom = (await import(/* @vite-ignore */ new URL("../../site/app/dom.js", import.meta.url).href)) as {
  submitsOnce: (form: EventTarget, work: () => Promise<void>) => EventTarget;
};

const submit = (form: EventTarget) => {
  const event = new Event("submit", { cancelable: true });
  form.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("a phone form's submit", () => {
  it("starts one job for Enter pressed twice while the first is on its way, and another once it's back", async () => {
    let calls = 0;
    let finish = () => {};
    const form = dom.submitsOnce(new EventTarget(), () => {
      calls++;
      return new Promise<void>((resolve) => (finish = resolve));
    });

    expect(submit(form)).toBe(true);
    expect(submit(form)).toBe(true);
    expect(calls).toBe(1);

    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    submit(form);
    expect(calls).toBe(2);
  });
});
