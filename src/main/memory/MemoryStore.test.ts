import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./MemoryStore";
import { MAX_FACTS_PER_MASCOT } from "../../shared/memory";
import { publicRow } from "../../shared/publishing";
import { parseMascotDraft } from "../../shared/mascots";
import { MascotStore } from "../mascots/MascotStore";
import { defined } from "../../shared/testing";

describe("MemoryStore", () => {
  const made = (
    write = async () => '{"facts":[{"text":"You want the cheapest.","site":"a.se"}]}',
    file = join(mkdtempSync(join(tmpdir(), "memory-")), "memory.json"),
  ) => ({
    file,
    store: new MemoryStore(file, {
      onChanged: () => {},
      enabled: () => true,
      hasModel: () => true,
      write,
      isClean: (text) => !text.includes("482913x"),
    }),
  });
  const offer = (store: MemoryStore, mascotId = "m", sourceId = "chat") =>
    store.propose({ sourceId, mascotId, stillWanted: () => true, said: ["hi"], routine: null, answers: [], sites: ["a.se"] });

  it("stores nothing until Remember, and then exactly what was shown, for that mascot alone", async () => {
    const { store, file } = made();
    await offer(store);
    expect(store.state.facts).toEqual([]);
    expect(() => readFileSync(file)).toThrow();
    const shown = defined(store.state.offers[0]);
    expect(store.decide(shown.id, true)).toEqual({ ok: true });
    expect(store.factsOf("m")).toMatchObject([{ text: shown.text, site: shown.site }]);
    expect(store.factsOf("other")).toEqual([]);
    expect(store.state.offers).toEqual([]);
  });

  it("forgets an offer it was told no to, and won't make it again in this session", async () => {
    const { store } = made();
    await offer(store);
    store.decide(defined(store.state.offers[0]).id, false);
    expect(store.state.facts).toEqual([]);
    await offer(store);
    expect(store.state.offers).toEqual([]);
  });

  it("drops a proposal once its moment has passed", async () => {
    const { store } = made();
    await store.propose({
      sourceId: "chat",
      mascotId: "m",
      stillWanted: () => false,
      said: [],
      routine: null,
      answers: [],
      sites: ["a.se"],
    });
    expect(store.state.offers).toEqual([]);
  });

  it("holds an edit to the same rules, and clears one mascot without touching another", async () => {
    const { store } = made();
    await offer(store);
    await offer(store, "other", "chat2");
    store.state.offers.map(({ id }) => id).forEach((id) => store.decide(id, true));
    const mine = defined(store.factsOf("m")[0]);
    expect(store.edit(mine.id, "Your password is hunter2")).toMatchObject({ ok: false });
    expect(store.edit(mine.id, "You want​ the cheapest, always.")).toEqual({ ok: true });
    expect(defined(store.factsOf("m")[0]).text).toBe("You want the cheapest, always.");
    store.clear("m");
    expect(store.factsOf("m")).toEqual([]);
    expect(store.factsOf("other")).toHaveLength(1);
  });

  it("checks what it reads from the file, and has a limit", () => {
    const file = join(mkdtempSync(join(tmpdir(), "memory-")), "memory.json");
    const bad = [
      { id: "1", mascotId: "m", text: "You want it cheap.", site: null, savedAt: 1 },
      { id: "2", mascotId: "m", text: "Your password is hunter2", site: null, savedAt: 1 },
      { id: "3", mascotId: "m", text: "You like it.", site: "not a site at all", savedAt: 1 },
      { id: 4, mascotId: "m", text: "You like it.", site: null, savedAt: 1 },
      null,
    ];
    writeFileSync(file, JSON.stringify(bad));
    expect(
      made(undefined, file)
        .store.factsOf("m")
        .map(({ id }) => id),
    ).toEqual(["1"]);
    const many = Array.from({ length: MAX_FACTS_PER_MASCOT + 1 }, (_, at) => ({
      id: `${at}`,
      mascotId: "m",
      text: "You want it cheap.",
      site: null,
      savedAt: at,
    }));
    writeFileSync(file, JSON.stringify(many));
    expect(made(undefined, file).store.factsOf("m")).toHaveLength(MAX_FACTS_PER_MASCOT);
  });
});

describe("memory and everything that copies a mascot", () => {
  const mascot = { name: "Scout", look: { palette: "lingon", accessory: "cap" }, instructions: "Find things.", sites: [], tools: [] };

  it("has no way into what's published", () => {
    const parsed = parseMascotDraft({ ...mascot, memory: ["You want the cheapest."], facts: ["You want the cheapest."] });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(Object.keys(parsed.draft)).not.toContain("memory");
    const row = publicRow(parsed.draft, { author: "Me", description: "Hi", category: "Other", example: null });
    expect(JSON.stringify(row)).not.toContain("cheapest");
  });

  it("starts empty on a copy from the Gallery, which has an id of its own", () => {
    const store = new MascotStore(join(mkdtempSync(join(tmpdir(), "mascots-")), "mascots.json"));
    const first = store.addFromGallery("entry", mascot, "A line.");
    store.delete(first.ok ? first.id : "");
    const second = store.addFromGallery("entry", mascot, "A line.");
    expect(second.ok && first.ok && second.id !== first.id).toBe(true);
  });
});

describe("forgetting while a proposal is on its way", () => {
  const waiting = (enabled: () => boolean) => {
    let answer: (text: string) => void = () => {};
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), "memory-")), "memory.json"), {
      enabled,
      hasModel: () => true,
      isClean: () => true,
      onChanged: () => {},
      write: () => new Promise<string>((resolve) => (answer = resolve)),
    } as never);
    const job = {
      sourceId: "chat",
      mascotId: "scout",
      stillWanted: () => true,
      said: ["I always want the cheapest"],
      routine: null,
      answers: [],
      sites: [],
    } as never;
    return { store, job, reply: (text: string) => answer(JSON.stringify({ facts: [{ text, site: null }] })) };
  };

  it("offers nothing once offers have been turned off", async () => {
    let on = true;
    const { store, job, reply } = waiting(() => on);
    const asking = store.propose(job);
    on = false;
    reply("You want the cheapest.");
    await asking;
    expect(store.state.offers).toEqual([]);
  });

  it("doesn't bring back what was declined while it was waiting", async () => {
    const first = waiting(() => true);
    const asking = first.store.propose(first.job);
    first.reply("You want the cheapest.");
    await asking;
    const second = first.store.propose(first.job);
    first.store.decide(defined(first.store.state.offers[0]).id, false);
    first.reply("You want the cheapest.");
    await second;
    expect(first.store.state.offers).toEqual([]);
  });

  it("offers nothing for a mascot that was cleared in the meantime", async () => {
    let answer: (reply: string) => void = () => {};
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), "memory-")), "memory.json"), {
      enabled: () => true,
      hasModel: () => true,
      isClean: () => true,
      onChanged: () => {},
      write: () => new Promise<string>((resolve) => (answer = resolve)),
    } as never);
    const job = {
      sourceId: "chat",
      mascotId: "scout",
      stillWanted: () => true,
      said: ["I like the cheapest"],
      routine: null,
      answers: [],
      sites: [],
    } as never;
    const asking = store.propose(job);
    store.clear("scout");
    answer(JSON.stringify({ facts: [{ text: "You want the cheapest.", site: null }] }));
    await asking;
    expect(store.state.offers).toEqual([]);
  });
});
