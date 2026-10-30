import { describe, expect, it } from "vitest";
import { History } from "./History";

describe("History", () => {
  it("lists real web visits newest first, once each", () => {
    const history = new History();
    history.record("https://a.example/", "A", null, 1);
    history.record("https://b.example/", "B", null, 2);
    history.record("https://a.example/", "", null, 3);

    expect(history.recent().map((visit) => [visit.url, visit.title, visit.visitedAt])).toEqual([
      ["https://a.example/", "A", 3],
      ["https://b.example/", "B", 2],
    ]);
  });

  it("ignores internal and local pages", () => {
    const history = new History();
    history.record("blueberry://new-tab", "New tab", null);
    history.record("file:///etc/hosts", "hosts", null);

    expect(history.recent()).toEqual([]);
  });

  it("fills in the title and favicon once the page reports them", () => {
    const history = new History();
    history.record("https://a.example/", "", null);
    history.update("https://a.example/", { title: "A page", favicon: "https://a.example/icon.png" });

    expect(history.recent()[0]).toMatchObject({ title: "A page", favicon: "https://a.example/icon.png" });
  });

  it("keeps only the most recent twenty", () => {
    const history = new History();
    for (let i = 0; i < 25; i++) history.record(`https://site${i}.example/`, `${i}`, null, i);

    expect(history.recent()).toHaveLength(20);
    expect(history.recent()[0].title).toBe("24");
  });
});
