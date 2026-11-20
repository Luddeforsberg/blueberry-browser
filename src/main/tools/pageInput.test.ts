import { describe, expect, it } from "vitest";
import { landed } from "./pageInput";

describe("how long knowing whether input arrived takes", () => {
  const timed = async (ask: () => Promise<boolean | null>) => {
    const started = Date.now();
    const arrival = await landed(ask);
    return { arrival, ms: Date.now() - started };
  };

  it("gives up on a page that never answers, by the clock", async () => {
    const { arrival, ms } = await timed(() => new Promise(() => {}));
    expect(arrival).toBe("lost");
    expect(ms).toBeLessThan(1000);
  });

  it("counts the time a slow page takes to answer each time", async () => {
    const { arrival, ms } = await timed(() => new Promise((resolve) => setTimeout(() => resolve(false), 300)));
    expect(arrival).toBe("lost");
    expect(ms).toBeLessThan(1000);
  });

  it("lands as soon as the page reports it", async () => {
    expect((await timed(async () => true)).arrival).toBe("landed");
  });
});
